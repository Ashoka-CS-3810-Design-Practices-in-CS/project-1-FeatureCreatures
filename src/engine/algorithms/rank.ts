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

// PRE:  gap.start ≤ start ≤ gap.end − context.durationMin; context.frames cover gap
// POST: returns the unranked option at start with its gap, leftover, load, criterion and distance
export function optionAt(
  gap: FreeGap,
  start: Minute,
  context: RankContext,
): Omit<SlotOption, 'rank'> {
  const { durationMin, originalStart } = context;
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

// PRE:  gap.length ≥ context.durationMin; context.frames cover gap
// POST: returns Replan's one option for gap, clamped nearest to the original start when present
export function optionFor(gap: FreeGap, context: RankContext): Omit<SlotOption, 'rank'> {
  const start =
    context.originalStart === null
      ? gap.start
      : clamp(context.originalStart, gap.start, gap.end - context.durationMin);
  return optionAt(gap, start, context);
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
  return rankCandidates(fitting.map((gap) => optionFor(gap, context))).slice(0, MAX_OPTIONS);
}

// PRE: options carry valid slot data; default ranking shares an effective criterion;
//      keyFor returns equal-length numeric keys for every option
// POST: returns all options in keyFor order (default BR-7), input order for equal keys, ranked 1…k
export function rankCandidates(
  options: readonly Omit<SlotOption, 'rank'>[],
  keyFor: (option: Omit<SlotOption, 'rank'>) => readonly number[] = (option) =>
    sortKey(option, option.effectiveCriterion),
): SlotOption[] {
  const candidates: Candidate[] = options.map((option, gapIndex) => ({
    option,
    key: keyFor(option),
    gapIndex,
  }));
  return candidates
    .toSorted(compareCandidates)
    .map((candidate, index) => ({ rank: index + 1, ...candidate.option }));
}
