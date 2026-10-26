import fc from 'fast-check';
import { MINUTES_PER_DAY } from '@/shared/constants';
import type { CalendarEvent, DayFrame, Interval, Priority } from '@/shared/types';
import { dayFrame, ev, type BaseDay } from '../../../tests/helpers/builders';
import { PROP_TIMEOUT_MS, propParams } from '../../../tests/helpers/props';
import { t } from '../../../tests/helpers/time';
import { contains, expand, intersect, overlaps } from './interval';
import { planReplan, type ReplanInput } from './replanHeuristics';
import { allowedSegments } from './segments';
import { compareEvents } from './sortedArray';
import { detectConflicts } from './sweep';

const DAYS_IN_WEEK = 7;
const WEEK_START = t('Mon 00:00');
const WEEK_MIN = DAYS_IN_WEEK * MINUTES_PER_DAY;
const MAX_EVENTS = 30;
// Starts sit on a 5-minute grid, either in the daytime or within 90 minutes of a midnight, so events
// often end up a buffer apart and next to the range edges.
const GRID_MIN = 5;
const DAYTIME_FIRST_STEP = 96; // 08:00
const DAYTIME_LAST_STEP = 228; // 19:00
const MIDNIGHT_STEPS = 18; // ± 90 min
const MIN_LENGTH_STEPS = 1;
const MAX_LENGTH_STEPS = 48; // 4 h
// A window starts up to a day before its event or up to 2 h after it, and is up to 2 days longer
// than the event, so it contains the event only some of the time.
const MAX_WINDOW_LEAD_STEPS = 288; // 1 day
const MAX_WINDOW_LAG_STEPS = 24; // 2 h
const MAX_WINDOW_EXTRA_STEPS = 576; // 2 days
const MAX_BUFFER = 30;
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

// All-day working days let buffers reach across midnight and the range edges; Tue / Thu add
// ordinary hours and a barred lunch; the weekend has no working hours at all.
const WEEK_FRAMES: DayFrame[] = (
  [
    ['Mon', ['00:00', '24:00'], []],
    ['Tue', ['09:00', '18:00'], [['Lunch', '12:00', '13:00']]],
    ['Wed', ['00:00', '24:00'], []],
    ['Thu', ['09:00', '18:00'], []],
    ['Fri', ['00:00', '24:00'], [['Lunch', '12:00', '13:00']]],
    ['Sat', null, []],
    ['Sun', null, []],
  ] as [BaseDay, [string, string] | null, [string, string, string][]][]
).map(([day, work, barred]) => dayFrame(day, work, barred));

const stepsIntoDay = fc.oneof(
  fc.integer({ min: DAYTIME_FIRST_STEP, max: DAYTIME_LAST_STEP }),
  fc.integer({ min: -MIDNIGHT_STEPS, max: MIDNIGHT_STEPS }),
);

const eventSpecs = fc.array(
  fc.record({
    day: fc.integer({ min: 0, max: DAYS_IN_WEEK - 1 }),
    steps: stepsIntoDay,
    lengthSteps: fc.integer({ min: MIN_LENGTH_STEPS, max: MAX_LENGTH_STEPS }),
    flexible: fc.boolean(),
    windowShiftSteps: fc.integer({ min: -MAX_WINDOW_LEAD_STEPS, max: MAX_WINDOW_LAG_STEPS }),
    windowExtraSteps: fc.integer({ min: 0, max: MAX_WINDOW_EXTRA_STEPS }),
    priority: fc.constantFrom(...PRIORITIES),
  }),
  { maxLength: MAX_EVENTS },
);

