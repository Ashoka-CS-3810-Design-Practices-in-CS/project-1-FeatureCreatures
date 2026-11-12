// Snapshot → FullCalendar events (TECH_SPEC §11.3). FullCalendar is render-only: its events are
// always derived from the snapshot here, never the other way round.

import type { EventInput } from '@fullcalendar/core';
import { buildDayFrames, fromMinute } from '@/shared/time';
import { eventAccessibleText } from '../../format/explain';
import type {
  CalendarEvent,
  BarredOverlap,
  Conflict,
  Interval,
  Priority,
  Snapshot,
} from '@/shared/types';

export interface EventBlockProps {
  barredLabels: readonly string[];
  label: string;
  priority: Priority;
  categoryId: string;
  flexible: boolean;
  isTask: boolean;
  conflictMinutes: number; // largest overlap among the event's conflicts, 0 if none
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

// PRE:  warnings are snapshot barred overlaps
// POST: returns distinct labels per event in first-occurrence order; O(q) expected time/space
function labelsByEvent(warnings: readonly BarredOverlap[]): Map<string, Set<string>> {
  const labels = new Map<string, Set<string>>();
  // INVARIANT: labels contains each visited record's label under its event id
  for (const warning of warnings) {
    const eventLabels = labels.get(warning.eventId) ?? new Set<string>();
    eventLabels.add(warning.label);
    labels.set(warning.eventId, eventLabels);
  }
  // POST: labels contains every distinct event/label pair once
  return labels;
}

// PRE:  event is an event; conflictMinutes ≥ 0; emphasised says whether it was just changed;
//       barredLabels contains its distinct overlapping labels
// POST: returns its FullCalendar entry with priority / conflict / emphasis classes and the
//       props EventContent renders
function toEntry(
  event: CalendarEvent,
  conflictMinutes: number,
  emphasised: boolean,
  barredLabels: readonly string[],
): EventInput {
  const classNames = ['ev', `prio-${event.priority}`];
  if (conflictMinutes > 0) {
    classNames.push('is-conflict');
  }
  if (emphasised) {
    classNames.push('is-emphasised');
  }
  const extendedProps: EventBlockProps = {
    label: eventAccessibleText(event, conflictMinutes, barredLabels),
    barredLabels,
    priority: event.priority,
    categoryId: event.categoryId,
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
  const barredLabels = labelsByEvent(snapshot.barredOverlaps);
  const emphasised = new Set(emphasisIds);
  const events = snapshot.events
    .filter((event) => filter.includes(event.priority))
    .map((event) =>
      toEntry(event, overlaps.get(event.id) ?? 0, emphasised.has(event.id), [
        ...(barredLabels.get(event.id) ?? []),
      ]),
    );
  return [...events, ...barredEntries(snapshot, activeRange)];
}
