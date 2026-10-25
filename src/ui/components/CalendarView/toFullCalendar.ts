// Snapshot → FullCalendar events (TECH_SPEC §11.3). FullCalendar is render-only: its events are
// always derived from the snapshot here, never the other way round.

import type { EventInput } from '@fullcalendar/core';
import { MINUTES_PER_HOUR } from '@/shared/constants';
import { buildDayFrames, fromMinute } from '@/shared/time';
import type {
  CalendarEvent,
  Category,
  Conflict,
  Interval,
  Priority,
  Snapshot,
} from '@/shared/types';

export interface EventBlockProps {
  priority: Priority;
  category: Category;
  flexible: boolean;
  isTask: boolean;
  conflictMinutes: number; // largest overlap among the event's conflicts, 0 if none
}

const PAD_WIDTH = 2;

// PRE:  minuteOfDay is an integer 0 … 1440
// POST: returns it as 'HH:mm' for FullCalendar's businessHours (1440 gives '24:00')
export function toClockTime(minuteOfDay: number): string {
  const hours = String(Math.floor(minuteOfDay / MINUTES_PER_HOUR)).padStart(PAD_WIDTH, '0');
  const minutes = String(minuteOfDay % MINUTES_PER_HOUR).padStart(PAD_WIDTH, '0');
  return `${hours}:${minutes}`;
}

// PRE:  conflicts are the snapshot's conflicts
// POST: returns, per event id, the largest overlap minutes among its conflicts
function largestOverlaps(conflicts: readonly Conflict[]): Map<string, number> {
  const largest = new Map<string, number>();

  // INVARIANT: largest holds, for every id seen so far, its largest overlap among visited conflicts
  for (const conflict of conflicts) {
    // INVARIANT: largest also counts this conflict for the ids of the pair visited so far
    for (const id of [conflict.aId, conflict.bId]) {
      largest.set(id, Math.max(largest.get(id) ?? 0, conflict.minutes));
    }
    // POST: both ids of this conflict are counted
  }
  // POST: largest holds every conflicted event's largest overlap

  return largest;
}

// PRE:  event is an event; conflictMinutes ≥ 0; emphasised says whether it was just changed
// POST: returns its FullCalendar entry with priority / conflict / emphasis classes and the
//       props EventContent renders
function toEntry(event: CalendarEvent, conflictMinutes: number, emphasised: boolean): EventInput {
  const classNames = ['ev', `prio-${event.priority}`];
  if (conflictMinutes > 0) {
    classNames.push('is-conflict');
  }
  if (emphasised) {
    classNames.push('is-emphasised');
  }
  const extendedProps: EventBlockProps = {
    priority: event.priority,
    category: event.category,
    flexible: event.flexible,
    isTask: event.taskId !== null,
    conflictMinutes,
  };
  return {
    id: event.id,
    title: event.title,
    start: fromMinute(event.start),
    end: fromMinute(event.end),
    classNames,
    extendedProps,
  };
}

// PRE:  snapshot is the store's snapshot; activeRange is the visible range, or null before the
//       first datesSet
// POST: returns one background entry per barred slot per visible day (BR-5), labelled
function barredEntries(snapshot: Snapshot, activeRange: Interval | null): EventInput[] {
  if (activeRange === null) {
    return [];
  }
  return buildDayFrames(activeRange, snapshot.settings).flatMap((frame) =>
    frame.barred.map((slot) => ({
      id: `barred-${frame.dayStart}-${slot.label}`,
      title: slot.label,
      start: fromMinute(slot.interval.start),
      end: fromMinute(slot.interval.end),
      display: 'background',
      classNames: ['barred'],
    })),
  );
}

// PRE:  snapshot is the store's snapshot; filter lists the priorities to show (FR6);
//       emphasisIds are the events changed a moment ago
// POST: returns FullCalendar's events: every event whose priority is in filter, then the barred
//       background blocks for activeRange
export function toFullCalendar(
  snapshot: Snapshot,
  filter: readonly Priority[],
  activeRange: Interval | null,
  emphasisIds: readonly string[],
): EventInput[] {
  const overlaps = largestOverlaps(snapshot.conflicts);
  const emphasised = new Set(emphasisIds);
  const events = snapshot.events
    .filter((event) => filter.includes(event.priority))
    .map((event) => toEntry(event, overlaps.get(event.id) ?? 0, emphasised.has(event.id)));
  return [...events, ...barredEntries(snapshot, activeRange)];
}
