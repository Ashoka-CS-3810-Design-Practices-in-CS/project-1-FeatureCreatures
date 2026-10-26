import {
  DEFAULT_SETTINGS,
  MAX_DESCRIPTION_LENGTH,
  MAX_SUPPORTED_MINUTE,
  MIN_SUPPORTED_MINUTE,
} from './constants';
import type { EngineError } from './errors';
import type { Result } from './result';
import {
  eventInputSchema,
  exportFileSchema,
  parseInput,
  searchOptionsSchema,
  settingsSchema,
  storedDataSchema,
  storedEventSchema,
  storedTaskSchema,
  taskInputSchema,
} from './schemas';
import type { BarredSlot, CalendarEvent, EventInput, Settings, Task, TaskInput } from './types';

// The typed `Result<EventInput>`-style assignments below double as compile-time checks that each
// schema produces exactly its frozen TECH_SPEC §5 type.

const MS_PER_MINUTE = 60_000;
const HOUR = 60;
const MON_MIDNIGHT = Date.UTC(2026, 10, 2) / MS_PER_MINUTE; // Mon 2 Nov 2026 00:00 UTC

// PRE:  hour is a number of hours (may exceed 24)
// POST: returns the Minute that is hour hours after MON_MIDNIGHT
function at(hour: number): number {
  return MON_MIDNIGHT + hour * HOUR;
}

const validEvent: EventInput = {
  title: 'Lecture',
  description: '',
  category: 'class',
  priority: 'high',
  start: at(10),
  end: at(11),
  flexible: false,
  flexWindow: null,
};

const validTask: TaskInput = {
  name: 'Write report',
  description: '',
  category: 'assignment',
  priority: 'high',
  durationMin: 90,
  window: { start: at(9), end: at(18) },
  useWorkingHours: true,
};

// PRE:  result is a failed Result
// POST: returns its error; fails the test if result succeeded
function errorOf<T>(result: Result<T>): EngineError {
  if (result.ok) {
    throw new Error('expected a failed Result');
  }
  return result.error;
}

