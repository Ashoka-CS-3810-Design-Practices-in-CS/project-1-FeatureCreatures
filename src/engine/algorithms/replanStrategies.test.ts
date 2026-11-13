import type { CalendarEvent, DayFrame, Interval, ReplanStrategy } from '@/shared/types';
import { dayFrame, ev, flexEv, iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { planReplan, type ReplanInput } from './replanHeuristics';
import { allowedSegments } from './segments';
import { compareEvents } from './sortedArray';
import { detectConflicts } from './sweep';
import { replanSortKey } from './replanStrategies';

const FRAMES = (['Mon', 'Tue', 'Wed'] as const).map((day) => dayFrame(day, ['09:00', '18:00']));
const WINDOW: [string, string] = ['Mon 09:00', 'Wed 18:00'];
const TWO_DAYS = FRAMES.slice(0, 2);

// PRE: events have distinct ids and valid flexible windows; frames are contiguous, nonempty days
// POST: returns the proposed strategy input over frames, retaining the unchanged BR-12 safety rules
function input(
  events: CalendarEvent[],
  strategy: ReplanStrategy,
  frames: DayFrame[] = FRAMES,
): ReplanInput & { strategy: ReplanStrategy } {
  const sorted = events.toSorted(compareEvents);
  const range = {
    start: (frames[0] as DayFrame).dayStart,
    end: (frames.at(-1) as DayFrame).dayEnd,
  };
  const notBefore = t('Mon 00:00');
  return {
    events: sorted,
    conflicts: detectConflicts(sorted),
    frames,
    range,
    bufferMin: 0,
    notBefore,
    useWorkingHours: true,
    strategy,
    segmentsFor: (window: Interval) =>
      allowedSegments(window, frames, { useWorkingHours: true, notBefore }),
  };
}

describe('T55: Replan strategy sort keys (D-15)', () => {
  it('uses the exact category-key ordering, including the shared zero-distance fallback', () => {
    const option = { slot: iv('Mon 13:00', 'Mon 14:00'), distanceMin: 45, dayLoadMin: 120 };
    expect(replanSortKey(option, 'clusterByCategory', 60)).toEqual([-60, 45, t('Mon 13:00')]);
    expect(replanSortKey(option, 'varyCategories', 60)).toEqual([60, 120, 45, t('Mon 13:00')]);
    expect(replanSortKey({ ...option, distanceMin: null }, 'clusterByCategory', 60)).toEqual([
      -60,
      0,
      t('Mon 13:00'),
    ]);
  });

  it('ranks every gap by category before applying MAX_OPTIONS, including a far-away seventh day', () => {
    const frames = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((day) =>
      dayFrame(day, ['09:00', '18:00']),
    );
    const result = planReplan(
      input(
        [
          ev('Monday same', 'Mon 09:00', 'Mon 10:00'),
          flexEv('Move', 'Sun 14:00', 'Sun 15:00', ['Mon 09:00', 'Sun 18:00']),
        ],
        'clusterByCategory',
        frames,
      ),
    );
    expect(result.plans[1].moves[0]?.to).toEqual(iv('Mon 17:00', 'Mon 18:00'));
  });

  it('keeps omitted/default Balanced week and Minimal change exactly unchanged', () => {
    const events = [
      ev('Lecture', 'Mon 10:00', 'Mon 12:00'),
      flexEv('Study', 'Mon 11:00', 'Mon 12:00', WINDOW),
    ];
    const withStrategy = input(events, 'balanced');
    const { strategy: ignored, ...withoutStrategy } = withStrategy;
    expect(ignored).toBe('balanced');
    expect(planReplan(withStrategy)).toEqual(planReplan(withoutStrategy));
  });

  it('clusters by greatest same-category minutes before distance or total day load', () => {
    const events = [
      ev('Other category', 'Mon 09:00', 'Mon 13:00', { categoryId: 'assignment' }),
      ev('Same category', 'Tue 10:00', 'Tue 12:00'),
      flexEv('Move', 'Wed 14:00', 'Wed 15:00', WINDOW),
    ];
    const result = planReplan(input(events, 'clusterByCategory'));
    expect(result.plans[0]).toEqual(planReplan(input(events, 'balanced')).plans[0]);
    expect(result.plans[1].moves).toMatchObject([
      {
        eventId: 'Move',
        to: iv('Tue 17:00', 'Tue 18:00'),
        reason: { kind: 'strategy', strategy: 'clusterByCategory' },
      },
    ]);
  });

  it('varies by least same-category minutes even when that day has much more other-category load', () => {
    const result = planReplan(
      input(
        [
          ev('Other category', 'Mon 09:00', 'Mon 17:00', { categoryId: 'assignment' }),
          ev('Same category', 'Tue 09:00', 'Tue 10:00'),
          flexEv('Move', 'Tue 14:00', 'Tue 15:00', WINDOW),
        ],
        'varyCategories',
        TWO_DAYS,
      ),
    );
    expect(result.plans[1].moves).toMatchObject([
      {
        eventId: 'Move',
        to: iv('Mon 17:00', 'Mon 18:00'),
        reason: { kind: 'strategy', strategy: 'varyCategories' },
      },
    ]);
  });

  it('uses total day load after equal category minutes for Vary categories', () => {
    const result = planReplan(
      input(
        [
          ev('Monday other', 'Mon 14:00', 'Mon 15:00', { categoryId: 'assignment' }),
          ev('Tuesday other', 'Tue 09:00', 'Tue 11:00', { categoryId: 'assignment' }),
          flexEv('Move', 'Tue 14:00', 'Tue 15:00', WINDOW),
        ],
        'varyCategories',
        TWO_DAYS,
      ),
    );
    expect(result.plans[1].moves[0]?.to).toEqual(iv('Mon 17:00', 'Mon 18:00'));
  });

  it('front-loads to the first start inside a gap, even when the original start is already valid', () => {
    const result = planReplan(
      input([flexEv('Move', 'Tue 14:00', 'Tue 15:00', WINDOW)], 'frontLoad'),
    );
    expect(result.plans[0].moves).toEqual([]);
    expect(result.plans[1].moves).toMatchObject([
      { to: iv('Mon 09:00', 'Mon 10:00'), reason: { kind: 'strategy', strategy: 'frontLoad' } },
    ]);
  });

  it('chooses the smallest leftover gap before its earliest start for Fewer fragments', () => {
    const result = planReplan(
      input(
        [
          ev('Monday block', 'Mon 10:00', 'Mon 18:00'),
          flexEv('Move', 'Tue 15:00', 'Tue 16:00', WINDOW),
        ],
        'fewerFragments',
      ),
    );
    expect(result.plans[1].moves).toMatchObject([
      {
        to: iv('Mon 09:00', 'Mon 10:00'),
        reason: { kind: 'strategy', strategy: 'fewerFragments' },
      },
    ]);
  });

  it('uses earliest start within an equally sized gap for Fewer fragments', () => {
    const result = planReplan(
      input([flexEv('Move', 'Tue 15:00', 'Tue 16:00', WINDOW)], 'fewerFragments'),
    );
    expect(result.plans[1].moves[0]?.to).toEqual(iv('Mon 09:00', 'Mon 10:00'));
  });

  it('breaks equal category loads by distance, counting no move for an unchanged interval', () => {
    const result = planReplan(
      input(
        [
          ev('Monday same', 'Mon 10:00', 'Mon 11:00'),
          ev('Tuesday same', 'Tue 10:00', 'Tue 11:00'),
          flexEv('Stay', 'Tue 14:00', 'Tue 15:00', WINDOW),
        ],
        'clusterByCategory',
        TWO_DAYS,
      ),
    );
    expect(result.plans[1].moves).toEqual([]);
    expect(result.plans[1].metrics.moved).toBe(0);
  });

  it('breaks equal category load/distance by earlier start and retains the Minimal-change reason', () => {
    const result = planReplan(
      input(
        [
          ev('Monday same', 'Mon 09:00', 'Mon 17:00'),
          ev('Tuesday same', 'Tue 10:00', 'Tue 18:00'),
          flexEv('Move', 'Tue 01:00', 'Tue 02:00', WINDOW),
        ],
        'clusterByCategory',
        TWO_DAYS,
      ),
    );
    expect(result.plans[1].moves).toMatchObject([
      { to: iv('Mon 17:00', 'Mon 18:00'), reason: { kind: 'outsideWorkingHours' } },
    ]);
  });

  it('recomputes category minutes after each placement in BR-12 processing order', () => {
    const result = planReplan(
      input(
        [
          ev('Tuesday same', 'Tue 10:00', 'Tue 11:00'),
          flexEv('First', 'Mon 14:00', 'Mon 15:00', WINDOW),
          flexEv('Second', 'Wed 14:00', 'Wed 15:00', WINDOW),
        ],
        'clusterByCategory',
      ),
    );
    expect(result.plans[1].moves.map(({ eventId, to }) => ({ eventId, to }))).toEqual([
      { eventId: 'First', to: iv('Tue 09:00', 'Tue 10:00') },
      { eventId: 'Second', to: iv('Tue 17:00', 'Tue 18:00') },
    ]);
  });
});
