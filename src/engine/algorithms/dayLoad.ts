// Day loads: booked minutes per working day (TECH_SPEC §8.9, PROJECT_SCHEMA glossary "Day load").

import type { CalendarEvent, DayFrame, Minute } from '@/shared/types';
import { length, overlapOf } from './interval';
import { lowerBound } from './sortedArray';

// PRE:  frames are in day order and contiguous (each dayEnd is the next dayStart); minute is a Minute
// POST: returns the index of the first frame with dayEnd > minute (frames.length if none); O(log D)
function firstFrameEndingAfter(frames: readonly DayFrame[], minute: Minute): number {
  return lowerBound(frames, (frame) => frame.dayEnd > minute);
}

// PRE:  frames are in day order and contiguous; minute is a Minute
// POST: returns the frame with dayStart ≤ minute < dayEnd, or undefined when no frame holds minute;
//       O(log D)
export function frameOf(frames: readonly DayFrame[], minute: Minute): DayFrame | undefined {
  const frame = frames[firstFrameEndingAfter(frames, minute)];
  return frame !== undefined && frame.dayStart <= minute ? frame : undefined;
}

// PRE:  sortedEvents is sorted by compareEvents; frames are in day order and contiguous;
//       every event lasts at most MAX_EVENT_MIN (BR-4)
// POST: returns a map with one entry per frame: dayStart → Σ over events of |event ∩ frame.work|
//       (0 for a non-working day); overlapping events are summed, not unioned; O(n log D + D)
export function computeDayLoads(
  sortedEvents: readonly CalendarEvent[],
  frames: readonly DayFrame[],
): Map<Minute, number> {
  const loads = new Map<Minute, number>(frames.map((frame) => [frame.dayStart, 0]));

  // INVARIANT: loads[frame.dayStart] = Σ |event ∩ frame.work| over the visited events, ∀ frame
  for (const event of sortedEvents) {
    let frameIndex = firstFrameEndingAfter(frames, event.start);

    // INVARIANT: guard:    frameIndex ≤ frames.length
    //            behavior: event's share is added for every frame before frameIndex that it touches;
    //                      at most 3 frames, because events are at most 24 h and days 23–25 h long
    while (frameIndex < frames.length && (frames[frameIndex] as DayFrame).dayStart < event.end) {
      const frame = frames[frameIndex] as DayFrame;
      const shared = frame.work === null ? null : overlapOf(event, frame.work);
      if (shared !== null) {
        loads.set(frame.dayStart, (loads.get(frame.dayStart) ?? 0) + length(shared));
      }
      frameIndex += 1;
    }
    // POST: event's minutes inside working hours are added to every frame it touches
  }
  // POST: loads holds the day load of every frame

  return loads;
}

// PRE:  loads maps dayStart → day load (a missing day counts as 0); frames are DayFrames
// POST: returns max − min of the day loads over the frames with working hours; 0 when there are none
export function loadSpread(loads: Map<Minute, number>, frames: readonly DayFrame[]): number {
  const workingLoads = frames
    .filter((frame) => frame.work !== null)
    .map((frame) => loads.get(frame.dayStart) ?? 0);
  if (workingLoads.length === 0) {
    return 0;
  }
  return Math.max(...workingLoads) - Math.min(...workingLoads);
}
