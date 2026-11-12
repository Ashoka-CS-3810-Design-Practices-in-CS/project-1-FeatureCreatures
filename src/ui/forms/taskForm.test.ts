import type { ResolverOptions } from 'react-hook-form';
import { iv, task } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { taskFormValues, taskResolver, toTaskInput, type TaskFormValues } from './taskForm';

// PRE:  overrides holds any subset of the form values
// POST: returns a valid 1 h 30 min task form over Mon 09:00 – Fri 18:00, with overrides applied
function form(overrides: Partial<TaskFormValues> = {}): TaskFormValues {
  return {
    name: 'Write report',
    description: '',
    categoryId: 'assignment',
    priority: 'high',
    hours: '1',
    minutes: '30',
    windowStart: '2026-11-02T09:00',
    windowEnd: '2026-11-06T18:00',
    useWorkingHours: true,
    ...overrides,
  };
}

// PRE:  values are form values
// POST: returns taskResolver's error messages, keyed by field
async function errorsOf(values: TaskFormValues) {
  const result = await taskResolver(values, undefined, {} as ResolverOptions<TaskFormValues>);
  return Object.fromEntries(
    Object.entries(result.errors).map(([field, error]) => [field, error?.message]),
  );
}

describe('taskForm', () => {
  it('maps hours + minutes to durationMin, an empty minutes field counting as 0', () => {
    expect(toTaskInput(form())).toMatchObject({
      durationMin: 90,
      window: iv('Mon 09:00', 'Fri 18:00'),
    });
    expect(toTaskInput(form({ hours: '2', minutes: '' })).durationMin).toBe(120);
  });

  it('turns an empty or non-numeric duration into NaN', () => {
    expect(toTaskInput(form({ hours: '' })).durationMin).toBeNaN();
    expect(toTaskInput(form({ minutes: 'abc' })).durationMin).toBeNaN();
    expect(toTaskInput(form({ hours: '1.5' })).durationMin).toBeNaN();
  });

  it('builds defaults for a new task and values for an existing one', () => {
    expect(taskFormValues(undefined, t('Mon 08:20'))).toMatchObject({
      hours: '1',
      minutes: '0',
      windowStart: '2026-11-02T09:00',
      windowEnd: '2026-11-09T09:00',
      useWorkingHours: true,
    });
    expect(taskFormValues(task('T', 135, ['Tue 09:00', 'Wed 12:00']), 0)).toMatchObject({
      name: 'T',
      hours: '2',
      minutes: '15',
      windowStart: '2026-11-03T09:00',
      windowEnd: '2026-11-04T12:00',
    });
  });

  it('accepts a valid form', async () => {
    expect(await taskResolver(form(), undefined, {} as ResolverOptions<TaskFormValues>)).toEqual({
      values: form(),
      errors: {},
    });
  });

  it('shows the duration problems under hours (T31)', async () => {
    expect(await errorsOf(form({ hours: '', minutes: '' }))).toEqual({
      hours: 'Duration must be a number.',
    });
    expect(await errorsOf(form({ hours: '0', minutes: '0' }))).toEqual({
      hours: 'Duration must be at least 5 minutes.',
    });
    expect(await errorsOf(form({ hours: '25', minutes: '0' }))).toEqual({
      hours: 'Duration can be at most 24 hours.',
    });
  });

  it('maps window and name problems to their fields', async () => {
    expect(await errorsOf(form({ windowEnd: '2026-11-02T09:00' }))).toEqual({
      windowEnd: 'Window end must be after its start.',
    });
    expect(await errorsOf(form({ name: '  ' }))).toEqual({ name: 'Name is required.' });
    expect(await errorsOf(form({ windowStart: '' }))).toMatchObject({
      windowStart: 'Enter a date and time.',
    });
  });
});
