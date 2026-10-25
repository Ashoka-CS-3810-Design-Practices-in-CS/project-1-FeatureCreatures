// Busy blocks: buffered events merged into disjoint, non-touching intervals (TECH_SPEC §8.5, BR-6).

import type { BusyBlock, CalendarEvent } from '@/shared/types';

// PRE:  event is an event; bufferMin ≥ 0
// POST: returns a block holding only event, expanded by bufferMin on both sides
function blockOf(event: CalendarEvent, bufferMin: number): BusyBlock {
  return {
    start: event.start - bufferMin,
    end: event.end + bufferMin,
    startEvent: { id: event.id, title: event.title, start: event.start },
    endEvent: { id: event.id, title: event.title, end: event.end },
  };
}

// PRE:  sortedEvents is sorted by compareEvents; bufferMin is an integer ≥ 0
// POST: returns the union of [event.start − bufferMin, event.end + bufferMin) over sortedEvents as
//       sorted blocks that neither overlap nor touch; each block's startEvent / endEvent is the event
//       whose buffered start / end bounds it (first such event on ties); inputs are not mutated; O(n)
export function mergeBusy(sortedEvents: readonly CalendarEvent[], bufferMin: number): BusyBlock[] {
  const blocks: BusyBlock[] = [];

  // INVARIANT: blocks is the merged union of the visited events, expanded by bufferMin, sorted,
  //            with no two blocks overlapping or touching
  for (const event of sortedEvents) {
    // Every event grows by the same buffer, so the expanded starts keep the sorted order.
    const next = blockOf(event, bufferMin);
    const last = blocks.at(-1);
    if (last === undefined || next.start > last.end) {
      blocks.push(next);
    } else if (next.end > last.end) {
      // Overlapping or touching: extend the last block, which now ends with this event.
      blocks[blocks.length - 1] = { ...last, end: next.end, endEvent: next.endEvent };
    }
  }
  // POST: blocks is the merged union of all of sortedEvents, expanded by bufferMin

  return blocks;
}
