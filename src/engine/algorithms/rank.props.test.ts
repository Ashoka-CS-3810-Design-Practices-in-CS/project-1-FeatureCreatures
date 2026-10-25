import fc from 'fast-check';
import { MAX_OPTIONS, MINUTES_PER_DAY } from '@/shared/constants';
import type {
  Criterion,
  DayFrame,
  EffectiveCriterion,
  FreeGap,
  Priority,
  SlotOption,
  Weekday,
} from '@/shared/types';
import { PROP_TIMEOUT_MS, propParams } from '../../../tests/helpers/props';
import { rankOptions } from './rank';

const MIN_DURATION = 5;
const MAX_DURATION = 300;
const MAX_GAPS = 12;
const MAX_SPACING = 1000;
const MAX_EXTRA = 600;
const MAX_LOAD = 540;
const DAYS_IN_WEEK = 7;
const WORK_START_MIN = 540;
const WORK_END_MIN = 1080;
// Reach beyond the generated gaps on both sides so originalStart also clamps to gap edges.
const ORIGINAL_START_MARGIN = 2000;

const CRITERIA: Criterion[] = ['earliest', 'bestFit', 'priorityAware', 'nearest', 'leastLoaded'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

// Written out from the BR-7 table, independently of rank.ts.
const BR7_PRIORITY_AWARE: Record<Priority, EffectiveCriterion> = {
  high: 'earliest',
  medium: 'bestFit',
  low: 'leastLoaded',
};

// PRE:  durationMin > 0; layout holds non-negative spacing and extra lengths
// POST: returns sorted, disjoint gaps from 0 on, each spacing after the previous one and
//       durationMin + extra long, so every gap fits durationMin
function buildGaps(
  durationMin: number,
  layout: readonly { spacing: number; extra: number }[],
): FreeGap[] {
  const gaps: FreeGap[] = [];
  let cursor = 0;

  // INVARIANT: gaps holds one gap per visited layout entry, sorted and disjoint, all ending ≤ cursor
  for (const { spacing, extra } of layout) {
    const start = cursor + spacing;
    const end = start + durationMin + extra;
    gaps.push({
      start,
      end,
      before: { kind: 'edge', reason: 'windowStart', at: start },
      after: { kind: 'edge', reason: 'windowEnd', at: end },
    });
    cursor = end;
  }
  // POST: gaps holds one fitting gap per layout entry, sorted and disjoint

  return gaps;
}

// PRE:  dayCount ≥ 1
// POST: returns dayCount contiguous 1440-minute frames from minute 0, each with working hours
function buildFrames(dayCount: number): DayFrame[] {
  const frames: DayFrame[] = [];

  // INVARIANT: frames holds days 0 … dayIndex − 1, in order
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const dayStart = dayIndex * MINUTES_PER_DAY;
    frames.push({
      dayStart,
      dayEnd: dayStart + MINUTES_PER_DAY,
      weekday: (dayIndex % DAYS_IN_WEEK) as Weekday,
      work: { start: dayStart + WORK_START_MIN, end: dayStart + WORK_END_MIN },
      barred: [],
    });
  }
  // POST: frames holds dayCount contiguous days

  return frames;
}

// PRE:  option comes from rankOptions with effective criterion effective
// POST: returns the BR-7 sort key of option, then its gap start (= gap order, since gaps are sorted)
function br7Key(option: SlotOption, effective: EffectiveCriterion): number[] {
  const tieBreak = [option.slot.start, option.gap.start];
  const distance = option.distanceMin ?? 0;
  if (effective === 'earliest') {
    return tieBreak;
  }
  if (effective === 'bestFit') {
    return [option.leftoverMin, ...tieBreak];
  }
  if (effective === 'leastLoaded') {
    return [option.dayLoadMin, distance, ...tieBreak];
  }
  return [distance, ...tieBreak];
}

// PRE:  first and second are number arrays of the same length
// POST: returns true iff first ≤ second lexicographically
function lexicographicallyAtMost(first: readonly number[], second: readonly number[]): boolean {
  // INVARIANT: guard:    0 ≤ position ≤ first.length
  //            behavior: first[0 … position − 1] = second[0 … position − 1]
  for (let position = 0; position < first.length; position += 1) {
    if (first[position] !== second[position]) {
      return (first[position] as number) < (second[position] as number);
    }
  }
  // POST: the arrays are equal

  return true;
}

const scenarios = fc
  .record({
    durationMin: fc.integer({ min: MIN_DURATION, max: MAX_DURATION }),
    layout: fc.array(
      fc.record({
        spacing: fc.integer({ min: 0, max: MAX_SPACING }),
        extra: fc.integer({ min: 0, max: MAX_EXTRA }),
      }),
      { maxLength: MAX_GAPS },
    ),
    criterion: fc.constantFrom(...CRITERIA),
    priority: fc.constantFrom(...PRIORITIES),
    originalOffset: fc.option(
      fc.integer({ min: -ORIGINAL_START_MARGIN, max: ORIGINAL_START_MARGIN }),
    ),
    loads: fc.array(fc.integer({ min: 0, max: MAX_LOAD }), {
      minLength: 1,
      maxLength: DAYS_IN_WEEK,
    }),
  })
  .map(({ durationMin, layout, criterion, priority, originalOffset, loads }) => {
    const gaps = buildGaps(durationMin, layout);
    const lastEnd = gaps.at(-1)?.end ?? 0;
    const frames = buildFrames(Math.floor(lastEnd / MINUTES_PER_DAY) + 1);
    // Days cycle through the generated loads so equal loads (ties) are common.
    const dayLoads = new Map(
      frames.map((frame, dayIndex) => [frame.dayStart, loads[dayIndex % loads.length] as number]),
    );
    const originalStart = originalOffset === null ? null : Math.floor(lastEnd / 2) + originalOffset;
    return { gaps, frames, dayLoads, durationMin, criterion, priority, originalStart };
  });

describe('rankOptions (property)', () => {
  it(
    'T34: every option is valid and the options are in BR-7 order',
    () => {
      fc.assert(
        fc.property(scenarios, (scenario) => {
          const { gaps, durationMin, criterion, priority, originalStart, dayLoads } = scenario;
          const options = rankOptions(gaps, scenario);
          const effective =
            criterion === 'priorityAware' ? BR7_PRIORITY_AWARE[priority] : criterion;

          expect(options).toHaveLength(Math.min(MAX_OPTIONS, gaps.length));
          // INVARIANT: options[0 … index − 1] are valid and in BR-7 order
          for (const [index, option] of options.entries()) {
            const { slot, gap } = option;
            expect(option.rank).toBe(index + 1);
            expect(slot.end - slot.start).toBe(durationMin);
            expect(gap.start <= slot.start && slot.end <= gap.end).toBe(true);
            expect(option.gapMin).toBe(gap.end - gap.start);
            expect(option.leftoverMin).toBe(option.gapMin - durationMin);
            expect(option.effectiveCriterion).toBe(effective);
            expect(option.dayLoadMin).toBe(
              dayLoads.get(Math.floor(slot.start / MINUTES_PER_DAY) * MINUTES_PER_DAY),
            );
            expect(option.distanceMin).toBe(
              originalStart === null ? null : Math.abs(slot.start - originalStart),
            );
            const previous = options[index - 1];
            if (previous !== undefined) {
              expect(
                lexicographicallyAtMost(br7Key(previous, effective), br7Key(option, effective)),
              ).toBe(true);
            }
          }
          // POST: every option is valid and the list is in BR-7 order
        }),
        propParams(),
      );
    },
    PROP_TIMEOUT_MS,
  );
});
