// A light week with one conflict, a barred lunch and four tasks: the main demo calendar (D1–D3).

import { DEFAULT_SETTINGS, MINUTES_PER_HOUR } from '@/shared/constants';
import type { ExportFile, Minute } from '@/shared/types';
import { at, exportFileOf, sampleEvent, sampleTask, span } from './build';

const MONDAY = 0;
const TUESDAY = 1;
const WEDNESDAY = 2;
const THURSDAY = 3;
const FRIDAY = 4;
const LUNCH_START_HOUR = 13;
const LUNCH_END_HOUR = 14;
const REPORT_MIN = 90;
const CHAPTER_MIN = 45;
const GYM_MIN = 60;
const THESIS_MIN = 600; // longer than any stretch between lunch and the working-day edges (ER2)

// PRE:  weekMonday is a local Monday midnight
// POST: returns the sparse-week sample (TECH_SPEC §9.5): 8 events Mon–Fri with one conflict
//       (Tue Lecture ↔ Meeting), Lunch barred 13:00–14:00 Mon–Fri, and 4 unscheduled tasks
export function buildSparseWeek(weekMonday: Minute): ExportFile {
  const week = { start: at(weekMonday, MONDAY, '09:00'), end: at(weekMonday, FRIDAY, '18:00') };
  const on = (day: number, from: string, to: string) => span(weekMonday, day, from, to);
  const flexible = { flexible: true, flexWindow: week };
  const highClass = { categoryId: 'class', priority: 'high' } as const;
  return exportFileOf(
    {
      events: [
        sampleEvent(
          'sparse-algorithms',
          'Algorithms lecture',
          on(MONDAY, '09:00', '10:30'),
          weekMonday,
          highClass,
        ),
        sampleEvent(
          'sparse-lecture',
          'Lecture',
          on(TUESDAY, '10:00', '11:30'),
          weekMonday,
          highClass,
        ),
        sampleEvent(
          'sparse-meeting',
          'Meeting',
          on(TUESDAY, '11:00', '12:00'),
          weekMonday,
          flexible,
        ),
        sampleEvent('sparse-lab', 'Lab', on(WEDNESDAY, '09:00', '10:00'), weekMonday, {
          categoryId: 'class',
        }),
        sampleEvent('sparse-study', 'Study', on(WEDNESDAY, '15:00', '16:30'), weekMonday, {
          ...flexible,
          categoryId: 'personal',
          priority: 'low',
        }),
        sampleEvent(
          'sparse-seminar',
          'Seminar',
          on(THURSDAY, '10:00', '12:00'),
          weekMonday,
          highClass,
        ),
        sampleEvent(
          'sparse-office-hours',
          'Office hours',
          on(THURSDAY, '14:00', '15:00'),
          weekMonday,
          { categoryId: 'appointment', priority: 'low' },
        ),
        sampleEvent('sparse-tutorial', 'Tutorial', on(FRIDAY, '09:30', '10:30'), weekMonday, {
          categoryId: 'class',
        }),
      ],
      tasks: [
        sampleTask('sparse-report', 'Write report', REPORT_MIN, week, weekMonday, {
          priority: 'high',
        }),
        sampleTask('sparse-chapter', 'Read chapter 4', CHAPTER_MIN, week, weekMonday),
        sampleTask('sparse-gym', 'Gym', GYM_MIN, week, weekMonday, {
          categoryId: 'personal',
          priority: 'low',
        }),
        sampleTask('sparse-thesis', 'Thesis draft', THESIS_MIN, week, weekMonday),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        barredSlots: [
          {
            id: 'lunch',
            label: 'Lunch',
            startMin: LUNCH_START_HOUR * MINUTES_PER_HOUR,
            endMin: LUNCH_END_HOUR * MINUTES_PER_HOUR,
            days: [1, 2, 3, 4, 5],
          },
        ],
      },
    },
    weekMonday,
  );
}
