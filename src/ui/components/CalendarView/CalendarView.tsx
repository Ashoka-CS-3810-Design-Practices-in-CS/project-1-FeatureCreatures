import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMemo, useRef, type RefObject } from 'react';
import { fromMinute } from '@/shared/time';
import { MIN_CLICK_TARGET_PX } from '@/shared/constants';
import type { Interval, Priority, Snapshot } from '@/shared/types';
import { ALL_HIDDEN_BY_FILTER_TEXT } from '../../format/explain';
import { useAppStore, useAppStoreApi } from '../../store/appStore';
import { useCalendarPan } from '../../hooks/useCalendarPan';
import { eventIsVisible } from '../../store/selectors';
import { createCalendarHandlers } from './calendarHandlers';
import { toClockTime } from '../../format/time';
import { renderEventContent } from './renderEventContent';
import { toFullCalendar } from './toFullCalendar';
import { nowGuideEntries } from './nowGuides';

const PLUGINS = [timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin];
const TWENTY_FOUR_HOUR = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONDAY = 1;
const NO_EVENTS_TEXT = 'No events to display'; // FullCalendar's own List text

// PRE:  snapshot is the current snapshot; filter is the priority filter; hiddenCategoryIds lists hidden
//       categories; range is the shown range (null before FullCalendar reports it)
// POST: returns whether the filter hides at least one event that intersects range
function filterHidesEventsIn(
  snapshot: Snapshot,
  filter: readonly Priority[],
  range: Interval | null,
  hiddenCategoryIds: readonly string[],
): boolean {
  return snapshot.events.some(
    (event) =>
      !eventIsVisible(event, filter, hiddenCategoryIds) &&
      (range === null || (event.start < range.end && event.end > range.start)),
  );
}

// PRE:  onShowAll resets both filters; categoriesHidden says whether the category filter is active
// POST: tells why List is empty when filters hide every event of its range, with a
//       Show all button (WI-44, report #10)
function HiddenByFilterNotice({
  onShowAll,
  categoriesHidden,
}: {
  onShowAll: () => void;
  categoriesHidden: boolean;
}) {
  return (
    <span className="list-hidden-notice">
      {categoriesHidden
        ? 'All events in this range are hidden by the calendar filters'
        : ALL_HIDDEN_BY_FILTER_TEXT}{' '}
      <button type="button" onClick={onShowAll}>
        Show all
      </button>
    </span>
  );
}

// PRE:  rendered under StoreProvider; reads currentMinute, snapshot (events, conflicts, settings), view,
//       eventPriorityFilter, hiddenCategoryIds and emphasisIds; uses actions.moveEvent / openDialog / setActiveRange / setView;
//       calendarRef receives the FullCalendar instance (the toolbar and shortcuts drive it)
//       + additional props from: EventContent (via renderEventContent), HiddenByFilterNotice
// POST: shows the calendar as a controlled, render-only FullCalendar (TECH_SPEC §11.3): its events
//       always come from the snapshot; drags, resizes, selections and clicks go to the store; an
//       empty List explains when filters hide its events; raw currentMinute drives past styling
//       and a decorative wall-clock guide on every time-grid day
export function CalendarView({ calendarRef }: { calendarRef: RefObject<FullCalendar | null> }) {
  const snapshot = useAppStore((state) => state.snapshot);
  const now = useAppStore((state) => state.currentMinute);
  const view = useAppStore((state) => state.view);
  const filter = useAppStore((state) => state.eventPriorityFilter);
  const hiddenCategories = useAppStore((state) => state.hiddenCategoryIds);
  const emphasisIds = useAppStore((state) => state.emphasisIds);
  const actions = useAppStore((state) => state.actions);
  const locked = useAppStore((state) => state.calendarLocked);
  const store = useAppStoreApi();
  const rootRef = useRef<HTMLDivElement>(null);
  useCalendarPan(rootRef, locked);

  const handlers = useMemo(
    () => createCalendarHandlers(actions, () => store.getState().calendarLocked),
    [actions, store],
  );
  // The snapshot is replaced on every change, so it is the right memo key for its events.
  const events = useMemo(
    () => [
      ...toFullCalendar(snapshot, filter, view.activeRange, emphasisIds, now, hiddenCategories),
      ...nowGuideEntries(view.activeRange, now),
    ],
    [snapshot, filter, view.activeRange, emphasisIds, hiddenCategories, now],
  );
  const { workDays, workStartMin, workEndMin } = snapshot.settings;
  const hiddenByFilter = filterHidesEventsIn(snapshot, filter, view.activeRange, hiddenCategories);

  return (
    <div ref={rootRef} className="calendar-surface">
      <FullCalendar
        ref={calendarRef}
        plugins={PLUGINS}
        initialView={view.type}
        initialDate={fromMinute(view.date)}
        firstDay={MONDAY}
        headerToolbar={false}
        views={{
          // Separate spans let the week header set the date numeral large; the text stays "Mon 2".
          timeGrid: {
            dayHeaderContent: ({ date }) => (
              <>
                <span className="day-name">{WEEKDAY.format(date)}</span>{' '}
                <span className="day-number">{date.getDate()}</span>
              </>
            ),
          },
        }}
        allDaySlot={false}
        height="100%"
        slotDuration="00:30:00"
        snapDuration="00:05:00"
        scrollTime="08:00:00"
        nowIndicator
        now={fromMinute(now)}
        slotLabelFormat={TWENTY_FOUR_HOUR}
        eventTimeFormat={TWENTY_FOUR_HOUR}
        editable={!locked}
        selectable={!locked}
        selectMirror
        eventOverlap
        eventMinHeight={MIN_CLICK_TARGET_PX}
        businessHours={{
          daysOfWeek: [...workDays],
          startTime: toClockTime(workStartMin),
          endTime: toClockTime(workEndMin),
        }}
        events={events}
        noEventsContent={() =>
          hiddenByFilter ? (
            <HiddenByFilterNotice
              onShowAll={actions.showAllEventPriorities}
              categoriesHidden={hiddenCategories.length > 0}
            />
          ) : (
            NO_EVENTS_TEXT
          )
        }
        eventContent={(arg) =>
          renderEventContent(arg, (id) => actions.openDialog({ kind: 'event', mode: 'edit', id }))
        }
        eventDrop={(info) => void handlers.onDrop(info)}
        eventResize={(info) => void handlers.onResize(info)}
        select={handlers.onSelect}
        eventClick={handlers.onClick}
        datesSet={handlers.onDatesSet}
      />
    </div>
  );
}
