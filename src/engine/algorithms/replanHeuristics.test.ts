import type { CalendarEvent, DayFrame, Interval } from '@/shared/types';
import { dayFrame, ev, flexEv, iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { planReplan, type ReplanInput } from './replanHeuristics';
import { allowedSegments } from './segments';
import { compareEvents } from './sortedArray';
import { detectConflicts } from './sweep';

const WORK: [string, string] = ['09:00', '18:00'];
const WEEKDAYS = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map((day) => dayFrame(day, WORK));
const RANGE = iv('Mon 00:00', 'Sat 00:00');
const FLEX_WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];

interface InputOptions {
  frames?: readonly DayFrame[];
  bufferMin?: number;
  notBefore?: string;
}

// PRE:  events have distinct ids; options.notBefore is a valid t() spec
// POST: returns the ReplanInput the replan pipeline would build over RANGE: events sorted, their
//       current conflicts, Mon–Fri 09:00–18:00 frames, and working-hours segments (unless overridden)
function input(events: CalendarEvent[], options: InputOptions = {}): ReplanInput {
  const sorted = events.toSorted(compareEvents);
  const frames = options.frames ?? WEEKDAYS;
  const notBefore = t(options.notBefore ?? 'Mon 00:00');
  return {
    events: sorted,
    conflicts: detectConflicts(sorted),
    frames,
    range: RANGE,
    bufferMin: options.bufferMin ?? 0,
    notBefore,
    segmentsFor: (window: Interval) =>
      allowedSegments(window, frames, { useWorkingHours: true, notBefore }),
  };
}

const lecture = ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' });

