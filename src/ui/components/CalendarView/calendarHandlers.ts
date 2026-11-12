// FullCalendar callbacks as plain functions (TECH_SPEC §11.3), so tests can call them with fake
// info objects (T14). The info types below are the parts of FullCalendar's arguments they read.

import { CLICK_EVENT_MIN, SNAP_MIN } from '@/shared/constants';
import { toMinute } from '@/shared/time';
import type { AppActions, ViewType } from '../../store/appStore';

export interface ChangedEventInfo {
  event: { id: string; start: Date | null; end: Date | null };
  revert: () => void;
}

export interface SelectInfo {
  start: Date;
  end: Date;
  view: { calendar: { unselect: () => void } };
}

export interface ClickInfo {
  event: { id: string; display: string };
}

export interface DatesInfo {
  start: Date;
  end: Date;
  view: { type: string; currentStart: Date }; // currentStart: the first day of the shown period
}

export interface CalendarHandlers {
  onDrop: (info: ChangedEventInfo) => Promise<void>;
  onResize: (info: ChangedEventInfo) => Promise<void>;
  onSelect: (info: SelectInfo) => void;
  onClick: (info: ClickInfo) => void;
  onDatesSet: (info: DatesInfo) => void;
}

// PRE:  actions are the store's actions; isLocked reads the latest session lock
// POST: returns FullCalendar's handlers: a drag or resize goes through actions.dragEvent (a
//       fixed event asks first, WI-42) and snaps back when refused (ER5); a selection opens the create dialog for its times (a plain click,
//       which selects one SNAP_MIN step, gets CLICK_EVENT_MIN instead); a click on an event opens
//       its edit dialog (background blocks are ignored); a date change records the view, its
//       period start and the visible range; locked gestures are reverted/cleared without mutation
export function createCalendarHandlers(
  actions: Pick<AppActions, 'dragEvent' | 'openDialog' | 'setActiveRange' | 'setView'>,
  isLocked: () => boolean = () => false,
): CalendarHandlers {
  // PRE:  info describes a dragged or resized event
  // POST: hands it to actions.dragEvent with FullCalendar's revert; reverts at once when
  //       FullCalendar reports it without both ends
  async function moveOrRevert(info: ChangedEventInfo): Promise<void> {
    if (isLocked()) {
      info.revert();
      return;
    }
    const { id, start, end } = info.event;
    if (start === null || end === null) {
      info.revert();
      return;
    }
    await actions.dragEvent(id, { start: toMinute(start), end: toMinute(end) }, info.revert);
  }

  return {
    onDrop: moveOrRevert,
    onResize: moveOrRevert,
    onSelect(info) {
      if (isLocked()) {
        info.view.calendar.unselect();
        return;
      }
      const start = toMinute(info.start);
      const selectedEnd = toMinute(info.end);
      const end = selectedEnd - start <= SNAP_MIN ? start + CLICK_EVENT_MIN : selectedEnd;
      actions.openDialog({ kind: 'event', mode: 'create', defaults: { start, end } });
      info.view.calendar.unselect();
    },
    onClick(info) {
      if (info.event.display === 'background') {
        return;
      }
      actions.openDialog({ kind: 'event', mode: 'edit', id: info.event.id });
    },
    onDatesSet(info) {
      // The calendar only ever switches between the four ViewType views.
      actions.setView(info.view.type as ViewType, toMinute(info.view.currentStart));
      actions.setActiveRange({ start: toMinute(info.start), end: toMinute(info.end) });
    },
  };
}
