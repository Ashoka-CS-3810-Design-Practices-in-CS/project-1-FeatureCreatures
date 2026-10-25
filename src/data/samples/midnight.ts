// Two events that overlap after midnight, so the T4 conflict can be seen on screen.

import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExportFile, Minute } from '@/shared/types';
import { at, exportFileOf, sampleEvent } from './build';

const MONDAY = 0;
const TUESDAY = 1;

// PRE:  weekMonday is a local Monday midnight
// POST: returns the midnight sample: Mon 23:00–Tue 01:00 and Tue 00:30–01:30 (one conflict)
export function buildMidnight(weekMonday: Minute): ExportFile {
  const late = { start: at(weekMonday, MONDAY, '23:00'), end: at(weekMonday, TUESDAY, '01:00') };
  const early = { start: at(weekMonday, TUESDAY, '00:30'), end: at(weekMonday, TUESDAY, '01:30') };
  return exportFileOf(
    {
      events: [
        sampleEvent('midnight-late', 'Late shift', late, weekMonday),
        sampleEvent('midnight-early', 'Night call', early, weekMonday),
      ],
      tasks: [],
      settings: DEFAULT_SETTINGS,
    },
    weekMonday,
  );
}
