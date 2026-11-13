// Settings form ⇄ Settings (TECH_SPEC §6 "UI forms", FR11). Times of day are 'HH:mm' time inputs,
// weekdays are checkbox values '0'…'6'; the resolver validates with the shared settingsSchema.

import type { FieldError, FieldErrors, Resolver } from 'react-hook-form';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from '@/shared/constants';
import { settingsSchema, storedSettingsSchema, toFieldIssues } from '@/shared/schemas';
import type { BarredSlot, Settings, UserCriterion, Weekday } from '@/shared/types';
import { toClockTime } from '../format/time';
import { wholeNumber } from './taskForm';

export interface BarredSlotFormValues {
  id: string;
  label: string;
  start: string; // time input, 'HH:mm'
  end: string; // '00:00' means midnight at the end of the day
  days: string[]; // checked weekday values, '0' = Sunday
}

export interface SettingsFormValues {
  useWorkingHours: boolean;
  workDays: string[];
  workStart: string;
  workEnd: string;
  bufferMin: string;
  defaultCriterion: UserCriterion;
  barredSlots: BarredSlotFormValues[];
}

type TopField = Exclude<keyof SettingsFormValues, 'barredSlots'>;
type SlotField = keyof BarredSlotFormValues;

const CLOCK_TIME = /^(\d{2}):(\d{2})$/;
const MISSING_TIME_MESSAGE = 'Enter a time.';
const NEW_SLOT_LABEL = 'Lunch';
const NEW_SLOT_START = '12:00';
const NEW_SLOT_END = '13:00';

// Schema paths whose form field has another name.
const TOP_FIELD_FOR_KEY: Record<string, TopField> = {
  workStartMin: 'workStart',
  workEndMin: 'workEnd',
};
const SLOT_FIELD_FOR_KEY: Record<string, SlotField> = { startMin: 'start', endMin: 'end' };

// PRE:  text is any string from a time input; isEnd says whether it ends a range
// POST: returns its minute of the day ('00:00' as an end is MINUTES_PER_DAY, midnight at the end
//       of the day), or NaN when text is not 'HH:mm'
export function fromClockTime(text: string, isEnd: boolean): number {
  const match = CLOCK_TIME.exec(text);
  if (match === null) {
    return Number.NaN;
  }
  const [, hours = '', minutes = ''] = match;
  const minuteOfDay = Number(hours) * MINUTES_PER_HOUR + Number(minutes);
  return isEnd && minuteOfDay === 0 ? MINUTES_PER_DAY : minuteOfDay;
}

// PRE:  minuteOfDay is an integer 0 … 1440
// POST: returns it as a time-input value; 1440 (end of day) shows as '00:00'
function toClockInput(minuteOfDay: number): string {
  return toClockTime(minuteOfDay % MINUTES_PER_DAY);
}

// PRE:  values are checkbox values, each one of '0'…'6'
// POST: returns them as weekdays in ascending order
function toWeekdays(values: readonly string[]): Weekday[] {
  return values.map((value) => Number(value) as Weekday).sort((first, second) => first - second);
}

// PRE:  slot is a barred slot from settings
// POST: returns its form row
function barredSlotValues(slot: BarredSlot): BarredSlotFormValues {
  return {
    id: slot.id,
    label: slot.label,
    start: toClockInput(slot.startMin),
    end: toClockInput(slot.endMin),
    days: slot.days.map(String),
  };
}

// PRE:  id is a fresh barred-slot id; days are checkbox values
// POST: returns a new form row: a 12:00–13:00 "Lunch" on days
export function newBarredSlotValues(id: string, days: readonly string[]): BarredSlotFormValues {
  return { id, label: NEW_SLOT_LABEL, start: NEW_SLOT_START, end: NEW_SLOT_END, days: [...days] };
}

// PRE:  settings are valid
// POST: returns the form values that show them
export function settingsFormValues(settings: Settings): SettingsFormValues {
  return {
    useWorkingHours: settings.useWorkingHours,
    workDays: settings.workDays.map(String),
    workStart: toClockInput(settings.workStartMin),
    workEnd: toClockInput(settings.workEndMin),
    bufferMin: String(settings.bufferMin),
    defaultCriterion: settings.defaultCriterion,
    barredSlots: settings.barredSlots.map(barredSlotValues),
  };
}