describe('eventInputSchema (T5, schema level)', () => {
  it('accepts a valid fixed event', () => {
    const parsed: Result<EventInput> = parseInput(eventInputSchema, validEvent);

    expect(parsed).toEqual({ ok: true, value: validEvent });
  });

  // AUDIT A02: integer minutes beyond JavaScript's Date range used to pass and then crash rendering.
  it('rejects minutes outside the supported dates as InvalidTime at that field', () => {
    const beyond = {
      ...validEvent,
      start: MAX_SUPPORTED_MINUTE + 1,
      end: MAX_SUPPORTED_MINUTE + 61,
    };
    const unsafe = {
      ...validEvent,
      start: Number.MAX_SAFE_INTEGER - 60,
      end: Number.MAX_SAFE_INTEGER,
    };
    const message = 'Dates must be between the years 1970 and 9999.';

    expect(errorOf(parseInput(eventInputSchema, beyond))).toEqual({
      code: 'InvalidTime',
      issues: [
        { path: 'start', message },
        { path: 'end', message },
      ],
    });
    expect(errorOf(parseInput(eventInputSchema, unsafe)).code).toBe('InvalidTime');
    const beforeFirst = {
      ...validEvent,
      start: MIN_SUPPORTED_MINUTE - 1,
      end: MIN_SUPPORTED_MINUTE,
    };
    expect(errorOf(parseInput(eventInputSchema, beforeFirst))).toEqual({
      code: 'InvalidTime',
      issues: [{ path: 'start', message }],
    });
  });

  it('limits the description to 1000 characters with a readable message (AUDIT A09)', () => {
    const atLimit = { ...validEvent, description: 'x'.repeat(MAX_DESCRIPTION_LENGTH) };
    const overLimit = { ...validEvent, description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) };

    expect(parseInput(eventInputSchema, atLimit).ok).toBe(true);
    expect(errorOf(parseInput(eventInputSchema, overLimit))).toEqual({
      code: 'InvalidInput',
      issues: [{ path: 'description', message: 'Description can be at most 1000 characters.' }],
    });
  });

  it('accepts the first and last supported minutes', () => {
    const first = { ...validEvent, start: MIN_SUPPORTED_MINUTE, end: MIN_SUPPORTED_MINUTE + HOUR };
    const last = { ...validEvent, start: MAX_SUPPORTED_MINUTE - HOUR, end: MAX_SUPPORTED_MINUTE };

    expect(parseInput(eventInputSchema, first).ok).toBe(true);
    expect(parseInput(eventInputSchema, last).ok).toBe(true);
  });

  it('(a) end before start is InvalidTime at end', () => {
    const error = errorOf(parseInput(eventInputSchema, { ...validEvent, end: at(9) }));

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [{ path: 'end', message: 'End time must be after the start time.' }],
    });
  });

  it('(b) zero-length event is InvalidTime at end', () => {
    const error = errorOf(parseInput(eventInputSchema, { ...validEvent, end: at(10) }));

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [{ path: 'end', message: 'End time must be after the start time.' }],
    });
  });

  it('(c) a 25 h event is InvalidTime at end', () => {
    const error = errorOf(parseInput(eventInputSchema, { ...validEvent, end: at(10 + 25) }));

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [{ path: 'end', message: 'Events can be at most 24 hours long.' }],
    });
  });

  it('accepts an event of exactly 24 h', () => {
    expect(parseInput(eventInputSchema, { ...validEvent, end: at(10 + 24) }).ok).toBe(true);
  });

  it('(d) a blank title is InvalidInput at title', () => {
    const error = errorOf(parseInput(eventInputSchema, { ...validEvent, title: '   ' }));

    expect(error).toEqual({
      code: 'InvalidInput',
      issues: [{ path: 'title', message: 'Title is required.' }],
    });
  });

  it('trims the title', () => {
    const parsed = parseInput(eventInputSchema, { ...validEvent, title: '  Gym  ' });

    expect(parsed.ok && parsed.value.title).toBe('Gym');
  });

  it('(e) flexible without a flex window is InvalidInput at flexWindow', () => {
    const error = errorOf(parseInput(eventInputSchema, { ...validEvent, flexible: true }));

    expect(error).toEqual({
      code: 'InvalidInput',
      issues: [{ path: 'flexWindow', message: 'Flexible events need a flex window.' }],
    });
  });

  it('(f) a flex window shorter than the event is InvalidTime at flexWindow', () => {
    const shortWindow = { start: at(9), end: at(9) + 30 };
    const error = errorOf(
      parseInput(eventInputSchema, { ...validEvent, flexible: true, flexWindow: shortWindow }),
    );

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [
        { path: 'flexWindow', message: 'The flex window must be at least as long as the event.' },
      ],
    });
  });

  it('a flex window ending before it starts is InvalidTime at flexWindow.end', () => {
    const backwardsWindow = { start: at(12), end: at(9) };
    const error = errorOf(
      parseInput(eventInputSchema, { ...validEvent, flexible: true, flexWindow: backwardsWindow }),
    );

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [{ path: 'flexWindow.end', message: 'Window end must be after its start.' }],
    });
  });

  it('accepts a flex window that does not contain the event (PROJECT_SCHEMA §3.2)', () => {
    const laterWindow = { start: at(14), end: at(18) };

    expect(
      parseInput(eventInputSchema, { ...validEvent, flexible: true, flexWindow: laterWindow }).ok,
    ).toBe(true);
  });

  it('a non-integer minute is InvalidInput', () => {
    expect(errorOf(parseInput(eventInputSchema, { ...validEvent, start: 1.5 })).code).toBe(
      'InvalidInput',
    );
  });

  it('a mix of shape and time issues is InvalidInput', () => {
    const error = errorOf(
      parseInput(eventInputSchema, { ...validEvent, title: '', flexible: true, end: at(9) }),
    );

    expect(error.code).toBe('InvalidInput');
  });
});

