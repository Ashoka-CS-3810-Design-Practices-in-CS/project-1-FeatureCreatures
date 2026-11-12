// Record builders for tests (TEST_PLAN §2). Times are t() specs such as 'Mon 10:00'.

import { DEFAULT_SETTINGS, MINUTES_PER_DAY } from '@/shared/constants';
import type { CalendarEvent, DayFrame, Interval, Settings, Task, Weekday } from '@/shared/types';
import { BASE_MONDAY, t } from './time';

// PRE:  from and to are valid t() specs
// POST: returns the interval [t(from), t(to))
export function iv(from: string, to: string): Interval {
  return { start: t(from), end: t(to) };
}

// PRE:  id is non-empty; start and end are valid t() specs
// POST: returns a fixed medium-priority meeting titled id over [t(start), t(end)), with overrides applied
//       (defaults: description '', flexWindow null, taskId null, createdAt = updatedAt = BASE_MONDAY)
export function ev(
  id: string,
  start: string,
  end: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    categoryId: 'meeting',
    keptInBarred: [],
    priority: 'medium',
    start: t(start),
    end: t(end),
    flexible: false,
    flexWindow: null,
    taskId: null,
    createdAt: BASE_MONDAY,
    updatedAt: BASE_MONDAY,
    ...overrides,
  };
}

// PRE:  as ev(); window holds two valid t() specs
// POST: returns ev(id, start, end) made flexible with flexWindow = iv(window[0], window[1]), then overrides
export function flexEv(
  id: string,
  start: string,
  end: string,
  window: [string, string],
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return ev(id, start, end, { flexible: true, flexWindow: iv(...window), ...overrides });
}

// PRE:  id is non-empty; durationMin is an integer minute count; window holds two valid t() specs
// POST: returns an unscheduled medium-priority assignment task named id, with overrides applied
//       (defaults: description '', useWorkingHours true, createdAt = updatedAt = BASE_MONDAY)
export function task(
  id: string,
  durationMin: number,
  window: [string, string],
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    name: id,
    description: '',
    categoryId: 'assignment',
    priority: 'medium',
    durationMin,
    window: iv(...window),
    useWorkingHours: true,
    status: 'unscheduled',
    doneAt: null,
    scheduledEventId: null,
    createdAt: BASE_MONDAY,
    updatedAt: BASE_MONDAY,
    ...overrides,
  };
}

// PRE:  overrides holds any subset of Settings
// POST: returns DEFAULT_SETTINGS with overrides applied
export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export type BaseDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

const WEEKDAY_OF: Record<BaseDay, Weekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
};

const END_OF_DAY = '24:00';

// PRE:  day is a base-week day; work holds two HH:mm times on that day, or is null; each barred
//       entry is [label, HH:mm start, HH:mm end]; '24:00' means the end of the day
// POST: returns that day's DayFrame as shared/time.ts builds it under TZ=UTC, so algorithm tests
//       (which may not import shared/time.ts) can state frames directly
export function dayFrame(
  day: BaseDay,
  work: [string, string] | null,
  barred: [string, string, string][] = [],
): DayFrame {
  const dayStart = t(`${day} 00:00`);
  const dayEnd = dayStart + MINUTES_PER_DAY;
  const at = (time: string) => (time === END_OF_DAY ? dayEnd : t(`${day} ${time}`));
  return {
    dayStart,
    dayEnd,
    weekday: WEEKDAY_OF[day],
    work: work === null ? null : { start: at(work[0]), end: at(work[1]) },
    barred: barred.map(([label, from, to]) => ({
      label,
      interval: { start: at(from), end: at(to) },
    })),
  };
}
