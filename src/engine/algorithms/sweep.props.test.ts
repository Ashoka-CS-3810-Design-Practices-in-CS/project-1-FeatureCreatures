import fc from 'fast-check';
import { ev } from '../../../tests/helpers/builders';
import { bruteForceConflicts } from '../../../tests/helpers/oracle';
import { PROP_TIMEOUT_MS, propParams } from '../../../tests/helpers/props';
import { compareEvents } from './sortedArray';
import { detectConflicts } from './sweep';

// T12 ranges: n ≤ 200, starts in [0, 2000), lengths in [1, 300], all integers.
const MAX_EVENTS = 200;
const MAX_START = 1999;
const MIN_LENGTH = 1;
const MAX_LENGTH = 300;

const eventSets = fc
  .array(
    fc.record({
      start: fc.integer({ min: 0, max: MAX_START }),
      length: fc.integer({ min: MIN_LENGTH, max: MAX_LENGTH }),
    }),
    { maxLength: MAX_EVENTS },
  )
  .map((spans) =>
    // The t() specs are placeholders; the overrides set the raw minutes T12 asks for.
    spans.map(({ start, length }, index) =>
      ev(`e${index}`, 'Mon 00:00', 'Mon 00:00', { start, end: start + length }),
    ),
  );

describe('detectConflicts (property)', () => {
  it(
    'T12: matches the brute-force oracle in keys, overlaps, minutes and order',
    () => {
      fc.assert(
        fc.property(eventSets, (events) => {
          const conflicts = detectConflicts(events.toSorted(compareEvents));

          expect(conflicts.map(({ key, overlap, minutes }) => ({ key, overlap, minutes }))).toEqual(
            bruteForceConflicts(events),
          );
          // INVARIANT: every conflict visited so far has aId < bId and targetId ∈ {aId, bId}
          for (const conflict of conflicts) {
            expect(conflict.aId < conflict.bId).toBe(true);
            expect([conflict.aId, conflict.bId]).toContain(conflict.targetId);
          }
          // POST: every conflict has ordered ids and targets one of its two events
        }),
        propParams(),
      );
    },
    PROP_TIMEOUT_MS,
  );
});
