import fc from 'fast-check';
import type { Segment } from '@/shared/types';
import { ev } from '../../../tests/helpers/builders';
import { bitmapGaps } from '../../../tests/helpers/oracle';
import { PROP_TIMEOUT_MS, propParams } from '../../../tests/helpers/props';
import { freeGaps } from './gaps';
import { mergeBusy } from './merge';
import { compareEvents } from './sortedArray';

// T33 ranges: disjoint segments in [0, 3000), event lengths 1–300, buffer 0–30. Events may start
// before 0 so blocks that begin before the first segment are exercised too.
const SEGMENT_LIMIT = 3000;
const MAX_SEGMENT_CUTS = 20;
const MIN_EVENT_START = -300;
const MAX_EVENTS = 50;
const MIN_LENGTH = 1;
const MAX_LENGTH = 300;
const MAX_BUFFER = 30;

// PRE:  cuts are distinct integers in [0, SEGMENT_LIMIT]
// POST: returns the sorted cuts paired up as [cuts[0], cuts[1]), [cuts[2], cuts[3]), …, so the
//       segments are sorted, disjoint and non-empty; an odd last cut is dropped
function segmentsFromCuts(cuts: readonly number[]): Segment[] {
  const sorted = cuts.toSorted((first, second) => first - second);
  const segments: Segment[] = [];

  // INVARIANT: guard:    pairIndex is even ∧ 0 ≤ pairIndex ≤ sorted.length
  //            behavior: segments holds the pairs of sorted[0 … pairIndex − 1], in order
  for (let pairIndex = 0; pairIndex + 1 < sorted.length; pairIndex += 2) {
    const start = sorted[pairIndex] as number;
    const end = sorted[pairIndex + 1] as number;
    segments.push({
      start,
      end,
      startEdge: { kind: 'edge', reason: 'windowStart', at: start },
      endEdge: { kind: 'edge', reason: 'windowEnd', at: end },
    });
  }
  // POST: segments holds every complete pair of sorted, in order

  return segments;
}

const segmentSets = fc
  .uniqueArray(fc.integer({ min: 0, max: SEGMENT_LIMIT }), { maxLength: MAX_SEGMENT_CUTS })
  .map(segmentsFromCuts);

const eventSets = fc
  .array(
    fc.record({
      start: fc.integer({ min: MIN_EVENT_START, max: SEGMENT_LIMIT - 1 }),
      length: fc.integer({ min: MIN_LENGTH, max: MAX_LENGTH }),
    }),
    { maxLength: MAX_EVENTS },
  )
  .map((spans) =>
    // The t() specs are placeholders; the overrides set the raw minutes T33 asks for.
    spans.map(({ start, length }, index) =>
      ev(`e${index}`, 'Mon 00:00', 'Mon 00:00', { start, end: start + length }),
    ),
  );

describe('freeGaps (property)', () => {
  it(
    'T33: the gaps over merged busy blocks equal the minute-bitmap gaps',
    () => {
      fc.assert(
        fc.property(
          segmentSets,
          eventSets,
          fc.integer({ min: 0, max: MAX_BUFFER }),
          (segments, events, bufferMin) => {
            const gaps = freeGaps(segments, mergeBusy(events.toSorted(compareEvents), bufferMin));

            expect(gaps.map(({ start, end }) => ({ start, end }))).toEqual(
              bitmapGaps(segments, events, bufferMin),
            );
          },
        ),
        propParams(),
      );
    },
    PROP_TIMEOUT_MS,
  );
});
