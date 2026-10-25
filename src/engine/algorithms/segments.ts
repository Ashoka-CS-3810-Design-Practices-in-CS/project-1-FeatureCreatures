// Allowed segments: where a search may place time (TECH_SPEC §8.7, BR-5).

import type { Boundary, DayFrame, EdgeReason, Interval, Minute, Segment } from '@/shared/types';

type BarredInterval = DayFrame['barred'][number];

interface SegmentOptions {
  readonly useWorkingHours: boolean;
  readonly notBefore: Minute;
}

// PRE:  at is a Minute
// POST: returns the segment-edge boundary for reason at at
function edge(reason: EdgeReason, at: Minute): Boundary {
  return { kind: 'edge', reason, at };
}

// PRE:  work and window are intervals with start < end
// POST: returns work ∩ window as a segment, or null when it is empty; an edge is windowStart /
//       windowEnd only where the window cuts strictly inside working hours, else workStart / workEnd
function workSegment(work: Interval, window: Interval): Segment | null {
  const start = Math.max(work.start, window.start);
  const end = Math.min(work.end, window.end);
  if (start >= end) {
    return null;
  }
  return {
    start,
    end,
    startEdge: edge(work.start >= window.start ? 'workStart' : 'windowStart', start),
    endEdge: edge(work.end <= window.end ? 'workEnd' : 'windowEnd', end),
  };
}

// PRE:  base is a segment with start < end; barred is sorted by interval.start (slots may overlap)
// POST: returns, in order, the non-empty parts of base not covered by any barred interval; an edge
//       made by a barred slot is labelled with that slot, the others keep base's edges
function subtractBarred(base: Segment, barred: readonly BarredInterval[]): Segment[] {
  const pieces: Segment[] = [];
  let cursor = base.start;
  let cursorEdge = base.startEdge;

  // INVARIANT: pieces holds, in order, the free parts of [base.start, cursor) given the visited
  //            slots ∧ no visited slot covers [cursor, cursor + 1) ∧ cursorEdge explains cursor
  for (const slot of barred) {
    const { start, end } = slot.interval;
    if (end <= cursor || start >= base.end) {
      continue;
    }
    if (start > cursor) {
      pieces.push({
        start: cursor,
        end: start,
        startEdge: cursorEdge,
        endEdge: { kind: 'barred', label: slot.label, at: start },
      });
    }
    cursor = end;
    cursorEdge = { kind: 'barred', label: slot.label, at: end };
  }
  // POST: pieces holds the free parts of [base.start, cursor), and nothing barred lies after cursor

  if (cursor < base.end) {
    pieces.push({ start: cursor, end: base.end, startEdge: cursorEdge, endEdge: base.endEdge });
  }
  return pieces;
}

// PRE:  window is an interval with start < end; frames are as buildDayFrames returns them for window
// POST: returns the working-hours segments: each working day's work ∩ window minus its barred slots
function workingSegments(window: Interval, frames: readonly DayFrame[]): Segment[] {
  const pieces: Segment[] = [];

  // INVARIANT: pieces holds, in order, the working-hours segments of the visited frames
  for (const frame of frames) {
    const base = frame.work === null ? null : workSegment(frame.work, window);
    if (base !== null) {
      pieces.push(...subtractBarred(base, frame.barred));
    }
  }
  // POST: pieces holds the working-hours segments of every frame, in order

  return pieces;
}

// PRE:  window is an interval with start < end; frames are as buildDayFrames returns them for window
// POST: returns window minus every frame's barred slots, so consecutive days join across midnight
function anyTimeSegments(window: Interval, frames: readonly DayFrame[]): Segment[] {
  const base: Segment = {
    ...window,
    startEdge: edge('windowStart', window.start),
    endEdge: edge('windowEnd', window.end),
  };
  // Frames are in day order and each day's slots lie inside that day, so the list stays sorted.
  return subtractBarred(
    base,
    frames.flatMap((frame) => frame.barred),
  );
}

// PRE:  segment is a segment; notBefore is a Minute
// POST: returns segment with its start raised to notBefore (edge 'now') when it began earlier, or
//       null when nothing of it is left at or after notBefore
function clipToNotBefore(segment: Segment, notBefore: Minute): Segment | null {
  if (segment.end <= notBefore) {
    return null;
  }
  if (segment.start >= notBefore) {
    return segment;
  }
  return { ...segment, start: notBefore, startEdge: edge('now', notBefore) };
}

// PRE:  window is an interval with start < end; frames are buildDayFrames(window, settings): in day
//       order, each frame's barred sorted by start; options.notBefore is now rounded up to SNAP_MIN
// POST: returns the sorted, disjoint allowed segments of BR-5: with useWorkingHours, each working
//       day's hours ∩ window; otherwise the whole window; minus barred slots; clipped at notBefore.
//       Every edge carries the reason it is there; O(D·B)
export function allowedSegments(
  window: Interval,
  frames: readonly DayFrame[],
  options: SegmentOptions,
): Segment[] {
  const pieces = options.useWorkingHours
    ? workingSegments(window, frames)
    : anyTimeSegments(window, frames);
  return pieces
    .map((piece) => clipToNotBefore(piece, options.notBefore))
    .filter((piece) => piece !== null);
}
