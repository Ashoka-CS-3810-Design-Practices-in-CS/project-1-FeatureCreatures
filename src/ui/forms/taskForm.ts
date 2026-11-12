// Task form ⇄ TaskInput (TECH_SPEC §6 "UI forms"). Duration is entered as hours + minutes; an empty
// or non-numeric value becomes NaN, which the schema rejects with "Duration must be a number."

import type { FieldError, Resolver } from 'react-hook-form';
import { MINUTES_PER_HOUR } from '@/shared/constants';
import { taskInputSchema, toFieldIssues } from '@/shared/schemas';
import { addLocalDays, ceilTo } from '@/shared/time';
import type { Minute, Priority, Task, TaskInput } from '@/shared/types';
import { fromDateTimeLocal, toDateTimeLocal } from './eventForm';

export interface TaskFormValues {
  name: string;
  description: string;
  categoryId: string;
  priority: Priority;
  hours: string;
  minutes: string;
  windowStart: string; // datetime-local
  windowEnd: string;
  useWorkingHours: boolean;
}

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_DURATION_HOURS = '1';
const MISSING_DATE_MESSAGE = 'Enter a date and time.';
const WHOLE_NUMBER = /^\d+$/;

// Schema paths that are not form field names: the duration shows under Hours.
const FIELD_FOR_PATH: Record<string, keyof TaskFormValues> = {
  durationMin: 'hours',
  'window.start': 'windowStart',
  'window.end': 'windowEnd',
  window: 'windowEnd',
};

// PRE:  text is any string from a number input
// POST: returns it as a number of hours or minutes: '' is 0 only when allowEmpty, a non-negative
//       whole number is itself, anything else is NaN
export function wholeNumber(text: string, allowEmpty: boolean): number {
  const trimmed = text.trim();
  if (trimmed === '') {
    return allowEmpty ? 0 : Number.NaN;
  }
  return WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : Number.NaN;
}

// PRE:  form holds the dialog's values (strings may be empty or malformed)
// POST: returns the TaskInput they describe: durationMin = hours × 60 + minutes (NaN when hours is
//       empty or either field is not a whole number); unparseable window ends become NaN
export function toTaskInput(form: TaskFormValues): TaskInput {
  const hours = wholeNumber(form.hours, false);
  const minutes = wholeNumber(form.minutes, true);
  return {
    name: form.name,
    description: form.description,
    categoryId: form.categoryId,
    priority: form.priority,
    durationMin: hours * MINUTES_PER_HOUR + minutes,
    window: { start: fromDateTimeLocal(form.windowStart), end: fromDateTimeLocal(form.windowEnd) },
    useWorkingHours: form.useWorkingHours,
  };
}

// PRE:  source is an existing task, or undefined for a new one; viewDate is the calendar's date
// POST: returns the task's values, or a 1 h medium task whose window runs from the next whole hour
//       for DEFAULT_WINDOW_DAYS local days; the dialog supplies the session's default category
export function taskFormValues(source: Task | undefined, viewDate: Minute): TaskFormValues {
  if (source === undefined) {
    const start = ceilTo(viewDate, MINUTES_PER_HOUR);
    return {
      name: '',
      description: '',
      categoryId: '',
      priority: 'medium',
      hours: DEFAULT_DURATION_HOURS,
      minutes: '0',
      windowStart: toDateTimeLocal(start),
      windowEnd: toDateTimeLocal(addLocalDays(start, DEFAULT_WINDOW_DAYS)),
      useWorkingHours: true,
    };
  }
  return {
    name: source.name,
    description: source.description,
    categoryId: source.categoryId,
    priority: source.priority,
    hours: String(Math.floor(source.durationMin / MINUTES_PER_HOUR)),
    minutes: String(source.durationMin % MINUTES_PER_HOUR),
    windowStart: toDateTimeLocal(source.window.start),
    windowEnd: toDateTimeLocal(source.window.end),
    useWorkingHours: source.useWorkingHours,
  };
}

// PRE:  form holds the dialog's values (untrusted)
// POST: returns RHF's resolver result: the values when taskInputSchema accepts toTaskInput(form),
//       else one error per form field (first issue wins; the duration shows under hours;
//       unparseable window ends say "Enter a date and time.")
export const taskResolver: Resolver<TaskFormValues> = (form) => {
  const parsed = taskInputSchema.safeParse(toTaskInput(form));
  if (parsed.success) {
    return { values: form, errors: {} };
  }
  const errors: Partial<Record<keyof TaskFormValues, FieldError>> = {};

  // INVARIANT: errors holds the first message of every visited issue's field
  for (const issue of toFieldIssues(parsed.error)) {
    const field = FIELD_FOR_PATH[issue.path] ?? (issue.path.split('.')[0] as keyof TaskFormValues);
    errors[field] ??= { type: 'validation', message: issue.message };
  }
  // POST: every failing field has its first message

  const windowFields = ['windowStart', 'windowEnd'] as const;
  // INVARIANT: every visited window field that does not parse asks for a date
  for (const field of windowFields) {
    if (Number.isNaN(fromDateTimeLocal(form[field]))) {
      errors[field] = { type: 'validation', message: MISSING_DATE_MESSAGE };
    }
  }
  // POST: every unparseable window field asks for a date

  return { values: {}, errors };
};
