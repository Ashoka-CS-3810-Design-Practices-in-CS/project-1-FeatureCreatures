import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMemo, type RefObject } from 'react';
import { fromMinute } from '@/shared/time';
import { useAppStore } from '../../store/appStore';
import { createCalendarHandlers } from './calendarHandlers';
import { EventContent } from './EventContent';
import { toClockTime } from '../../format/time';
import { toFullCalendar, type EventBlockProps } from './toFullCalendar';

const PLUGINS = [timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin];
const TWENTY_FOUR_HOUR = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
const DAY_HEADER = { weekday: 'short', day: 'numeric' } as const; // "Mon 2", as in Figure 1
const MONDAY = 1;

// PRE:  rendered under StoreProvider; reads snapshot (events, conflicts, settings), view,
//       eventPriorityFilter and emphasisIds; uses actions.moveEvent / openDialog / setActiveRange / setView;
//       calendarRef receives the FullCalendar instance (the toolbar and shortcuts drive it)
//       + additional props from: EventContent
// POST: shows the calendar as a controlled, render-only FullCalendar (TECH_SPEC §11.3): its events
//       always come from the snapshot; drags, resizes, selections and clicks go to the store
export function CalendarView({ calendarRef }: { calendarRef: RefObject<FullCalendar | null> }) {
  const snapshot = useAppStore((state) => state.snapshot);
  const view = useAppStore((state) => state.view);
  const filter = useAppStore((state) => state.eventPriorityFilter);
  const emphasisIds = useAppStore((state) => state.emphasisIds);
  const actions = useAppStore((state) => state.actions);

  const handlers = useMemo(() => createCalendarHandlers(actions), [actions]);
  // The snapshot is replaced on every change, so it is the right memo key for its events.
  const events = useMemo(
    () => toFullCalendar(snapshot, filter, view.activeRange, emphasisIds),
    [snapshot, filter, view.activeRange, emphasisIds],
  );
  const { workDays, workStartMin, workEndMin } = snapshot.settings;

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={PLUGINS}
      initialView={view.type}
      initialDate={fromMinute(view.date)}
      firstDay={MONDAY}
      headerToolbar={false}
      dayHeaderFormat={DAY_HEADER}
      allDaySlot={false}
      height="100%"
      slotDuration="00:30:00"
      snapDuration="00:05:00"
      scrollTime="08:00:00"
      nowIndicator
      slotLabelFormat={TWENTY_FOUR_HOUR}
      eventTimeFormat={TWENTY_FOUR_HOUR}
      editable
      selectable
      selectMirror
      eventOverlap
      businessHours={{
        daysOfWeek: [...workDays],
        startTime: toClockTime(workStartMin),
        endTime: toClockTime(workEndMin),
      }}
      events={events}
      eventContent={(arg) =>
        // Barred-slot backgrounds carry no event props; they only show their label.
        arg.event.display === 'background' ? (
          <span className="barred-label">{arg.event.title}</span>
        ) : (
          <EventContent
            {...(arg.event.extendedProps as EventBlockProps)}
            title={arg.event.title}
            timeText={arg.timeText}
          />
        )
      }
      eventDrop={(info) => void handlers.onDrop(info)}
      eventResize={(info) => void handlers.onResize(info)}
      select={handlers.onSelect}
      eventClick={handlers.onClick}
      datesSet={handlers.onDatesSet}
    />
  );
}