describe('taskInputSchema (T31, schema level)', () => {
  it('accepts a valid task', () => {
    const parsed: Result<TaskInput> = parseInput(taskInputSchema, validTask);

    expect(parsed).toEqual({ ok: true, value: validTask });
  });

  it.each([
    [0, 'Duration must be at least 5 minutes.'],
    [-5, 'Duration must be at least 5 minutes.'],
    [Number.NaN, 'Duration must be a number.'],
    [1441, 'Duration can be at most 24 hours.'],
    [2.5, 'Duration must be a whole number of minutes.'],
  ])('duration %s is InvalidInput at durationMin', (durationMin, message) => {
    const error = errorOf(parseInput(taskInputSchema, { ...validTask, durationMin }));

    expect(error).toEqual({ code: 'InvalidInput', issues: [{ path: 'durationMin', message }] });
  });

  it.each([
    ['ends before it starts', at(8)],
    ['has zero length', at(9)],
  ])('a window that %s is InvalidTime at window.end', (_label, windowEnd) => {
    const error = errorOf(
      parseInput(taskInputSchema, { ...validTask, window: { start: at(9), end: windowEnd } }),
    );

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [{ path: 'window.end', message: 'Window end must be after its start.' }],
    });
  });

  it('a blank name is InvalidInput at name', () => {
    const error = errorOf(parseInput(taskInputSchema, { ...validTask, name: '  ' }));

    expect(error).toEqual({
      code: 'InvalidInput',
      issues: [{ path: 'name', message: 'Name is required.' }],
    });
  });

  it('a missing field is InvalidInput at that field', () => {
    const withoutFlag: Record<string, unknown> = { ...validTask };
    delete withoutFlag['useWorkingHours'];
    const error = errorOf(parseInput(taskInputSchema, withoutFlag));

    expect(error.code).toBe('InvalidInput');
    expect(error.code === 'InvalidInput' && error.issues.map((issue) => issue.path)).toEqual([
      'useWorkingHours',
    ]);
  });
});

describe('settingsSchema', () => {
  const lunch: BarredSlot = {
    id: 'lunch',
    label: 'Lunch',
    startMin: 13 * HOUR,
    endMin: 14 * HOUR,
    days: [1],
  };

  it('accepts the default settings and a barred slot', () => {
    const withLunch: Settings = { ...DEFAULT_SETTINGS, barredSlots: [lunch] };
    const parsed: Result<Settings> = parseInput(settingsSchema, DEFAULT_SETTINGS);

    expect(parsed).toEqual({ ok: true, value: DEFAULT_SETTINGS });
    expect(parseInput(settingsSchema, withLunch).ok).toBe(true);
  });

  it('working hours that end before they start are InvalidTime at workEndMin', () => {
    const error = errorOf(
      parseInput(settingsSchema, {
        ...DEFAULT_SETTINGS,
        workEndMin: DEFAULT_SETTINGS.workStartMin,
      }),
    );

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [{ path: 'workEndMin', message: 'Working hours must end after they start.' }],
    });
  });

  it('a barred slot that ends before it starts is InvalidTime at its endMin', () => {
    const backwardsLunch = { ...lunch, endMin: lunch.startMin };
    const error = errorOf(
      parseInput(settingsSchema, { ...DEFAULT_SETTINGS, barredSlots: [backwardsLunch] }),
    );

    expect(error).toEqual({
      code: 'InvalidTime',
      issues: [
        { path: 'barredSlots.0.endMin', message: 'A barred slot must end after it starts.' },
      ],
    });
  });

  it.each([
    ['no working days', { workDays: [] }, 'workDays'],
    ['weekday 7', { workDays: [1, 7] }, 'workDays.1'],
    ['work start at 24:00', { workStartMin: 1440, workEndMin: 1440 }, 'workStartMin'],
    ['work end after 24:00', { workEndMin: 1441 }, 'workEndMin'],
    ['buffer 121', { bufferMin: 121 }, 'bufferMin'],
    ['negative buffer', { bufferMin: -1 }, 'bufferMin'],
    ['criterion nearest', { defaultCriterion: 'nearest' }, 'defaultCriterion'],
    ['blank barred label', { barredSlots: [{ ...lunch, label: ' ' }] }, 'barredSlots.0.label'],
    [
      '41-char barred label',
      { barredSlots: [{ ...lunch, label: 'x'.repeat(41) }] },
      'barredSlots.0.label',
    ],
  ])('%s is InvalidInput', (_label, override, path) => {
    const error = errorOf(parseInput(settingsSchema, { ...DEFAULT_SETTINGS, ...override }));

    expect(error.code).toBe('InvalidInput');
    expect(error.code === 'InvalidInput' && error.issues[0]?.path).toBe(path);
  });
});

