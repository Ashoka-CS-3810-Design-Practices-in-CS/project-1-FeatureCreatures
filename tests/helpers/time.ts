// Test time helpers (TEST_PLAN §2). Tests run with TZ=UTC, so local time equals UTC.

import { atLocal } from '@/shared/time';
import type { Minute } from '@/shared/types';

export const BASE_MONDAY = atLocal('2026-11-02', '00:00'); // Monday 2 Nov 2026

// The base week Mon 2 – Sun 8 Nov 2026.
const BASE_WEEK_DATES: Record<string, string> = {
  Mon: '2026-11-02',
  Tue: '2026-11-03',
  Wed: '2026-11-04',
  Thu: '2026-11-05',
  Fri: '2026-11-06',
  Sat: '2026-11-07',
  Sun: '2026-11-08',
};

const WEEKDAY_SPEC = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{2}:\d{2})$/;
const EXPLICIT_SPEC = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;

/** t('Mon 10:00') … t('Sun 23:30') → that time in the base week (Mon 2 – Sun 8 Nov 2026).
 *  t('2026-11-01 09:00') → explicit local date-time. */
// PRE:  spec is untrusted test text
// POST: returns the Minute spec names; throws on any other format so a typo fails the test loudly
export function t(spec: string): Minute {
  const weekdayMatch = WEEKDAY_SPEC.exec(spec);
  if (weekdayMatch !== null) {
    const [, weekday = '', time = ''] = weekdayMatch;
    return atLocal(BASE_WEEK_DATES[weekday] ?? '', time);
  }
  const explicitMatch = EXPLICIT_SPEC.exec(spec);
  if (explicitMatch !== null) {
    const [, date = '', time = ''] = explicitMatch;
    return atLocal(date, time);
  }
  throw new Error(`t(): unrecognised time spec "${spec}"`);
}
