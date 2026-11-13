import type { BarredOverlap, CalendarEvent, DayFrame } from '@/shared/types';
import { overlapOf, length } from './interval';
import { lowerBound } from './sortedArray';

// PRE:  events are valid; frames are ordered, disjoint local days covering every touched day;
//       frame.barred already contains only that day's applicable absolute intervals
// POST: returns every positive event/slot intersection in event, frame and slot order without
//       mutation; ignores working hours; O(N log(D+1) + F·B + q) time and O(q) output space
export function detectBarredOverlaps(
  events: readonly CalendarEvent[],
  frames: readonly DayFrame[],
): BarredOverlap[] {
  const warnings: BarredOverlap[] = [];
  // INVARIANT: warnings contains all intersections for the visited events in input order
  for (const event of events) {
    let frameIndex = lowerBound(frames, (frame) => frame.dayEnd > event.start);
    // INVARIANT: 0 ≤ frameIndex ≤ frames.length; all earlier intersecting frames are processed
    while (frameIndex < frames.length) {
      const frame = frames[frameIndex] as DayFrame;
      if (frame.dayStart >= event.end) break;
      // INVARIANT: warnings includes each visited slot's positive intersection in this frame
      for (const slot of frame.barred) {
        const overlap = overlapOf(event, slot.interval);
        if (overlap !== null) {
          warnings.push({
            eventId: event.id,
            slotId: slot.slotId,
            label: slot.label,
            overlap,
            minutes: length(overlap),
          });
        }
      }
      // POST: every slot in this frame has been considered, even when frame.work is null
      frameIndex += 1;
    }
    // POST: every frame touched by event has been processed; later frames cannot intersect it
  }
  // POST: warnings contains exactly all positive intersections in the promised order
  return warnings;
}
