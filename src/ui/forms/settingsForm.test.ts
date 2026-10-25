import type { ResolverOptions } from 'react-hook-form';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { BarredSlot } from '@/shared/types';
import { settings } from '../../../tests/helpers/builders';
import {
  fromClockTime,
  newBarredSlotValues,
  settingsFormValues,
  settingsResolver,
  toSettings,
  type SettingsFormValues,
} from './settingsForm';

const lunch: BarredSlot = { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1, 3] };

// PRE:  overrides holds any subset of the form values
// POST: returns the default settings' form values with a Lunch barred slot, with overrides applied
function form(overrides: Partial<SettingsFormValues> = {}): SettingsFormValues {
  return { ...settingsFormValues(settings({ barredSlots: [lunch] })), ...overrides };
}

// PRE:  values are form values
// POST: returns settingsResolver's errors (RHF's nested shape)
async function errorsOf(values: SettingsFormValues) {
  const result = await settingsResolver(
    values,
    undefined,
    {} as ResolverOptions<SettingsFormValues>,
  );
  return result.errors;
}

describe('settingsForm', () => {
  it('shows settings as form strings, and converts them back unchanged', () => {
    const values = form();

    expect(values).toEqual({
      workDays: ['1', '2', '3', '4', '5'],
      workStart: '09:00',
      workEnd: '18:00',
      bufferMin: '0',
      defaultCriterion: 'earliest',
      barredSlots: [
        { id: 'lunch', label: 'Lunch', start: '13:00', end: '14:00', days: ['1', '3'] },
      ],
    });
    expect(toSettings(values)).toEqual(settings({ barredSlots: [lunch] }));
  });

  it('reads an end time of 00:00 as midnight at the end of the day, and shows it back as 00:00', () => {
    expect(fromClockTime('00:00', true)).toBe(1440);
    expect(fromClockTime('00:00', false)).toBe(0);
    expect(fromClockTime('07:45', false)).toBe(465);
    expect(fromClockTime('', false)).toBeNaN();
    expect(settingsFormValues(settings({ workEndMin: 1440 })).workEnd).toBe('00:00');
  });

  it('sorts the working days and reads a blank buffer as NaN', () => {
    const converted = toSettings(form({ workDays: ['5', '0', '2'], bufferMin: ' ' }));

    expect(converted.workDays).toEqual([0, 2, 5]);
    expect(converted.bufferMin).toBeNaN();
  });

  it('accepts valid values', async () => {
    expect(await errorsOf(form())).toEqual({});
  });

  it('rejects working hours that end at or before they start', async () => {
    const errors = await errorsOf(form({ workStart: '18:00', workEnd: '09:00' }));

    expect(errors.workEnd?.message).toBe('Working hours must end after they start.');
  });

  it('rejects no working days, a buffer out of range and an unreadable time', async () => {
    const errors = await errorsOf(form({ workDays: [], bufferMin: '121', workStart: '' }));

    expect(errors.workDays?.message).toBe('Pick at least one working day.');
    expect(errors.bufferMin?.message).toBe('Buffer must be between 0 and 120 minutes.');
    expect(errors.workStart?.message).toBe('Enter a time.');
  });

  it('puts barred-slot errors on the slot row and field they belong to', async () => {
    const backwards = { id: 'b', label: ' ', start: '15:00', end: '14:00', days: ['1'] };
    const errors = await errorsOf(
      form({ barredSlots: [newBarredSlotValues('n', ['1']), backwards] }),
    );

    expect(errors.barredSlots?.[0]).toBeUndefined();
    expect(errors.barredSlots?.[1]?.label?.message).toBe('Label is required.');
    expect(errors.barredSlots?.[1]?.end?.message).toBe('A barred slot must end after it starts.');
  });

  it('starts a new barred slot as a 12:00–13:00 "Lunch" on the given days', () => {
    expect(newBarredSlotValues('n', ['1', '2'])).toEqual({
      id: 'n',
      label: 'Lunch',
      start: '12:00',
      end: '13:00',
      days: ['1', '2'],
    });
    expect(
      toSettings(form({ barredSlots: [newBarredSlotValues('n', ['1'])] })).barredSlots,
    ).toEqual([{ id: 'n', label: 'Lunch', startMin: 720, endMin: 780, days: [1] }]);
  });

  it('keeps DEFAULT_SETTINGS valid through the round trip', async () => {
    expect(await errorsOf(settingsFormValues(DEFAULT_SETTINGS))).toEqual({});
  });
});
