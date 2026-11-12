import { SUGGESTION_STEP_MIN } from '@/shared/constants';
import type { FreeGap, SlotOption } from '@/shared/types';
import { clamp } from './interval';
import { optionAt, type RankContext } from './rank';

// PRE:  gap fits context.durationMin > 0; gap and originalStart use integer minutes;
//       context.frames cover gap and context.dayLoads describe those local days
// POST: returns every distinct boundary, half-hour and clamped-original candidate in time order,
//       each of length durationMin inside gap, with complete unranked BR-8 explanation data
export function generateCandidates(gap: FreeGap, context: RankContext): Omit<SlotOption, 'rank'>[] {
  const lastStart = gap.end - context.durationMin;
  const starts = new Set([gap.start, lastStart]);
  if (context.originalStart !== null) {
    starts.add(clamp(context.originalStart, gap.start, lastStart));
  }
  const firstStep = Math.ceil(gap.start / SUGGESTION_STEP_MIN) * SUGGESTION_STEP_MIN;

  // INVARIANT: start is a step multiple ≥ gap.start; starts contains every earlier fitting step,
  //            both boundaries and the clamped original start, with no duplicates
  for (let start = firstStep; start <= lastStart; start += SUGGESTION_STEP_MIN) {
    starts.add(start);
  }
  // POST: starts contains every required candidate start exactly once, all inside the fitting range

  return [...starts]
    .toSorted((first, second) => first - second)
    .map((start) => optionAt(gap, start, context));
}
