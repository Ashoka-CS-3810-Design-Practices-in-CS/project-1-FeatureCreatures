import { atLocal, fromMinute } from '@/shared/time';
import { nowGuideEntries } from './nowGuides';

describe('T52: now guides across the fall-back local day', () => {
  it('keeps 09:00 on every day, including the 25-hour day', () => {
    const entries = nowGuideEntries(
      { start: atLocal('2026-10-31', '00:00'), end: atLocal('2026-11-03', '00:00') },
      atLocal('2026-11-02', '09:00'),
    );
    expect(entries.map((entry) => entry.start)).toEqual(
      ['2026-10-31', '2026-11-01', '2026-11-02'].map((day) => fromMinute(atLocal(day, '09:00'))),
    );
    expect(entries.map((entry) => entry.end)).toEqual(
      ['2026-10-31', '2026-11-01', '2026-11-02'].map((day) => fromMinute(atLocal(day, '09:01'))),
    );
  });
});
