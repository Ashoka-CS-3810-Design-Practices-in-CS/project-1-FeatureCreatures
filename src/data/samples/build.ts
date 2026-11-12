// Record builders shared by the sample calendars (TECH_SPEC §9.5). Every time is placed with
// onLocalDay relative to the sample week's Monday, so samples stay correct across DST changes.

import {
  DEFAULT_CATEGORIES,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  MINUTES_PER_HOUR,
} from '@/shared/constants';
import { addLocalDays, fromMinute, onLocalDay } from '@/shared/time';
import type { CalendarEvent, ExportFile, Interval, Minute, Settings, Task } from '@/shared/types';

const CLOCK_TIME = /^(\d{2}):(\d{2})$/;

// PRE:  weekMonday is a local Monday midnight; dayIndex ≥ 0 counts local days from it;
//       time is 'HH:mm' (00:00 … 24:00) — samples are written by hand, so a typo throws
// POST: returns the Minute of that local wall-clock time on that day
export function at(weekMonday: Minute, dayIndex: number, time: string): Minute {
  const match = CLOCK_TIME.exec(time);
  if (match === null) {
    throw new Error(`Bad sample time "${time}"`);
  }
  const [, hours = '0', minutes = '0'] = match;
  const minuteOfDay = Number(hours) * MINUTES_PER_HOUR + Number(minutes);
  return onLocalDay(addLocalDays(weekMonday, dayIndex), minuteOfDay);
}

// PRE:  as at() for both ends, with from before to
// POST: returns the interval [at(from), at(to)) on that day
export function span(weekMonday: Minute, dayIndex: number, from: string, to: string): Interval {
  return { start: at(weekMonday, dayIndex, from), end: at(weekMonday, dayIndex, to) };
}

// PRE:  id and title are non-empty; interval has start < end; createdAt is a Minute
// POST: returns a fixed medium meeting over interval, with overrides applied
export function sampleEvent(
  id: string,
  title: string,
  interval: Interval,
  createdAt: Minute,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title,
    description: '',
    categoryId: 'meeting',
    keptInBarred: [],
    priority: 'medium',
    ...interval,
    flexible: false,
    flexWindow: null,
    taskId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

// PRE:  id and name are non-empty; durationMin is 5 … 1440; window has start < end
// POST: returns an unscheduled medium assignment task that respects working hours, with overrides
export function sampleTask(
  id: string,
  name: string,
  durationMin: number,
  window: Interval,
  createdAt: Minute,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    name,
    description: '',
    categoryId: 'assignment',
    priority: 'medium',
    durationMin,
    window,
    useWorkingHours: true,
    status: 'unscheduled',
    doneAt: null,
    scheduledEventId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

// PRE:  the records are valid and consistent; exportedAt is a Minute
// POST: returns them as an ExportFile stamped with exportedAt
export function exportFileOf(
  data: { events: CalendarEvent[]; tasks: Task[]; settings: Settings },
  exportedAt: Minute,
): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: fromMinute(exportedAt).toISOString(),
    categories: structuredClone([...DEFAULT_CATEGORIES]),
    ...data,
  };
}
