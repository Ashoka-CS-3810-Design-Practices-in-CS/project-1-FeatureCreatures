// Record builders for tests (TEST_PLAN §2). Times are t() specs such as 'Mon 10:00'.

import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { CalendarEvent, Interval, Settings, Task } from '@/shared/types';
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
    category: 'meeting',
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
    category: 'assignment',
    priority: 'medium',
    durationMin,
    window: iv(...window),
    useWorkingHours: true,
    status: 'unscheduled',
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
