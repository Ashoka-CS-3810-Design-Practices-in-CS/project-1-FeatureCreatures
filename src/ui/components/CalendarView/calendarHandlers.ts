// FullCalendar callbacks as plain functions (TECH_SPEC §11.3), so tests can call them with fake
// info objects (T14). The info types below are the parts of FullCalendar's arguments they read.

import { toMinute } from '@/shared/time';
import type { AppActions } from '../../store/appStore';

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
}

export interface CalendarHandlers {
  onDrop: (info: ChangedEventInfo) => Promise<void>;
  onResize: (info: ChangedEventInfo) => Promise<void>;
  onSelect: (info: SelectInfo) => void;
  onClick: (info: ClickInfo) => void;
  onDatesSet: (info: DatesInfo) => void;
}

// PRE:  actions are the store's actions
// POST: returns FullCalendar's handlers: a drag or resize moves the event and snaps it back when
//       the engine refuses (ER5); a selection opens the create dialog; a click on an event opens
//       its edit dialog (background blocks are ignored); a date change records the visible range
export function createCalendarHandlers(
  actions: Pick<AppActions, 'moveEvent' | 'openDialog' | 'setActiveRange'>,
): CalendarHandlers {
  // PRE:  info describes a dragged or resized event
  // POST: asks the store to move it; reverts FullCalendar's copy when that fails
  async function moveOrRevert(info: ChangedEventInfo): Promise<void> {
    const { id, start, end } = info.event;
    if (start === null || end === null) {
      info.revert();
      return;
    }
    const result = await actions.moveEvent(id, { start: toMinute(start), end: toMinute(end) });
    if (!result.ok) {
      info.revert();
    }
  }

  return {
    onDrop: moveOrRevert,
    onResize: moveOrRevert,
    onSelect(info) {
      actions.openDialog({
        kind: 'event',
        mode: 'create',
        defaults: { start: toMinute(info.start), end: toMinute(info.end) },
      });
      info.view.calendar.unselect();
    },
    onClick(info) {
      if (info.event.display === 'background') {
        return;
      }
      actions.openDialog({ kind: 'event', mode: 'edit', id: info.event.id });
    },
    onDatesSet(info) {
      actions.setActiveRange({ start: toMinute(info.start), end: toMinute(info.end) });
    },
  };
}
