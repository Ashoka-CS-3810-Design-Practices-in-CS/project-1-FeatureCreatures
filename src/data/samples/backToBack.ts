// Monday booked solid with touching one-hour events: touching is not a conflict (BR-2).

import { DEFAULT_SETTINGS, MINUTES_PER_HOUR } from '@/shared/constants';
import type { CalendarEvent, ExportFile, Minute } from '@/shared/types';
import { at, exportFileOf, sampleEvent } from './build';

const MONDAY = 0;
const EVENT_COUNT = 8; // 09:00 – 17:00

// PRE:  weekMonday is a local Monday midnight
// POST: returns the back-to-back sample: 8 consecutive one-hour events Mon 09:00–17:00, no conflicts
export function buildBackToBack(weekMonday: Minute): ExportFile {
  const firstStart = at(weekMonday, MONDAY, '09:00');
  const events: CalendarEvent[] = [];

  // INVARIANT: events holds blocks 1 … index, each one hour, the first starting at 09:00
  for (let index = 0; index < EVENT_COUNT; index += 1) {
    const start = firstStart + index * MINUTES_PER_HOUR;
    const interval = { start, end: start + MINUTES_PER_HOUR };
    events.push(sampleEvent(`b2b-${index + 1}`, `Block ${index + 1}`, interval, weekMonday));
  }
  // POST: events covers 09:00–17:00 in touching one-hour blocks

  return exportFileOf({ events, tasks: [], settings: DEFAULT_SETTINGS }, weekMonday);
}
