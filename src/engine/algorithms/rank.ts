// Ranking criteria for slot options (TECH_SPEC §8.10, BR-7). Strategy pattern: each effective
// criterion is a sort-key strategy chosen at run time; the rest of the ranking is shared.

import { MAX_OPTIONS } from '@/shared/constants';
import type {
  Criterion,
  DayFrame,
  EffectiveCriterion,
  FreeGap,
  Minute,
  Priority,
  SlotOption,
} from '@/shared/types';
import { frameOf } from './dayLoad';
import { clamp, length } from './interval';

export interface RankContext {
  durationMin: number;
  criterion: Criterion;
  priority: Priority;
  originalStart: Minute | null;
  dayLoads: Map<Minute, number>;
  frames: readonly DayFrame[];
}

const PRIORITY_AWARE_CRITERION: Record<Priority, EffectiveCriterion> = {
  high: 'earliest',
  medium: 'bestFit',
  low: 'leastLoaded',
};

interface Candidate {
  readonly option: Omit<SlotOption, 'rank'>;
  readonly key: readonly number[];
  readonly gapIndex: number;
}

// PRE:  criterion and priority are valid
// POST: returns the criterion actually used: priorityAware maps by priority (high → earliest,
//       medium → bestFit, low → leastLoaded); every other criterion is returned unchanged
export function effectiveCriterion(criterion: Criterion, priority: Priority): EffectiveCriterion {
  return criterion === 'priorityAware' ? PRIORITY_AWARE_CRITERION[priority] : criterion;
}

// PRE:  option is a candidate option; effective is its effective criterion
// POST: returns option's BR-7 sort key (ascending); every key ends in slot start, the first tie-break.
//       A missing distance counts as 0, so nearest without an original start falls back to earliest
function sortKey(option: Omit<SlotOption, 'rank'>, effective: EffectiveCriterion): number[] {
  const start = option.slot.start;
  const distance = option.distanceMin ?? 0;
  switch (effective) {
    case 'earliest':
      return [start];
    case 'bestFit':
      return [option.leftoverMin, start];
    case 'leastLoaded':
      return [option.dayLoadMin, distance, start];
    case 'nearest':
      return [distance, start];
  }
}

// PRE:  gap.length ≥ context.durationMin; context.frames cover gap
// POST: returns the one option gap yields: the slot starts at clamp(originalStart, gap.start,
//       gap.end − durationMin) when an original start exists, else at gap.start (BR-7)
function optionFor(gap: FreeGap, context: RankContext): Omit<SlotOption, 'rank'> {
  const { durationMin, originalStart } = context;
  const start =
    originalStart === null ? gap.start : clamp(originalStart, gap.start, gap.end - durationMin);
  const frame = frameOf(context.frames, start);
  const gapMin = length(gap);
  return {
    slot: { start, end: start + durationMin },
    gap,
    gapMin,
    leftoverMin: gapMin - durationMin,
    dayLoadMin: frame === undefined ? 0 : (context.dayLoads.get(frame.dayStart) ?? 0),
    criterion: context.criterion,
    effectiveCriterion: effectiveCriterion(context.criterion, context.priority),
    distanceMin: originalStart === null ? null : Math.abs(start - originalStart),
  };
}

// PRE:  first and second are candidates whose keys have the same length
// POST: returns < 0, 0 or > 0 ordering them lexicographically by key, then by gapIndex
function compareCandidates(first: Candidate, second: Candidate): number {
  // INVARIANT: guard:    0 ≤ position ≤ first.key.length
  //            behavior: first.key[0 … position − 1] = second.key[0 … position − 1]
  for (let position = 0; position < first.key.length; position += 1) {
    const difference = (first.key[position] as number) - (second.key[position] as number);
    if (difference !== 0) {
      return difference;
    }
  }
  // POST: the keys are equal

  return first.gapIndex - second.gapIndex;
}

// PRE:  every gap in fitting has length ≥ context.durationMin; context.frames cover every gap
// POST: returns at most MAX_OPTIONS options, one per gap, in BR-7 order for the effective criterion
//       (ties: earlier slot start, then earlier gap in fitting), with rank = 1 … k; O(m log m)
export function rankOptions(fitting: readonly FreeGap[], context: RankContext): SlotOption[] {
  const effective = effectiveCriterion(context.criterion, context.priority);
  const candidates: Candidate[] = fitting.map((gap, gapIndex) => {
    const option = optionFor(gap, context);
    return { option, key: sortKey(option, effective), gapIndex };
  });
  return candidates
    .toSorted(compareCandidates)
    .slice(0, MAX_OPTIONS)
    .map((candidate, index) => ({ rank: index + 1, ...candidate.option }));
}
