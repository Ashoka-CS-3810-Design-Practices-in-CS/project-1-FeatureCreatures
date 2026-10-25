// Conflict detection by a sweep over start-sorted events (TECH_SPEC §8.4, FR4, BR-3).

import type { CalendarEvent, Conflict, Interval } from '@/shared/types';
import { overlaps } from './interval';
import { MinHeap } from './minHeap';
import { compareIds } from './sortedArray';
import { chooseTarget } from './target';

// PRE:  earlier and later are distinct events with earlier.start ≤ later.start < earlier.end
// POST: returns their conflict: key "<smallerId>|<largerId>", aId < bId, overlap
//       [later.start, min(earlier.end, later.end)), its minutes, and the BR-10 target
function conflictBetween(earlier: CalendarEvent, later: CalendarEvent): Conflict {
  // later.start is the larger start because the sweep visits events by start.
  const overlap: Interval = { start: later.start, end: Math.min(earlier.end, later.end) };
  const [aId, bId] = earlier.id < later.id ? [earlier.id, later.id] : [later.id, earlier.id];
  return {
    key: `${aId}|${bId}`,
    aId,
    bId,
    overlap,
    minutes: overlap.end - overlap.start,
    targetId: chooseTarget(earlier, later),
  };
}

// PRE:  first and second are conflicts
// POST: returns < 0, 0 or > 0 ordering them by overlap.start, then key (BR-3 listing order)
function compareConflicts(first: Conflict, second: Conflict): number {
  if (first.overlap.start !== second.overlap.start) {
    return first.overlap.start - second.overlap.start;
  }
  return compareIds(first.key, second.key);
}

// PRE:  sorted is sorted by compareEvents; ids are distinct; every event has start < end
// POST: returns every pair of overlapping events exactly once as a Conflict, sorted by
//       (overlap.start, key); sorted is not mutated; O(N log N + k log k) time, O(N + k) space
export function detectConflicts(sorted: readonly CalendarEvent[]): Conflict[] {
  const open = new MinHeap<CalendarEvent>((event) => event.end);
  const conflicts: Conflict[] = [];

  // INVARIANT: open holds exactly the visited events whose end is after the start of the event
  //            being visited ∧ conflicts holds every overlapping pair of visited events, once each
  for (const event of sorted) {
    // INVARIANT: open still holds every visited event with end > event.start (half-open: touching ≠ overlap)
    while (open.size > 0 && (open.peek() as CalendarEvent).end <= event.start) {
      open.pop();
    }
    // POST: open holds exactly the visited events with start ≤ event.start < end

    // INVARIANT: conflicts holds the pairs (earlier, event) for every earlier visited so far in open
    for (const earlier of open.items()) {
      conflicts.push(conflictBetween(earlier, event));
    }
    // POST: every overlapping pair whose later-starting member is event is in conflicts

    open.push(event);
  }
  // POST: conflicts holds every overlapping pair of sorted exactly once

  return conflicts.toSorted(compareConflicts);
}

// PRE:  candidate is an interval with start < end; events are intervals, in any order
// POST: returns how many events overlap candidate (BR-2); O(n). Used by the drag preview (§11.3)
export function countOverlaps(candidate: Interval, events: readonly Interval[]): number {
  return events.filter((event) => overlaps(candidate, event)).length;
}
