// User-facing time strings (TECH_SPEC §11.6, BR-1): 24-hour HH:mm, days as "Tue 3 Nov".

import { format } from 'date-fns';
import { MINUTES_PER_HOUR } from '@/shared/constants';
import { fromMinute, startOfLocalDay } from '@/shared/time';
import type { Interval, Minute } from '@/shared/types';
import type { ViewType } from '../store/appStore';

const TIME_FORMAT = 'HH:mm';
const DAY_FORMAT = 'EEE d MMM';
const DAY_TITLE_FORMAT = 'EEE d MMM yyyy';
const WEEK_TITLE_FORMAT = "'Week of' d MMM yyyy";
const MONTH_TITLE_FORMAT = 'MMMM yyyy';
export { toClockTime } from '@/shared/clockText';
const VIEW_TITLE_FORMAT: Record<ViewType, string> = {
  timeGridDay: DAY_TITLE_FORMAT,
  timeGridWeek: WEEK_TITLE_FORMAT,
  listWeek: WEEK_TITLE_FORMAT,
  dayGridMonth: MONTH_TITLE_FORMAT,
};

// PRE:  minute is an integer Minute
// POST: returns its local time as HH:mm
export function fmtTime(minute: Minute): string {
  return format(fromMinute(minute), TIME_FORMAT);
}

// PRE:  minute is an integer Minute
// POST: returns its local day as "EEE d MMM", e.g. "Tue 3 Nov"
export function fmtDay(minute: Minute): string {
  return format(fromMinute(minute), DAY_FORMAT);
}

// PRE:  interval has start < end
// POST: returns "Tue 3 Nov 11:00–11:30", or "Mon 2 Nov 23:00 – Tue 3 Nov 01:00" when the end falls
//       on a later local day (an end at exactly midnight still counts as the start's day)
export function fmtRange(interval: Interval): string {
  const lastMinute = interval.end - 1;
  if (startOfLocalDay(lastMinute) === startOfLocalDay(interval.start)) {
    return `${fmtDay(interval.start)} ${fmtTime(interval.start)}–${fmtTime(interval.end)}`;
  }
  return `${fmtDay(interval.start)} ${fmtTime(interval.start)} – ${fmtDay(interval.end)} ${fmtTime(interval.end)}`;
}

// PRE:  minutes is an integer ≥ 0
// POST: returns "45 min", "1 h" or "1 h 30 min"
export function fmtDuration(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// PRE:  type is the shown view; periodStart is the first day of the period it shows
// POST: returns the toolbar title: "Tue 3 Nov 2026", "Week of 2 Nov 2026" or "November 2026"
export function fmtViewTitle(type: ViewType, periodStart: Minute): string {
  return format(fromMinute(periodStart), VIEW_TITLE_FORMAT[type]);
}
