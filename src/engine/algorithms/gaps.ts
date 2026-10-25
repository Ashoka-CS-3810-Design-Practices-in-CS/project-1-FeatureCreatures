// Free gaps: the parts of the allowed segments not covered by busy blocks (TECH_SPEC §8.8, BR-6).

import type { Boundary, BusyBlock, FreeGap, Minute, Segment } from '@/shared/types';
import { length } from './interval';

// mergeBusy grows every event by the same buffer, so the buffer can be read back from the block.

// PRE:  block is a mergeBusy block
// POST: returns the boundary at the block's start: its startEvent at its unbuffered start
function startBoundary(block: BusyBlock): Boundary {
  const { id, title, start } = block.startEvent;
  return { kind: 'event', eventId: id, title, at: start, bufferMin: start - block.start };
}

// PRE:  block is a mergeBusy block
// POST: returns the boundary at the block's end: its endEvent at its unbuffered end
function endBoundary(block: BusyBlock): Boundary {
  const { id, title, end } = block.endEvent;
  return { kind: 'event', eventId: id, title, at: end, bufferMin: block.end - end };
}

// PRE:  start < end; before explains start and after explains end
// POST: returns the free gap [start, end) with those boundaries
function gapOf(start: Minute, end: Minute, before: Boundary, after: Boundary): FreeGap {
  return { start, end, before, after };
}

// PRE:  segments are sorted and disjoint; busy is sorted, disjoint and non-touching (mergeBusy output)
// POST: returns, in order, every maximal free interval inside a single segment that no block covers,
//       each with what bounds it on both sides (a busy block's event or the segment's edge);
//       O(n + s) because a block is revisited only by the segments it spans
export function freeGaps(segments: readonly Segment[], busy: readonly BusyBlock[]): FreeGap[] {
  const gaps: FreeGap[] = [];
  let firstBlock = 0;

  // INVARIANT: guard:    0 ≤ firstBlock ≤ busy.length
  //            behavior: gaps holds the free gaps of the visited segments, in order ∧ every block
  //                      before firstBlock ends at or before the start of the next segment
  for (const segment of segments) {
    // INVARIANT: every block before firstBlock ends at or before segment.start
    while (firstBlock < busy.length && (busy[firstBlock] as BusyBlock).end <= segment.start) {
      firstBlock += 1;
    }
    // POST: busy[firstBlock], if it exists, is the first block ending after segment.start

    let cursor = segment.start;
    let cursorBoundary = segment.startEdge;
    let blockIndex = firstBlock;

    // INVARIANT: guard:    firstBlock ≤ blockIndex ≤ busy.length
    //            behavior: gaps also holds this segment's free gaps before cursor ∧ the blocks
    //                      firstBlock … blockIndex − 1 cover nothing after cursor ∧ cursorBoundary
    //                      explains cursor
    while (blockIndex < busy.length && (busy[blockIndex] as BusyBlock).start < segment.end) {
      const block = busy[blockIndex] as BusyBlock;
      if (block.start > cursor) {
        gaps.push(gapOf(cursor, block.start, cursorBoundary, startBoundary(block)));
      }
      if (block.end > cursor) {
        cursor = block.end;
        cursorBoundary = endBoundary(block);
      }
      blockIndex += 1;
    }
    // POST: no block starting before segment.end covers anything in [cursor, segment.end)

    if (cursor < segment.end) {
      gaps.push(gapOf(cursor, segment.end, cursorBoundary, segment.endEdge));
    }
    // firstBlock is not advanced to blockIndex: the last block may continue into the next segment.
  }
  // POST: gaps holds every free gap of every segment, in order

  return gaps;
}

// PRE:  gaps are free gaps, in any order
// POST: returns the first gap of maximal length, or null when gaps is empty
export function largestGap(gaps: readonly FreeGap[]): FreeGap | null {
  let largest: FreeGap | null = null;

  // INVARIANT: largest is the first longest gap visited so far, or null when none was visited
  for (const gap of gaps) {
    if (largest === null || length(gap) > length(largest)) {
      largest = gap;
    }
  }
  // POST: largest is the first longest gap of gaps, or null

  return largest;
}
