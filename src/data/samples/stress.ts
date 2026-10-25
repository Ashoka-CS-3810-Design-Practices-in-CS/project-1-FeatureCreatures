// 5,000 seeded events over 100 weeks, for the performance demo (T15, NFR1). A jittered hourly grid
// keeps conflicts rare, as the A3 analysis assumes.

import { DEFAULT_SETTINGS, MINUTES_PER_HOUR } from '@/shared/constants';
import type { CalendarEvent, ExportFile, Minute } from '@/shared/types';
import { at, exportFileOf, sampleEvent } from './build';
import { mulberry32, nextInt } from './prng';

export const STRESS_SEED = 42;
export const STRESS_WEEKS = 100;
const WORKING_DAYS_PER_WEEK = 5;
const DAYS_PER_WEEK = 7;
const EVENTS_PER_DAY = 10; // one per hour from 08:00
const MAX_JITTER_MIN = 10;
const MIN_LENGTH_MIN = 20;
const MAX_LENGTH_MIN = 60;

// PRE:  random comes from mulberry32; firstSlot is a day's 08:00; dayKey names that day uniquely
// POST: returns the day's EVENTS_PER_DAY events: slot k starts at firstSlot + k h + jitter
function stressDay(
  random: () => number,
  firstSlot: Minute,
  dayKey: string,
  createdAt: Minute,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // INVARIANT: events holds one event for each of the slots 0 … slot − 1
  for (let slot = 0; slot < EVENTS_PER_DAY; slot += 1) {
    const start = firstSlot + slot * MINUTES_PER_HOUR + nextInt(random, 0, MAX_JITTER_MIN);
    const end = start + nextInt(random, MIN_LENGTH_MIN, MAX_LENGTH_MIN);
    const id = `stress-${dayKey}-${slot}`;
    events.push(sampleEvent(id, `Item ${dayKey}.${slot}`, { start, end }, createdAt));
  }
  // POST: events holds the day's EVENTS_PER_DAY events

  return events;
}

// PRE:  weekMonday is a local Monday midnight; seed is an integer
// POST: returns STRESS_WEEKS × 5 working days × 10 events, repeatable for seed (default sample: 42)
export function buildStress(weekMonday: Minute, seed = STRESS_SEED): ExportFile {
  const random = mulberry32(seed);
  const events: CalendarEvent[] = [];

  // INVARIANT: events holds the events of weeks 0 … week − 1, in order
  for (let week = 0; week < STRESS_WEEKS; week += 1) {
    // INVARIANT: events also holds the events of working days 0 … day − 1 of this week
    for (let day = 0; day < WORKING_DAYS_PER_WEEK; day += 1) {
      const firstSlot = at(weekMonday, week * DAYS_PER_WEEK + day, '08:00');
      events.push(...stressDay(random, firstSlot, `${week}-${day}`, weekMonday));
    }
    // POST: events holds every working day of this week
  }
  // POST: events holds all STRESS_WEEKS weeks

  return exportFileOf({ events, tasks: [], settings: DEFAULT_SETTINGS }, weekMonday);
}
