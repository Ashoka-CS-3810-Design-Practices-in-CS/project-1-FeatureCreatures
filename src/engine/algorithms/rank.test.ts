import { MAX_OPTIONS } from '@/shared/constants';
import type { Boundary, Criterion, EffectiveCriterion, FreeGap, Priority } from '@/shared/types';
import { dayFrame, iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { effectiveCriterion, rankOptions, type RankContext } from './rank';

const WORK: [string, string] = ['09:00', '18:00'];
const FRAMES = [dayFrame('Mon', WORK), dayFrame('Tue', WORK)];

// PRE:  from and to are valid t() specs with from < to
// POST: returns the free gap [t(from), t(to)) bounded by 'now' edges (the boundaries do not affect ranking)
function gap(from: string, to: string): FreeGap {
  const edgeAt = (at: number): Boundary => ({ kind: 'edge', reason: 'now', at });
  return { ...iv(from, to), before: edgeAt(t(from)), after: edgeAt(t(to)) };
}

// PRE:  overrides holds any subset of RankContext
// POST: returns a context for a 60 min medium-priority 'earliest' search with no original start,
//       Mon load 0 and Tue load 0 over FRAMES, with overrides applied
function context(overrides: Partial<RankContext> = {}): RankContext {
  return {
    durationMin: 60,
    criterion: 'earliest',
    priority: 'medium',
    originalStart: null,
    dayLoads: new Map([
      [t('Mon 00:00'), 0],
      [t('Tue 00:00'), 0],
    ]),
    frames: FRAMES,
    ...overrides,
  };
}

const slotStarts = (options: { slot: { start: number } }[]) =>
  options.map((option) => option.slot.start);

describe('effectiveCriterion (BR-7)', () => {
  it.each<[Criterion, Priority, EffectiveCriterion]>([
    ['priorityAware', 'high', 'earliest'],
    ['priorityAware', 'medium', 'bestFit'],
    ['priorityAware', 'low', 'leastLoaded'],
    ['earliest', 'low', 'earliest'],
    ['bestFit', 'high', 'bestFit'],
    ['nearest', 'high', 'nearest'],
    ['leastLoaded', 'high', 'leastLoaded'],
  ])('%s with %s priority is %s', (criterion, priority, expected) => {
    expect(effectiveCriterion(criterion, priority)).toBe(expected);
  });
});

describe('rankOptions (BR-7)', () => {
  const t10Gaps = [gap('Mon 10:00', 'Mon 14:00'), gap('Mon 15:00', 'Mon 16:40')];

  it('T10 earliest: slots at gap starts, in start order, with every field filled', () => {
    const options = rankOptions(t10Gaps, context({ durationMin: 90 }));

    expect(options).toEqual([
      {
        rank: 1,
        slot: iv('Mon 10:00', 'Mon 11:30'),
        gap: t10Gaps[0],
        gapMin: 240,
        leftoverMin: 150,
        dayLoadMin: 0,
        criterion: 'earliest',
        effectiveCriterion: 'earliest',
        distanceMin: null,
      },
      {
        rank: 2,
        slot: iv('Mon 15:00', 'Mon 16:30'),
        gap: t10Gaps[1],
        gapMin: 100,
        leftoverMin: 10,
        dayLoadMin: 0,
        criterion: 'earliest',
        effectiveCriterion: 'earliest',
        distanceMin: null,
      },
    ]);
  });

  it('T10 bestFit: the tightest gap comes first', () => {
    const options = rankOptions(t10Gaps, context({ durationMin: 90, criterion: 'bestFit' }));

    expect(slotStarts(options)).toEqual([t('Mon 15:00'), t('Mon 10:00')]);
  });

  it('bestFit breaks equal leftovers by earlier start', () => {
    const gaps = [gap('Tue 09:00', 'Tue 10:30'), gap('Mon 15:00', 'Mon 16:30')];

    expect(slotStarts(rankOptions(gaps, context({ criterion: 'bestFit' })))).toEqual([
      t('Mon 15:00'),
      t('Tue 09:00'),
    ]);
  });

  it('breaks a full tie (same key, same start) by gap order', () => {
    const first = gap('Mon 09:00', 'Mon 10:00');
    const second = gap('Mon 09:00', 'Mon 10:00');

    const options = rankOptions([first, second], context());
    expect(options[0]?.gap).toBe(first);
    expect(options[1]?.gap).toBe(second);
  });

  it('leastLoaded orders by the load of the slot day, then by distance', () => {
    const gaps = [
      gap('Mon 09:00', 'Mon 10:00'),
      gap('Tue 09:00', 'Tue 10:00'),
      gap('Tue 16:00', 'Tue 17:00'),
    ];
    const dayLoads = new Map([
      [t('Mon 00:00'), 120],
      [t('Tue 00:00'), 60],
    ]);

    const byLoad = rankOptions(gaps, context({ criterion: 'leastLoaded', dayLoads }));
    expect(slotStarts(byLoad)).toEqual([t('Tue 09:00'), t('Tue 16:00'), t('Mon 09:00')]);
    expect(byLoad.map((option) => option.dayLoadMin)).toEqual([60, 60, 120]);

    const nearLate = rankOptions(
      gaps,
      context({ criterion: 'leastLoaded', dayLoads, originalStart: t('Tue 15:00') }),
    );
    expect(slotStarts(nearLate)).toEqual([t('Tue 16:00'), t('Tue 09:00'), t('Mon 09:00')]);
  });

  it('nearest clamps the start towards the original time inside each gap', () => {
    const gaps = [gap('Mon 09:00', 'Mon 10:00'), gap('Mon 13:00', 'Mon 15:00')];

    const fromNoon = rankOptions(
      gaps,
      context({ criterion: 'nearest', originalStart: t('Mon 12:00') }),
    );
    expect(fromNoon.map(({ slot, distanceMin }) => ({ slot, distanceMin }))).toEqual([
      { slot: iv('Mon 13:00', 'Mon 14:00'), distanceMin: 60 },
      { slot: iv('Mon 09:00', 'Mon 10:00'), distanceMin: 180 },
    ]);

    const inside = rankOptions(
      gaps,
      context({ criterion: 'nearest', originalStart: t('Mon 13:30') }),
    );
    expect(inside[0]).toMatchObject({ slot: iv('Mon 13:30', 'Mon 14:30'), distanceMin: 0 });

    const late = rankOptions(
      gaps,
      context({ criterion: 'nearest', originalStart: t('Mon 16:00') }),
    );
    expect(late[0]).toMatchObject({ slot: iv('Mon 14:00', 'Mon 15:00'), distanceMin: 120 });
  });

  it('priorityAware records the requested and the effective criterion', () => {
    const options = rankOptions(t10Gaps, context({ durationMin: 90, criterion: 'priorityAware' }));

    expect(slotStarts(options)).toEqual([t('Mon 15:00'), t('Mon 10:00')]);
    expect(options[0]).toMatchObject({ criterion: 'priorityAware', effectiveCriterion: 'bestFit' });
  });

  it(`returns at most MAX_OPTIONS (${MAX_OPTIONS}) options, ranked 1…k, and none for no gaps`, () => {
    const hours = ['09', '10', '11', '12', '13', '14'];
    const gaps = hours.map((hour) => gap(`Mon ${hour}:00`, `Mon ${hour}:30`));

    const options = rankOptions(gaps, context({ durationMin: 30 }));
    expect(options.map((option) => option.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(slotStarts(options)).toEqual(
      hours.slice(0, MAX_OPTIONS).map((hour) => t(`Mon ${hour}:00`)),
    );
    expect(rankOptions([], context())).toEqual([]);
  });
});
