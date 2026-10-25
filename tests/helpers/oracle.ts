// Brute-force oracles for the property tests (T12, T33). They deliberately share no code with
// src/engine/algorithms, so a bug there cannot hide by also appearing here.

import type { CalendarEvent, Interval } from '@/shared/types';

export interface OracleConflict {
  key: string;
  overlap: Interval;
  minutes: number;
}

// PRE:  first and second are oracle conflicts
// POST: returns < 0, 0 or > 0 ordering them by overlap start, then key (BR-3 listing order)
function compareConflicts(first: OracleConflict, second: OracleConflict): number {
  if (first.overlap.start !== second.overlap.start) {
    return first.overlap.start - second.overlap.start;
  }
  if (first.key === second.key) {
    return 0;
  }
  return first.key < second.key ? -1 : 1;
}

// PRE:  first and second are distinct events
// POST: returns their conflict when they overlap (BR-3), otherwise null
function conflictOf(first: CalendarEvent, second: CalendarEvent): OracleConflict | null {
  const start = Math.max(first.start, second.start);
  const end = Math.min(first.end, second.end);
  if (start >= end) {
    return null;
  }
  const [smallerId, largerId] =
    first.id < second.id ? [first.id, second.id] : [second.id, first.id];
  return { key: `${smallerId}|${largerId}`, overlap: { start, end }, minutes: end - start };
}

// PRE:  events have distinct ids, in any order
// POST: returns every overlapping pair as a conflict, sorted by (overlap.start, key); O(n²)
export function bruteForceConflicts(events: CalendarEvent[]): OracleConflict[] {
  const conflicts: OracleConflict[] = [];

  // INVARIANT: 0 ≤ firstIndex ≤ events.length ∧ conflicts holds every overlapping pair (i, j)
  //            with i < firstIndex and i < j
  for (let firstIndex = 0; firstIndex < events.length; firstIndex += 1) {
    // INVARIANT: firstIndex < secondIndex ≤ events.length ∧ conflicts also holds every overlapping
    //            pair (firstIndex, j) with j < secondIndex
    for (let secondIndex = firstIndex + 1; secondIndex < events.length; secondIndex += 1) {
      const conflict = conflictOf(
        events[firstIndex] as CalendarEvent,
        events[secondIndex] as CalendarEvent,
      );
      if (conflict !== null) {
        conflicts.push(conflict);
      }
    }
    // POST: conflicts holds every overlapping pair (firstIndex, j) with j > firstIndex
  }
  // POST: conflicts holds every overlapping pair exactly once

  return conflicts.toSorted(compareConflicts);
}

// PRE:  minute is an integer; events are intervals; bufferMin ≥ 0
// POST: returns true iff minute lies in [event.start − bufferMin, event.end + bufferMin) for some event
function isBusy(minute: number, events: readonly Interval[], bufferMin: number): boolean {
  return events.some(
    (event) => event.start - bufferMin <= minute && minute < event.end + bufferMin,
  );
}

// PRE:  segments are sorted, disjoint intervals; events are intervals; bufferMin ≥ 0
// POST: returns, in order, every maximal run of free minutes inside a single segment, where a minute
//       is free iff no event expanded by bufferMin covers it (BR-6), checked one minute at a time
export function bitmapGaps(
  segments: Interval[],
  events: Interval[],
  bufferMin: number,
): Interval[] {
  const gaps: Interval[] = [];

  // INVARIANT: gaps holds, in order, the free runs of every segment visited so far
  for (const segment of segments) {
    let runStart: number | null = null;

    // INVARIANT: guard:    segment.start ≤ minute ≤ segment.end
    //            behavior: gaps holds this segment's free runs that end before minute; runStart is
    //                      the start of the free run containing minute − 1, or null if that minute is busy
    for (let minute = segment.start; minute < segment.end; minute += 1) {
      const free = !isBusy(minute, events, bufferMin);
      if (free && runStart === null) {
        runStart = minute;
      } else if (!free && runStart !== null) {
        gaps.push({ start: runStart, end: minute });
        runStart = null;
      }
    }
    // POST: every free run of segment is in gaps except one still open at segment.end

    if (runStart !== null) {
      gaps.push({ start: runStart, end: segment.end });
    }
  }
  // POST: gaps holds every free run of every segment, in order

  return gaps;
}
