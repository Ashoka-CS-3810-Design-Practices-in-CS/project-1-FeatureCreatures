// Event form ⇄ EventInput (TECH_SPEC §6 "UI forms"). The form keeps strings (datetime-local
// inputs); the resolver converts them and validates with the shared eventInputSchema.

import { format } from 'date-fns';
import type { FieldError, Resolver } from 'react-hook-form';
import { eventInputSchema, toFieldIssues } from '@/shared/schemas';
import {
  addLocalDays,
  atLocal,
  fromMinute,
  onLocalDay,
  overlapsWorkingHours,
  startOfLocalDay,
} from '@/shared/time';
import type {
  CalendarEvent,
  EventInput,
  Interval,
  Minute,
  Priority,
  Settings,
} from '@/shared/types';

export interface EventFormValues {
  title: string;
  description: string;
  categoryId: string;
  priority: Priority;
  start: string; // datetime-local, 'YYYY-MM-DDTHH:mm'
  end: string;
  flexible: boolean;
  flexStart: string;
  flexEnd: string;
}

type DateField = 'start' | 'end' | 'flexStart' | 'flexEnd';

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";
const DATETIME_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
const DATE_INPUT_FORMAT = 'yyyy-MM-dd';
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
const MISSING_DATE_MESSAGE = 'Enter a date and time.';

// Schema paths that are not form field names (TECH_SPEC §6 table).
const FIELD_FOR_PATH: Record<string, keyof EventFormValues> = {
  'flexWindow.start': 'flexStart',
  'flexWindow.end': 'flexEnd',
  flexWindow: 'flexEnd',
};

// PRE:  minute is an integer Minute
// POST: returns it as a datetime-local value in local time
export function toDateTimeLocal(minute: Minute): string {
  return format(fromMinute(minute), DATETIME_LOCAL_FORMAT);
}

// PRE:  text is any string from a datetime-local input
// POST: returns the Minute it names, or NaN when it is empty or malformed (the schema rejects NaN)
export function fromDateTimeLocal(text: string): Minute {
  const match = DATETIME_LOCAL.exec(text);
  if (match === null) {
    return Number.NaN;
  }
  const [, date = '', time = ''] = match;
  return atLocal(date, time);
}

// PRE:  minute is an integer Minute
// POST: returns its local date as a date-input value, 'YYYY-MM-DD'
export function toDateInput(minute: Minute): string {
  return format(fromMinute(minute), DATE_INPUT_FORMAT);
}

// PRE:  text is any string from a date input
// POST: returns that day's local midnight, or NaN when text is not a date (the engine rejects NaN)
export function fromDateInput(text: string): Minute {
  return DATE_INPUT.test(text) ? atLocal(text, '00:00') : Number.NaN;
}

// PRE:  start ≤ end are the event's Minutes (end defaults to start); settings are valid
// POST: returns the default flex window: start's local day from working start to working end when
//       the event overlaps that day's working hours, otherwise the whole local day 00:00–24:00, so
//       a night or weekend event's window is not empty (WI-41, reports #4 and #9)
export function defaultFlexWindow(
  start: Minute,
  settings: Settings,
  end: Minute = start,
): Interval {
  const day = startOfLocalDay(start);
  if (!overlapsWorkingHours({ start, end }, settings)) {
    return { start: day, end: addLocalDays(day, 1) };
  }
  return {
    start: onLocalDay(day, settings.workStartMin),
    end: onLocalDay(day, settings.workEndMin),
  };
}

// PRE:  source is an existing event, or create defaults with at least start and end; settings valid
// POST: returns the form values for it; a missing flex window falls back to defaultFlexWindow
export function eventFormValues(
  source: CalendarEvent | (Partial<EventInput> & Interval),
  settings: Settings,
): EventFormValues {
  const categoryId = source.categoryId ?? '';
  const window = source.flexWindow ?? defaultFlexWindow(source.start, settings, source.end);
  return {
    title: source.title ?? '',
    description: source.description ?? '',
    categoryId,
    priority: source.priority ?? 'medium',
    start: toDateTimeLocal(source.start),
    end: toDateTimeLocal(source.end),
    flexible: source.flexible ?? false,
    flexStart: toDateTimeLocal(window.start),
    flexEnd: toDateTimeLocal(window.end),
  };
}

// PRE:  form holds the dialog's values (strings may be empty or malformed)
// POST: returns the EventInput they describe; unparseable times become NaN; the flex window is
//       null unless flexible is on
export function toEventInput(form: EventFormValues): EventInput {
  return {
    title: form.title,
    description: form.description,
    categoryId: form.categoryId,
    priority: form.priority,
    start: fromDateTimeLocal(form.start),
    end: fromDateTimeLocal(form.end),
    flexible: form.flexible,
    flexWindow: form.flexible
      ? { start: fromDateTimeLocal(form.flexStart), end: fromDateTimeLocal(form.flexEnd) }
      : null,
  };
}

// PRE:  form holds the dialog's values
// POST: returns the date fields that do not parse, each with MISSING_DATE_MESSAGE
function missingDates(form: EventFormValues): Partial<Record<DateField, FieldError>> {
  const fields: DateField[] = form.flexible
    ? ['start', 'end', 'flexStart', 'flexEnd']
    : ['start', 'end'];
  const errors: Partial<Record<DateField, FieldError>> = {};

  // INVARIANT: errors names every visited field whose value does not parse
  for (const field of fields) {
    if (Number.isNaN(fromDateTimeLocal(form[field]))) {
      errors[field] = { type: 'validation', message: MISSING_DATE_MESSAGE };
    }
  }
  // POST: errors names every unparseable date field

  return errors;
}

// PRE:  form holds the dialog's values (untrusted)
// POST: returns RHF's resolver result: the values when eventInputSchema accepts toEventInput(form),
//       else one error per form field (first issue wins; schema paths mapped by FIELD_FOR_PATH;
//       unparseable dates say "Enter a date and time.")
export const eventResolver: Resolver<EventFormValues> = (form) => {
  const parsed = eventInputSchema.safeParse(toEventInput(form));
  if (parsed.success) {
    return { values: form, errors: {} };
  }
  const errors: Partial<Record<keyof EventFormValues, FieldError>> = {};

  // INVARIANT: errors holds the first message of every visited issue's field
  for (const issue of toFieldIssues(parsed.error)) {
    const field = FIELD_FOR_PATH[issue.path] ?? (issue.path.split('.')[0] as keyof EventFormValues);
    errors[field] ??= { type: 'validation', message: issue.message };
  }
  // POST: every failing field has its first message

  return { values: {}, errors: { ...errors, ...missingDates(form) } };
};
