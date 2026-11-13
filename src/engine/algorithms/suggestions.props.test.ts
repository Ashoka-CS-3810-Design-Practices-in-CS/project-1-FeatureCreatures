import fc from 'fast-check';
import { SUGGESTION_STEP_MIN } from '@/shared/constants';
import type { FreeGap } from '@/shared/types';
import { dayFrame } from '../../../tests/helpers/builders';
import { PROP_TIMEOUT_MS, propParams } from '../../../tests/helpers/props';
import { t } from '../../../tests/helpers/time';
import { generateCandidates } from './suggestions';

const MAX_START_OFFSET_MIN = 600;
const MAX_DURATION_MIN = 120;
const MAX_SPARE_MIN = 240;
const MIN_ORIGINAL_OFFSET_MIN = -300;
const MAX_ORIGINAL_OFFSET_MIN = 1200;
const DAY_START = t('Mon 00:00');
const FRAMES = [dayFrame('Mon', ['00:00', '24:00'])];

describe('T51: suggestion candidates (property)', () => {
  it(
    'matches a minute-by-minute oracle, stays within the gap, and always has length d',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MAX_START_OFFSET_MIN }),
          fc.integer({ min: 1, max: MAX_DURATION_MIN }),
          fc.integer({ min: 0, max: MAX_SPARE_MIN }),
          fc.option(fc.integer({ min: MIN_ORIGINAL_OFFSET_MIN, max: MAX_ORIGINAL_OFFSET_MIN }), {
            nil: null,
          }),
          (startOffset, durationMin, spareMin, originalOffset) => {
            const start = DAY_START + startOffset;
            const end = start + durationMin + spareMin;
            const originalStart = originalOffset === null ? null : DAY_START + originalOffset;
            const gap: FreeGap = {
              start,
              end,
              before: { kind: 'edge', reason: 'windowStart', at: start },
              after: { kind: 'edge', reason: 'windowEnd', at: end },
            };
            const candidates = generateCandidates(gap, {
              durationMin,
              originalStart,
              criterion: 'nearest',
              priority: 'medium',
              frames: FRAMES,
              dayLoads: new Map(),
            });
            const lastStart = end - durationMin;
            const clamped =
              originalStart === null ? null : Math.max(start, Math.min(originalStart, lastStart));
            const expected = Array.from(
              { length: spareMin + 1 },
              (_, offset) => start + offset,
            ).filter(
              (minute) =>
                minute === start ||
                minute === lastStart ||
                minute === clamped ||
                minute % SUGGESTION_STEP_MIN === 0,
            );
            expect(candidates.map((candidate) => candidate.slot.start)).toEqual(expected);
            expect(
              candidates.every(
                (candidate) =>
                  candidate.slot.start >= start &&
                  candidate.slot.end <= end &&
                  candidate.slot.end - candidate.slot.start === durationMin,
              ),
            ).toBe(true);
          },
        ),
        propParams(),
      );
    },
    PROP_TIMEOUT_MS,
  );
});
