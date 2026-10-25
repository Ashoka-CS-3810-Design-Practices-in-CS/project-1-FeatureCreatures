import type { ResolverOptions } from 'react-hook-form';
import { flexEv, iv, settings } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import {
  defaultFlexWindow,
  eventFormValues,
  eventResolver,
  flexibleByDefault,
  fromDateTimeLocal,
  toDateTimeLocal,
  toEventInput,
  type EventFormValues,
} from './eventForm';

// PRE:  overrides holds any subset of the form values
// POST: returns a valid fixed meeting form for Mon 10:00–11:00, with overrides applied
function form(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: 'Standup',
    description: '',
    category: 'meeting',
    priority: 'medium',
    start: '2026-11-02T10:00',
    end: '2026-11-02T11:00',
    flexible: false,
    flexStart: '2026-11-02T09:00',
    flexEnd: '2026-11-02T18:00',
    ...overrides,
  };
}

// PRE:  values are form values
// POST: returns eventResolver's errors for them, keyed by field
async function errorsOf(values: EventFormValues) {
  const result = await eventResolver(values, undefined, {} as ResolverOptions<EventFormValues>);
  return Object.fromEntries(
    Object.entries(result.errors).map(([field, error]) => [field, error?.message]),
  );
}

describe('eventForm', () => {
  it('converts datetime-local strings both ways, with NaN for an empty value', () => {
    expect(toDateTimeLocal(t('Mon 09:05'))).toBe('2026-11-02T09:05');
    expect(fromDateTimeLocal('2026-11-02T09:05')).toBe(t('Mon 09:05'));
    expect(fromDateTimeLocal('')).toBeNaN();
  });

  it('makes assignments and personal events flexible by default, the rest fixed', () => {
    expect(flexibleByDefault('class')).toBe(false);
    expect(flexibleByDefault('meeting')).toBe(false);
    expect(flexibleByDefault('appointment')).toBe(false);
    expect(flexibleByDefault('assignment')).toBe(true);
    expect(flexibleByDefault('personal')).toBe(true);
  });

  it('defaults the flex window to the local working day of the start', () => {
    expect(defaultFlexWindow(t('Tue 15:00'), settings())).toEqual(iv('Tue 09:00', 'Tue 18:00'));
  });

  it('builds form values from create defaults and from an existing event', () => {
    expect(
      eventFormValues({ ...iv('Mon 10:00', 'Mon 11:00'), category: 'assignment' }, settings()),
    ).toEqual(form({ title: '', category: 'assignment', flexible: true }));
    const existing = flexEv('E', 'Wed 14:00', 'Wed 15:00', ['Wed 12:00', 'Wed 17:00']);
    expect(eventFormValues(existing, settings())).toMatchObject({
      title: 'E',
      flexible: true,
      flexStart: '2026-11-04T12:00',
      flexEnd: '2026-11-04T17:00',
    });
  });

  it('toEventInput builds the flex window only when flexible is on', () => {
    expect(toEventInput(form())).toMatchObject({
      ...iv('Mon 10:00', 'Mon 11:00'),
      flexWindow: null,
    });
    expect(toEventInput(form({ flexible: true })).flexWindow).toEqual(iv('Mon 09:00', 'Mon 18:00'));
  });

  it('accepts a valid form', async () => {
    const result = await eventResolver(form(), undefined, {} as ResolverOptions<EventFormValues>);

    expect(result).toEqual({ values: form(), errors: {} });
  });

  it('maps schema issues to form fields (T5)', async () => {
    expect(await errorsOf(form({ end: '2026-11-02T09:00' }))).toEqual({
      end: 'End time must be after the start time.',
    });
    expect(await errorsOf(form({ title: '   ' }))).toEqual({ title: 'Title is required.' });
    expect(
      await errorsOf(
        form({ flexible: true, flexStart: '2026-11-02T10:00', flexEnd: '2026-11-02T10:30' }),
      ),
    ).toEqual({ flexEnd: 'The flex window must be at least as long as the event.' });
    expect(await errorsOf(form({ flexible: true, flexEnd: '2026-11-02T08:00' }))).toEqual({
      flexEnd: 'Window end must be after its start.',
    });
  });

  it('asks for a date when a date field is empty', async () => {
    expect(await errorsOf(form({ start: '' }))).toMatchObject({ start: 'Enter a date and time.' });
    expect(await errorsOf(form({ flexible: true, flexStart: '' }))).toMatchObject({
      flexStart: 'Enter a date and time.',
    });
  });
});
