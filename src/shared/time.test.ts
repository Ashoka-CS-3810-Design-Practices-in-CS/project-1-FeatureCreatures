import { DEFAULT_SETTINGS, MINUTES_PER_DAY } from './constants';
import {
  addLocalDays,
  atLocal,
  buildDayFrames,
  ceilTo,
  fromMinute,
  localMinuteOfDay,
  onLocalDay,
  startOfLocalDay,
  startOfLocalWeek,
  toMinute,
} from './time';
import type { BarredSlot, Settings } from './types';

// Runs under TZ=UTC (npm test), so local time equals UTC here.

const MS_PER_MINUTE = 60_000;
const HOUR = 60;
const MON_MIDNIGHT = Date.UTC(2026, 10, 2) / MS_PER_MINUTE; // Mon 2 Nov 2026 00:00

// PRE:  dayOffset ≥ 0 counts days after Mon 2 Nov 2026; hour may be fractional
// POST: returns the Minute at that day and hour (UTC = local in this file)
function at(dayOffset: number, hour: number): number {
  return MON_MIDNIGHT + dayOffset * MINUTES_PER_DAY + hour * HOUR;
}

describe('minute conversion', () => {
  it('round-trips toMinute and fromMinute', () => {
    expect(toMinute(fromMinute(MON_MIDNIGHT))).toBe(MON_MIDNIGHT);
    expect(fromMinute(MON_MIDNIGHT).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('toMinute drops seconds', () => {
    expect(toMinute(new Date('2026-11-02T10:00:59.999Z'))).toBe(at(0, 10));
  });

  it('ceilTo rounds up to the next multiple of step, keeping exact multiples', () => {
    const SNAP = 5;

    expect(ceilTo(at(0, 12) + 7, SNAP)).toBe(at(0, 12) + 10);
    expect(ceilTo(at(0, 12) + 10, SNAP)).toBe(at(0, 12) + 10);
  });
});

describe('local calendar helpers', () => {
  it('atLocal builds a local date-time', () => {
    expect(atLocal('2026-11-02', '10:30')).toBe(at(0, 10.5));
  });

  it('localMinuteOfDay gives hours × 60 + minutes', () => {
    expect(localMinuteOfDay(at(0, 13.25))).toBe(13 * HOUR + 15);
  });

  it('startOfLocalDay goes back to local midnight', () => {
    expect(startOfLocalDay(at(2, 23.5))).toBe(at(2, 0));
    expect(startOfLocalDay(at(2, 0))).toBe(at(2, 0));
  });

  it('addLocalDays moves by whole local days', () => {
    expect(addLocalDays(at(0, 9), 3)).toBe(at(3, 9));
  });

  it('onLocalDay places a wall-clock minute on a day, 1440 meaning the next midnight', () => {
    expect(onLocalDay(at(2, 0), 9 * HOUR)).toBe(at(2, 9));
    expect(onLocalDay(at(2, 0), MINUTES_PER_DAY)).toBe(at(3, 0));
  });

  it('startOfLocalWeek goes back to Monday 00:00', () => {
    expect(startOfLocalWeek(at(6, 23.5))).toBe(at(0, 0)); // Sunday belongs to the week before
    expect(startOfLocalWeek(at(0, 0))).toBe(at(0, 0));
  });
});

describe('buildDayFrames', () => {
  const lunch: BarredSlot = {
    id: 'lunch',
    label: 'Lunch',
    startMin: 13 * HOUR,
    endMin: 14 * HOUR,
    days: [1, 2, 3, 4, 5],
  };
  const standup: BarredSlot = {
    id: 'standup',
    label: 'Standup',
    startMin: 9 * HOUR,
    endMin: 9 * HOUR + 15,
    days: [1],
  };
  const withBarred: Settings = { ...DEFAULT_SETTINGS, barredSlots: [lunch, standup] };

  it('emits one frame per day of a week, with 5 work frames', () => {
    const frames = buildDayFrames({ start: at(0, 0), end: at(7, 0) }, DEFAULT_SETTINGS);

    expect(frames.map((frame) => frame.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(frames.map((frame) => frame.dayStart)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((day) => at(day, 0)),
    );
    expect(frames.every((frame) => frame.dayEnd - frame.dayStart === MINUTES_PER_DAY)).toBe(true);
    expect(frames.filter((frame) => frame.work !== null)).toHaveLength(5);
    expect(frames[0]?.work).toEqual({ start: at(0, 9), end: at(0, 18) });
    expect(frames[5]?.work).toBeNull();
  });

  it('puts barred slots only on their days, sorted by start', () => {
    const frames = buildDayFrames({ start: at(0, 0), end: at(7, 0) }, withBarred);

    expect(frames[0]?.barred).toEqual([
      { label: 'Standup', interval: { start: at(0, 9), end: at(0, 9.25) } },
      { label: 'Lunch', interval: { start: at(0, 13), end: at(0, 14) } },
    ]);
    expect(frames[1]?.barred).toEqual([
      { label: 'Lunch', interval: { start: at(1, 13), end: at(1, 14) } },
    ]);
    expect(frames[5]?.barred).toEqual([]);
  });

  it('includes the day of a mid-day window start and excludes the day at a midnight end', () => {
    const frames = buildDayFrames({ start: at(0, 15), end: at(2, 0) }, DEFAULT_SETTINGS);

    expect(frames.map((frame) => frame.dayStart)).toEqual([at(0, 0), at(1, 0)]);
  });

  it('a work or barred end of 24:00 is the day end', () => {
    const lateShift: Settings = {
      ...DEFAULT_SETTINGS,
      workEndMin: MINUTES_PER_DAY,
      barredSlots: [{ ...lunch, startMin: 22 * HOUR, endMin: MINUTES_PER_DAY }],
    };
    const [monday] = buildDayFrames({ start: at(0, 0), end: at(1, 0) }, lateShift);

    expect(monday?.work?.end).toBe(monday?.dayEnd);
    expect(monday?.barred[0]?.interval.end).toBe(monday?.dayEnd);
  });
});
