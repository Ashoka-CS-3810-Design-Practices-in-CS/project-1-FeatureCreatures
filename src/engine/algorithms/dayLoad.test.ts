import { dayFrame, ev } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { computeDayLoads, frameOf, loadSpread } from './dayLoad';
import { compareEvents } from './sortedArray';

const WORK: [string, string] = ['09:00', '18:00'];
const WEEK_END = [dayFrame('Fri', WORK), dayFrame('Sat', null), dayFrame('Sun', null)];

describe('computeDayLoads (glossary "Day load")', () => {
  it('clips events to working hours and sums overlapping events', () => {
    const frames = [dayFrame('Mon', WORK), dayFrame('Tue', WORK)];
    const events = [
      ev('Early', 'Mon 08:00', 'Mon 10:00'), // 60 min inside working hours
      ev('Both1', 'Mon 12:00', 'Mon 13:00'),
      ev('Both2', 'Mon 12:30', 'Mon 13:30'), // overlaps Both1; summed, not unioned
      ev('Night', 'Mon 17:00', 'Tue 10:00'), // 60 on Mon, 60 on Tue
    ].toSorted(compareEvents);

    expect(computeDayLoads(events, frames)).toEqual(
      new Map([
        [t('Mon 00:00'), 60 + 60 + 60 + 60],
        [t('Tue 00:00'), 60],
      ]),
    );
  });

  it('gives every frame an entry, 0 for non-working days and events outside the frames', () => {
    const events = [ev('Before', 'Mon 10:00', 'Mon 11:00'), ev('Sat', 'Sat 10:00', 'Sat 11:00')];

    expect(computeDayLoads(events, WEEK_END)).toEqual(
      new Map([
        [t('Fri 00:00'), 0],
        [t('Sat 00:00'), 0],
        [t('Sun 00:00'), 0],
      ]),
    );
  });
});

describe('frameOf', () => {
  it('finds the frame holding a minute, and undefined outside every frame', () => {
    expect(frameOf(WEEK_END, t('Fri 00:00'))?.weekday).toBe(5);
    expect(frameOf(WEEK_END, t('Sat 23:59'))?.weekday).toBe(6);
    expect(frameOf(WEEK_END, t('Sun 00:00'))?.weekday).toBe(0);
    expect(frameOf(WEEK_END, t('Fri 00:00') - 1)).toBeUndefined();
    expect(frameOf(WEEK_END, t('2026-11-09 00:00'))).toBeUndefined();
    expect(frameOf([], t('Mon 10:00'))).toBeUndefined();
  });
});

describe('loadSpread', () => {
  it('is max − min over working days only, counting days without an entry as 0', () => {
    const frames = [dayFrame('Mon', WORK), dayFrame('Tue', WORK), dayFrame('Sun', null)];
    const loads = new Map([
      [t('Sun 00:00'), 500], // not a working day: ignored
      [t('Mon 00:00'), 200],
    ]);

    expect(loadSpread(loads, frames)).toBe(200);
  });

  it('is 0 when there are no working days', () => {
    expect(loadSpread(new Map([[t('Sat 00:00'), 90]]), [dayFrame('Sat', null)])).toBe(0);
  });
});