describe('stored schemas', () => {
  const storedEvent: CalendarEvent = {
    ...validEvent,
    id: 'e1',
    taskId: null,
    createdAt: MON_MIDNIGHT,
    updatedAt: MON_MIDNIGHT,
  };
  const scheduledTask: Task = {
    ...validTask,
    id: 't1',
    status: 'scheduled',
    scheduledEventId: 'e1',
    createdAt: MON_MIDNIGHT,
    updatedAt: MON_MIDNIGHT,
  };

  it('accept valid stored records', () => {
    const parsedEvent: Result<CalendarEvent> = parseInput(storedEventSchema, storedEvent);
    const parsedTask: Result<Task> = parseInput(storedTaskSchema, scheduledTask);

    expect(parsedEvent).toEqual({ ok: true, value: storedEvent });
    expect(parsedTask).toEqual({ ok: true, value: scheduledTask });
  });

  it('keep the input time rules', () => {
    const error = errorOf(parseInput(storedEventSchema, { ...storedEvent, end: at(9) }));

    expect(error.code).toBe('InvalidTime');
  });

  it.each([
    ['scheduled without an event id', { status: 'scheduled', scheduledEventId: null }],
    ['unscheduled with an event id', { status: 'unscheduled', scheduledEventId: 'e1' }],
  ])('reject a task %s at scheduledEventId', (_label, override) => {
    const error = errorOf(parseInput(storedTaskSchema, { ...scheduledTask, ...override }));

    expect(error).toEqual({
      code: 'InvalidInput',
      issues: [
        {
          path: 'scheduledEventId',
          message: 'A task has an event id exactly when it is scheduled.',
        },
      ],
    });
  });

  it('exportFileSchema prefixes nested issue paths with the array index (T25 path format)', () => {
    const file = {
      format: 'feature-creatures-calendar',
      version: 1,
      exportedAt: '2026-11-02T00:00:00.000Z',
      events: [storedEvent, { ...storedEvent, id: 'e2', end: at(9) }],
      tasks: [],
      settings: DEFAULT_SETTINGS,
    };
    const result = exportFileSchema.safeParse(file);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['events.1.end']);
  });

  it('exportFileSchema rejects another format', () => {
    const result = exportFileSchema.safeParse({ format: 'other' });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('format');
  });
});

describe('searchOptionsSchema', () => {
  it.each([[{}], [{ bufferMin: 0 }], [{ bufferMin: 120 }]])('accepts %j', (options) => {
    expect(parseInput(searchOptionsSchema, options).ok).toBe(true);
  });

  it.each([[-1], [121], [7.5], ['15']])(
    'rejects bufferMin %j as InvalidInput at bufferMin',
    (bufferMin) => {
      const result = parseInput(searchOptionsSchema, { bufferMin });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ code: 'InvalidInput', issues: [{ path: 'bufferMin' }] });
    },
  );

  it.each([[Number.NaN], ['15'], [-1], [121]])(
    'gives bufferMin %s the range message (a blank form field becomes NaN)',
    (bufferMin) => {
      const result = parseInput(searchOptionsSchema, { bufferMin });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({
        issues: [{ path: 'bufferMin', message: 'Buffer must be between 0 and 120 minutes.' }],
      });
    },
  );
});

describe('storedDataSchema', () => {
  it('accepts empty first-run data with null settings', () => {
    expect(parseInput(storedDataSchema, { events: [], tasks: [], settings: null }).ok).toBe(true);
  });

  it('rejects a damaged event row with its path', () => {
    const result = storedDataSchema.safeParse({ events: [{ id: 'x' }], tasks: [], settings: null });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('events.0.title');
  });
});