// PRE:  form holds the dialog's values (strings may be empty or malformed)
// POST: returns the Settings they describe; unreadable times and a non-whole buffer become NaN
export function toSettings(form: SettingsFormValues): Settings {
  return {
    useWorkingHours: form.useWorkingHours,
    workDays: toWeekdays(form.workDays),
    workStartMin: fromClockTime(form.workStart, false),
    workEndMin: fromClockTime(form.workEnd, true),
    bufferMin: wholeNumber(form.bufferMin, false),
    defaultCriterion: form.defaultCriterion,
    barredSlots: form.barredSlots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      startMin: fromClockTime(slot.start, false),
      endMin: fromClockTime(slot.end, true),
      days: toWeekdays(slot.days),
    })),
  };
}

// PRE:  form holds the dialog's values
// POST: returns "Enter a time." under every time field that does not parse: top for workStart /
//       workEnd, and one entry per barred-slot row (in form order) for its start / end
function unreadableTimes(form: SettingsFormValues): {
  top: Partial<Record<TopField, FieldError>>;
  slots: Partial<Record<SlotField, FieldError>>[];
} {
  const missing: FieldError = { type: 'validation', message: MISSING_TIME_MESSAGE };
  return {
    top: timePairErrors(form.workStart, form.workEnd, missing, 'workStart', 'workEnd'),
    slots: form.barredSlots.map((slot) =>
      timePairErrors(slot.start, slot.end, missing, 'start', 'end'),
    ),
  };
}

// PRE:  start and end are time-input values; startField and endField name their form fields
// POST: returns missing under each field whose value does not parse
function timePairErrors<Field extends string>(
  start: string,
  end: string,
  missing: FieldError,
  startField: Field,
  endField: Field,
): Partial<Record<Field, FieldError>> {
  const errors: Partial<Record<Field, FieldError>> = {};
  if (Number.isNaN(fromClockTime(start, false))) {
    errors[startField] = missing;
  }
  if (Number.isNaN(fromClockTime(end, true))) {
    errors[endField] = missing;
  }
  return errors;
}

// PRE:  form holds untrusted values; validateOverlaps says whether barred content is editable
// POST: returns RHF's resolver result using current overlap rules or legacy-readable settings,
//       else the first message per field, nested as RHF expects (barred-slot issues under
//       barredSlots[row].field); unreadable times say "Enter a time."
function resolveSettingsForm(
  form: SettingsFormValues,
  validateOverlaps: boolean,
): ReturnType<Resolver<SettingsFormValues>> {
  const schema = validateOverlaps ? settingsSchema : storedSettingsSchema;
  const parsed = schema.safeParse(toSettings(form));
  if (parsed.success) {
    return { values: form, errors: {} };
  }
  const { top, slots } = unreadableTimes(form);

  // INVARIANT: top and slots hold the first message of every visited issue's field, after the
  //            unreadable-time messages, which take precedence
  for (const issue of toFieldIssues(parsed.error)) {
    const [key = '', rowText, slotKey = ''] = issue.path.split('.');
    const error: FieldError = { type: 'validation', message: issue.message };
    const row = key === 'barredSlots' ? slots[Number(rowText)] : undefined;
    if (row !== undefined) {
      row[SLOT_FIELD_FOR_KEY[slotKey] ?? (slotKey as SlotField)] ??= error;
    } else {
      top[TOP_FIELD_FOR_KEY[key] ?? (key as TopField)] ??= error;
    }
  }
  // POST: every failing field has exactly one message

  const hasSlotErrors = slots.some((row) => Object.keys(row).length > 0);
  // Rows without errors stay undefined, so RHF sees only the failing rows.
  const barredSlots = slots.map((row) => (Object.keys(row).length > 0 ? row : undefined));
  const errors: FieldErrors<SettingsFormValues> = hasSlotErrors ? { ...top, barredSlots } : top;
  return { values: {}, errors };
}

// PRE:  form is untrusted barred-editor input
// POST: rejects overlapping barred edits with the existing nested field error mapping
export const settingsResolver: Resolver<SettingsFormValues> = (form) =>
  resolveSettingsForm(form, true);

// PRE:  form is untrusted Settings input; barred rows are not editable here
// POST: validates working-time/default fields while retaining readable legacy barred rows
export const settingsDefaultsResolver: Resolver<SettingsFormValues> = (form) =>
  resolveSettingsForm(form, false);
