import { MINUTES_PER_HOUR } from './constants';

const CLOCK_FIELD_WIDTH = 2;

// PRE: minuteOfDay is an integer 0 … 1440
// POST: returns HH:mm, including 24:00 for the end of a day
export function toClockTime(minuteOfDay: number): string {
  const hours = String(Math.floor(minuteOfDay / MINUTES_PER_HOUR)).padStart(CLOCK_FIELD_WIDTH, '0');
  const minutes = String(minuteOfDay % MINUTES_PER_HOUR).padStart(CLOCK_FIELD_WIDTH, '0');
  return `${hours}:${minutes}`;
}
