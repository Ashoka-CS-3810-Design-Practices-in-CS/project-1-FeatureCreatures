import { DEFAULT_SETTINGS, MAX_EVENT_MIN, PRIORITY_RANK } from './constants';

describe('constants', () => {
  it('ranks priorities high > medium > low (BR-13)', () => {
    expect(PRIORITY_RANK.high).toBeGreaterThan(PRIORITY_RANK.medium);
    expect(PRIORITY_RANK.medium).toBeGreaterThan(PRIORITY_RANK.low);
  });

  it('caps events at 24 hours (BR-4)', () => {
    const MINUTES_PER_DAY = 24 * 60;

    expect(MAX_EVENT_MIN).toBe(MINUTES_PER_DAY);
  });

  it('defaults to Mon–Fri 09:00–18:00, no buffer, earliest (PROJECT_SCHEMA §3.2)', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      workDays: [1, 2, 3, 4, 5],
      workStartMin: 9 * 60,
      workEndMin: 18 * 60,
      bufferMin: 0,
      barredSlots: [],
      defaultCriterion: 'earliest',
    });
  });
});
