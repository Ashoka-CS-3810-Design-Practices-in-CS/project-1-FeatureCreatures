// Sorted-array helpers for the event list (TECH_SPEC §8.2). Events stay sorted by compareEvents.

import { MAX_EVENT_MIN } from '@/shared/constants';
import type { CalendarEvent, Interval } from '@/shared/types';

// PRE:  first and second are strings
// POST: returns < 0, 0 or > 0 as first sorts before, equal to or after second by code units
//       (ids and conflict keys use this order, never the locale)
export function compareIds(first: string, second: string): number {
  if (first < second) {
    return -1;
  }
  return first > second ? 1 : 0;
}

// PRE:  first and second are events
// POST: returns < 0, 0 or > 0 ordering them by start, then end, then id
export function compareEvents(first: CalendarEvent, second: CalendarEvent): number {
  if (first.start !== second.start) {
    return first.start - second.start;
  }
  if (first.end !== second.end) {
    return first.end - second.end;
  }
  return compareIds(first.id, second.id);
}

/** First index i in [0, arr.length] where pred(arr[i]) is true; pred must be monotone (false…false true…true). */
// PRE:  predicate is monotone over items (false … false true … true)
// POST: returns the smallest index with predicate(items[index]) true, or items.length if none; O(log n)
export function lowerBound<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  let low = 0;
  let high = items.length;

  // INVARIANT: guard:    0 ≤ low ≤ high ≤ items.length
  //            behavior: (∀ k < low: ¬predicate(items[k])) ∧ (∀ k ≥ high: predicate(items[k]))
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    // middle < high ≤ items.length, so the element exists.
    if (predicate(items[middle] as T)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  // POST: low = high is the first index where predicate holds (items.length if none)

  return low;
}

// PRE:  events is sorted by compareEvents
// POST: returns a new sorted array with event added after any equal events; events is unchanged;
//       O(log n + n)
export function insertSorted(
  events: readonly CalendarEvent[],
  event: CalendarEvent,
): CalendarEvent[] {
  const index = lowerBound(events, (other) => compareEvents(other, event) > 0);
  return [...events.slice(0, index), event, ...events.slice(index)];
}

// PRE:  items is an array of records with an id
// POST: returns a new array without the items whose id equals id; items is unchanged; O(n)
export function removeById<T extends { id: string }>(items: readonly T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

/** Events with e.start < w.end && e.end > w.start. Relies on BR-4 (duration ≤ MAX_EVENT_MIN). O(log n + n_w). */
// PRE:  events is sorted by compareEvents; every event lasts at most MAX_EVENT_MIN (BR-4)
// POST: returns, in order, the events with event.start < window.end ∧ event.end > window.start
export function eventsIntersecting(
  events: readonly CalendarEvent[],
  window: Interval,
): CalendarEvent[] {
  // No event longer than MAX_EVENT_MIN exists, so nothing starting earlier than this can reach the window.
  const firstCandidate = lowerBound(events, (event) => event.start >= window.start - MAX_EVENT_MIN);
  const pastWindow = lowerBound(events, (event) => event.start >= window.end);
  return events.slice(firstCandidate, pastWindow).filter((event) => event.end > window.start);
}