const scenarios = fc
  .record({
    specs: eventSpecs,
    firstDay: fc.integer({ min: 0, max: DAYS_IN_WEEK - 1 }),
    dayCount: fc.integer({ min: 1, max: DAYS_IN_WEEK }),
    notBeforeOffset: fc.integer({ min: 0, max: WEEK_MIN }),
    bufferMin: fc.integer({ min: 0, max: MAX_BUFFER }),
  })
  .map(({ specs, firstDay, dayCount, notBeforeOffset, bufferMin }): ReplanInput => {
    const events = specs
      .map((spec, index) => {
        const start = WEEK_START + spec.day * MINUTES_PER_DAY + spec.steps * GRID_MIN;
        const length = spec.lengthSteps * GRID_MIN;
        const windowStart = start + spec.windowShiftSteps * GRID_MIN;
        // The t() specs are placeholders; the overrides set the raw minutes.
        return ev(`e${index}`, 'Mon 00:00', 'Mon 00:00', {
          start,
          end: start + length,
          priority: spec.priority,
          flexible: spec.flexible,
          flexWindow: spec.flexible
            ? {
                start: windowStart,
                end: windowStart + length + spec.windowExtraSteps * GRID_MIN,
              }
            : null,
        });
      })
      .toSorted(compareEvents);
    const frames = WEEK_FRAMES.slice(firstDay, Math.min(DAYS_IN_WEEK, firstDay + dayCount));
    const range = {
      start: (frames[0] as DayFrame).dayStart,
      end: (frames.at(-1) as DayFrame).dayEnd,
    };
    const notBefore = WEEK_START + notBeforeOffset;
    return {
      events,
      conflicts: detectConflicts(events),
      frames,
      range,
      bufferMin,
      notBefore,
      segmentsFor: (window: Interval) =>
        allowedSegments(window, frames, { useWorkingHours: true, notBefore }),
    };
  });

// PRE:  input is a generated scenario
// POST: returns true iff event is movable under BR-12, decided here independently of planReplan
function isMovable(event: CalendarEvent, input: ReplanInput): boolean {
  return event.flexible && event.start >= input.notBefore && overlaps(event, input.range);
}

describe('planReplan (property)', () => {
  it(
    'T35: plans move only movable events, into allowed segments, clear of everything else',
    () => {
      fc.assert(
        fc.property(scenarios, (input) => {
          const { movableCount, plans } = planReplan(input);
          const movable = input.events.filter((event) => isMovable(event, input));
          const others = input.events.filter((event) => !isMovable(event, input));
          const byId = new Map(input.events.map((event) => [event.id, event]));
          expect(movableCount).toBe(movable.length);

          // INVARIANT: every plan visited so far satisfies all of T35's checks
          for (const plan of plans) {
            expect(plan.metrics.moved).toBe(plan.moves.length);

            // INVARIANT: every move visited so far is of a movable event into one allowed segment
            for (const move of plan.moves) {
              const original = byId.get(move.eventId) as CalendarEvent;
              expect(isMovable(original, input)).toBe(true);
              const window = intersect(original.flexWindow as Interval, input.range) as Interval;
              const segments = input.segmentsFor(window);
              expect(segments.some((segment) => contains(segment, move.to))).toBe(true);
            }
            // POST: every move is valid

            const unplacedIds = new Set(plan.unplaced.map((entry) => entry.eventId));
            const newIntervals = new Map(plan.moves.map((move) => [move.eventId, move.to]));
            const placed = movable
              .filter((event) => !unplacedIds.has(event.id))
              .map((event) => ({ id: event.id, ...(newIntervals.get(event.id) ?? event) }));

            // BR-12: an unplaced event stays where it is and remains busy (AUDIT A01).
            const busy = [...others, ...movable.filter((event) => unplacedIds.has(event.id))];

            // INVARIANT: every placed event visited so far, grown by the buffer, meets no static or
            //            unplaced event and no other placed event
            for (const event of placed) {
              const buffered = expand(event, input.bufferMin);
              expect(busy.some((other) => overlaps(buffered, other))).toBe(false);
              expect(
                placed.some((other) => other.id !== event.id && overlaps(buffered, other)),
              ).toBe(false);
            }
            // POST: placed events keep their buffer from every static, unplaced and other placed event
          }
          // POST: both plans satisfy T35
        }),
        propParams(),
      );
    },
    PROP_TIMEOUT_MS,
  );
});