describe('planReplan (BR-12)', () => {
  it('T22: minimal change moves only the conflicting event; balanced spreads it', () => {
    const study = flexEv('Study', 'Mon 11:00', 'Mon 12:00', FLEX_WINDOW, { priority: 'low' });
    const gym = flexEv('Gym', 'Tue 15:00', 'Tue 16:00', FLEX_WINDOW, { priority: 'medium' });
    const conflictWithLecture = { kind: 'conflict', withEventId: 'Lecture', withTitle: 'Lecture' };

    const { movableCount, plans } = planReplan(input([lecture, study, gym]));
    const [minimal, balanced] = plans;

    expect(movableCount).toBe(2);
    expect(minimal.id).toBe('minimalChange');
    expect(minimal.moves).toEqual([
      {
        eventId: 'Study',
        title: 'Study',
        priority: 'low',
        from: iv('Mon 11:00', 'Mon 12:00'),
        to: iv('Mon 12:00', 'Mon 13:00'),
        reason: conflictWithLecture,
      },
    ]);
    expect(minimal.unplaced).toEqual([]);
    expect(minimal.metrics).toEqual({
      moved: 1,
      totalShiftMin: 60,
      conflictsBefore: 1,
      conflictsAfter: 0,
      loadSpreadBeforeMin: 180,
      loadSpreadAfterMin: 180,
      unplaced: 0,
    });

    expect(balanced.id).toBe('balanced');
    expect(balanced.moves.map(({ eventId, to, reason }) => ({ eventId, to, reason }))).toEqual([
      { eventId: 'Study', to: iv('Wed 09:00', 'Wed 10:00'), reason: conflictWithLecture },
    ]);
    expect(balanced.metrics).toEqual({
      moved: 1,
      totalShiftMin: 2760,
      conflictsBefore: 1,
      conflictsAfter: 0,
      loadSpreadBeforeMin: 180,
      loadSpreadAfterMin: 120,
      unplaced: 0,
    });
  });

  it('T23: minimal change keeps a valid event; balanced moves it for balance', () => {
    const read = flexEv('Read', 'Mon 14:00', 'Mon 15:00', FLEX_WINDOW, { priority: 'low' });

    const [minimal, balanced] = planReplan(
      input([ev('Lecture', 'Mon 10:00', 'Mon 12:00'), read]),
    ).plans;

    expect(minimal.moves).toEqual([]);
    expect(minimal.metrics.moved).toBe(0);
    expect(balanced.moves).toEqual([
      {
        eventId: 'Read',
        title: 'Read',
        priority: 'low',
        from: iv('Mon 14:00', 'Mon 15:00'),
        to: iv('Tue 09:00', 'Tue 10:00'),
        reason: { kind: 'balance', fromDayLoadMin: 120, toDayLoadMin: 0 },
      },
    ]);
    expect(balanced.metrics).toMatchObject({ loadSpreadBeforeMin: 180, loadSpreadAfterMin: 120 });
  });

  it.each([
    [
      'outsideFlexWindow',
      [flexEv('X', 'Mon 10:00', 'Mon 11:00', ['Mon 12:00', 'Mon 18:00'])],
      {},
      { kind: 'outsideFlexWindow' },
      iv('Mon 12:00', 'Mon 13:00'),
    ],
    [
      'outsideWorkingHours',
      [flexEv('X', 'Mon 08:00', 'Mon 09:00', ['Mon 00:00', 'Fri 18:00'])],
      {},
      { kind: 'outsideWorkingHours' },
      iv('Mon 09:00', 'Mon 10:00'),
    ],
    [
      'barred (a tie in distance goes to the earlier slot)',
      [flexEv('X', 'Mon 13:00', 'Mon 14:00', FLEX_WINDOW)],
      { frames: [dayFrame('Mon', WORK, [['Lunch', '13:00', '14:00']]), ...WEEKDAYS.slice(1)] },
      { kind: 'barred', label: 'Lunch' },
      iv('Mon 12:00', 'Mon 13:00'),
    ],
    [
      'buffer',
      [ev('S', 'Mon 10:00', 'Mon 11:00'), flexEv('X', 'Mon 11:00', 'Mon 12:00', FLEX_WINDOW)],
      { bufferMin: 15 },
      { kind: 'buffer', withEventId: 'S', withTitle: 'S' },
      iv('Mon 11:15', 'Mon 12:15'),
    ],
  ])(
    'minimal change gives the %s reason and moves to the nearest slot',
    (_reason, events, options, reason, to) => {
      const [minimal] = planReplan(input(events, options)).plans;

      expect(minimal.moves).toHaveLength(1);
      expect(minimal.moves[0]).toMatchObject({ eventId: 'X', reason, to });
    },
  );

  it('reports the first failing check: flex window before barred, barred before conflict', () => {
    const frames = [dayFrame('Mon', WORK, [['Lunch', '13:00', '14:00']]), ...WEEKDAYS.slice(1)];
    const outsideAndBarred = flexEv('X', 'Mon 13:00', 'Mon 14:00', ['Mon 15:00', 'Mon 18:00']);
    const barredAndConflict = flexEv('Y', 'Mon 13:00', 'Mon 14:00', FLEX_WINDOW);
    const blocker = ev('S', 'Mon 13:00', 'Mon 14:00');

    const first = planReplan(input([outsideAndBarred], { frames })).plans[0];
    const second = planReplan(input([blocker, barredAndConflict], { frames })).plans[0];

    expect(first.moves[0]?.reason).toEqual({ kind: 'outsideFlexWindow' });
    expect(second.moves[0]?.reason).toEqual({ kind: 'barred', label: 'Lunch' });
  });

  it('leaves an event with no room where it is, lists it as unplaced, and keeps it busy', () => {
    const stuck = flexEv('X', 'Mon 10:00', 'Mon 11:00', ['Mon 10:00', 'Mon 11:00'], {
      priority: 'high',
    });
    const later = flexEv('Y', 'Mon 10:30', 'Mon 11:30', ['Mon 09:00', 'Mon 12:00']);

    const { plans } = planReplan(input([ev('S', 'Mon 10:00', 'Mon 10:30'), stuck, later]));

    // INVARIANT: every plan visited so far leaves X unplaced and moves Y to 11:00
    for (const plan of plans) {
      expect(plan.unplaced).toEqual([
        {
          eventId: 'X',
          title: 'X',
          reason: { kind: 'conflict', withEventId: 'S', withTitle: 'S' },
        },
      ]);
      expect(plan.metrics.unplaced).toBe(1);
      // Y only clashes with the unplaced X (S ends as Y starts), so it moves because X stays busy.
      expect(plan.moves.map(({ eventId, to, reason }) => ({ eventId, to, reason }))).toEqual([
        {
          eventId: 'Y',
          to: iv('Mon 11:00', 'Mon 12:00'),
          reason: { kind: 'conflict', withEventId: 'X', withTitle: 'X' },
        },
      ]);
    }
    // POST: both plans leave X unplaced and move Y to 11:00
  });

  it('treats a flexible event starting before notBefore as static', () => {
    const started = flexEv('P', 'Mon 10:00', 'Mon 11:00', FLEX_WINDOW);
    const upcoming = flexEv('Q', 'Mon 10:30', 'Mon 11:30', FLEX_WINDOW);

    const { movableCount, plans } = planReplan(
      input([started, upcoming], { notBefore: 'Mon 10:30' }),
    );

    expect(movableCount).toBe(1);
    expect(plans[0].moves.map(({ eventId, to }) => ({ eventId, to }))).toEqual([
      { eventId: 'Q', to: iv('Mon 11:00', 'Mon 12:00') },
    ]);
  });

  it('lets a static event just before the range push its buffer into the range', () => {
    const frames = [dayFrame('Mon', ['00:00', '24:00']), ...WEEKDAYS.slice(1)];
    const lateSunday = ev('S', '2026-11-01 23:30', 'Mon 00:00');
    const early = flexEv('X', 'Mon 00:00', 'Mon 01:00', ['Mon 00:00', 'Mon 06:00']);

    const [minimal] = planReplan(input([lateSunday, early], { frames, bufferMin: 15 })).plans;

    expect(minimal.moves).toEqual([
      expect.objectContaining({
        eventId: 'X',
        to: iv('Mon 00:15', 'Mon 01:15'),
        reason: { kind: 'buffer', withEventId: 'S', withTitle: 'S' },
      }),
    ]);
  });

  it('returns two empty plans when nothing is movable', () => {
    const { movableCount, plans } = planReplan(input([lecture]));

    expect(movableCount).toBe(0);
    expect(plans.map((plan) => plan.moves)).toEqual([[], []]);
    expect(plans[0].metrics).toMatchObject({ moved: 0, totalShiftMin: 0, unplaced: 0 });
  });
});
