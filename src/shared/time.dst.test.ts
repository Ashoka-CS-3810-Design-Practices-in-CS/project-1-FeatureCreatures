import { DEFAULT_SETTINGS } from './constants';
import {
  addLocalDays,
  atLocal,
  buildDayFrames,
  localMinuteOfDay,
  onLocalDay,
  startOfLocalDay,
} from './time';
import type { Settings } from './types';

// Runs under TZ=America/New_York (npm run test:dst). DST ends Sun 1 Nov 2026 at 02:00 → 01:00,
// so that local day lasts 25 h. This is the time-module part of T29; the findSlots part needs
// the engine and lives with WI-14.

const HOUR = 60;
const DST_END_DAY_MIN = 25 * HOUR;
const everyDay: Settings = { ...DEFAULT_SETTINGS, workDays: [0, 1, 2, 3, 4, 5, 6] };

it('T53: globally disabled working hours makes the fall-back load frame a whole 25-hour day', () => {
  const start = atLocal('2026-11-01', '00:00');
  const end = atLocal('2026-11-02', '00:00');
  const frames = buildDayFrames({ start, end }, { ...DEFAULT_SETTINGS, useWorkingHours: false });
  expect(frames[0]?.work).toEqual({ start, end });
  expect(end - start).toBe(DST_END_DAY_MIN);
});

describe('time across the end of DST (T29)', () => {
  const dayStart = atLocal('2026-11-01', '00:00');
  const nextDayStart = atLocal('2026-11-02', '00:00');

  it('the local day of 1 Nov 2026 lasts 25 h', () => {
    expect(nextDayStart - dayStart).toBe(DST_END_DAY_MIN);
    expect(addLocalDays(dayStart, 1)).toBe(nextDayStart);
    expect(startOfLocalDay(atLocal('2026-11-01', '23:30'))).toBe(dayStart);
  });

  it('builds the frame with work 09:00–18:00 local, 600 min after midnight', () => {
    const frames = buildDayFrames({ start: dayStart, end: nextDayStart }, everyDay);
    const [frame] = frames;
    if (frame?.work == null) {
      throw new Error('expected one working frame');
    }

    expect(frames).toHaveLength(1);
    expect(frame.dayEnd - frame.dayStart).toBe(DST_END_DAY_MIN);
    expect(frame.work.start - frame.dayStart).toBe(10 * HOUR);
    expect(frame.work.end - frame.work.start).toBe(9 * HOUR);
  });

  it('onLocalDay keeps the wall-clock time on the 25-hour day', () => {
    expect(onLocalDay(atLocal('2026-11-01', '00:00'), 9 * HOUR)).toBe(
      atLocal('2026-11-01', '09:00'),
    );
  });

  it('round-trips atLocal and localMinuteOfDay at 09:00', () => {
    expect(localMinuteOfDay(atLocal('2026-11-01', '09:00'))).toBe(9 * HOUR);
  });
});
