import { SUGGESTION_STEP_MIN } from '@/shared/constants';
import type { Interval } from '@/shared/types';
import { t } from './time';

// PRE:  from/to are inclusive base-week start times, aligned to half-hours, with from ≤ to;
//       durationMin is positive
// POST: returns the exact expected slots starting every half-hour from from through to
export function halfHourSlots(from: string, to: string, durationMin: number): Interval[] {
  const first = t(from);
  const count = (t(to) - first) / SUGGESTION_STEP_MIN + 1;
  return Array.from({ length: count }, (_, index) => {
    const start = first + index * SUGGESTION_STEP_MIN;
    return { start, end: start + durationMin };
  });
}

// PRE:  slots are expected candidate intervals; original is the base-week original start
// POST: returns those expected slots ordered by absolute shift, then earlier start
export function nearestSlots(slots: readonly Interval[], original: string): Interval[] {
  const originalStart = t(original);
  return slots.toSorted(
    (first, second) =>
      Math.abs(first.start - originalStart) - Math.abs(second.start - originalStart) ||
      first.start - second.start,
  );
}
