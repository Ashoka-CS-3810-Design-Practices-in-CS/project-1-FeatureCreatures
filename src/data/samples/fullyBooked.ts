// Thursday booked from 09:00 to 18:00 except a 15-minute gap, plus a 30-minute task (shows ER3).

import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExportFile, Minute } from '@/shared/types';
import { exportFileOf, sampleEvent, sampleTask, span } from './build';

const THURSDAY = 3;
const TASK_MIN = 30;

// PRE:  weekMonday is a local Monday midnight
// POST: returns the fully-booked sample: Thu 09:00–18:00 busy except 12:00–12:15, and an unscheduled
//       30 min task windowed to Thursday's working hours
export function buildFullyBooked(weekMonday: Minute): ExportFile {
  const on = (from: string, to: string) => span(weekMonday, THURSDAY, from, to);
  return exportFileOf(
    {
      events: [
        sampleEvent('booked-1', 'Workshop', on('09:00', '10:30'), weekMonday),
        sampleEvent('booked-2', 'Review', on('10:30', '12:00'), weekMonday),
        sampleEvent('booked-3', 'Client call', on('12:15', '14:00'), weekMonday),
        sampleEvent('booked-4', 'Planning', on('14:00', '18:00'), weekMonday),
      ],
      tasks: [sampleTask('booked-task', 'Quick email', TASK_MIN, on('09:00', '18:00'), weekMonday)],
      settings: DEFAULT_SETTINGS,
    },
    weekMonday,
  );
}
