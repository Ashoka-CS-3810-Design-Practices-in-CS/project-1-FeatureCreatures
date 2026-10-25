// Zod schemas shared by the UI forms and the engine — frozen contract (TECH_SPEC §6).
// These are the project's shared validators: the engine re-validates every command with them.

import { z } from 'zod';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  MAX_BARRED_LABEL_LENGTH,
  MAX_BUFFER_MIN,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVENT_MIN,
  MAX_TASK_DURATION_MIN,
  MAX_TITLE_LENGTH,
  MIN_TASK_DURATION_MIN,
  MINUTES_PER_DAY,
} from './constants';
import type { EngineError, FieldIssue } from './errors';
import { err, ok, type Result } from './result';
import type { CalendarEvent, EventInput, ExportFile, Interval, Task } from './types';

// Tags ordering issues so they map to InvalidTime rather than InvalidInput.
const TIME_ISSUE_KIND = 'time';

const minute = z.number().int();
const interval = z.object({ start: minute, end: minute });
const priority = z.enum(['high', 'medium', 'low']);
const category = z.enum(['meeting', 'class', 'appointment', 'assignment', 'personal']);
const weekday = z.literal([0, 1, 2, 3, 4, 5, 6]);
const entityId = z.string().min(1);
const description = z.string().max(MAX_DESCRIPTION_LENGTH);

// PRE:  ctx is the refinement context of the value being checked; path addresses a field of it
// POST: ctx holds one more custom issue at path with message, tagged params.kind = TIME_ISSUE_KIND
function addTimeIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: 'custom', path, message, params: { kind: TIME_ISSUE_KIND } });
}

// PRE:  value has integer start, end and the event's flexible / flexWindow fields
// POST: ctx holds the ER1 issues for value: end ≤ start or length > MAX_EVENT_MIN (time, at end);
//       flexible without flexWindow (shape, at flexWindow); a backwards flexWindow (time, at
//       flexWindow.end) or one shorter than the event (time, at flexWindow)
function refineEventTiming(
  value: Pick<EventInput, 'start' | 'end' | 'flexible' | 'flexWindow'>,
  ctx: z.RefinementCtx,
): void {
  if (value.end <= value.start) {
    addTimeIssue(ctx, ['end'], 'End time must be after the start time.');
  } else if (value.end - value.start > MAX_EVENT_MIN) {
    addTimeIssue(ctx, ['end'], 'Events can be at most 24 hours long.');
  }
  if (value.flexible && value.flexWindow === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['flexWindow'],
      message: 'Flexible events need a flex window.',
    });
  }
  if (value.flexWindow !== null) {
    if (value.flexWindow.end <= value.flexWindow.start) {
      addTimeIssue(ctx, ['flexWindow', 'end'], 'Window end must be after its start.');
    } else if (value.flexWindow.end - value.flexWindow.start < value.end - value.start) {
      addTimeIssue(ctx, ['flexWindow'], 'The flex window must be at least as long as the event.');
    }
  }
}

// PRE:  value.window is an interval of integer minutes
// POST: ctx holds a time issue at window.end iff value.window.end ≤ value.window.start
function refineTaskWindow(value: { window: Interval }, ctx: z.RefinementCtx): void {
  if (value.window.end <= value.window.start) {
    addTimeIssue(ctx, ['window', 'end'], 'Window end must be after its start.');
  }
}

// PRE:  value has the stored task's status and scheduledEventId
// POST: ctx holds a shape issue at scheduledEventId unless
//       (status = 'scheduled') ⟺ (scheduledEventId ≠ null)
function refineScheduledLink(
  value: { status: 'unscheduled' | 'scheduled'; scheduledEventId: string | null },
  ctx: z.RefinementCtx,
): void {
  if ((value.status === 'scheduled') !== (value.scheduledEventId !== null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['scheduledEventId'],
      message: 'A task has an event id exactly when it is scheduled.',
    });
  }
}

// Plain object shapes are kept apart from their refinements because Zod 4 cannot .extend()
// a refined object; the stored schemas extend the shapes and re-apply the same refinements.
const eventInputShape = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(MAX_TITLE_LENGTH),
  description,
  category,
  priority,
  start: minute,
  end: minute,
  flexible: z.boolean(),
  flexWindow: interval.nullable(),
});

const taskInputShape = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(MAX_TITLE_LENGTH),
  description,
  category,
  priority,
  durationMin: z
    .number({ message: 'Duration must be a number.' })
    .int('Duration must be a whole number of minutes.')
    .min(MIN_TASK_DURATION_MIN, 'Duration must be at least 5 minutes.')
    .max(MAX_TASK_DURATION_MIN, 'Duration can be at most 24 hours.'),
  window: interval,
  useWorkingHours: z.boolean(),
});

const entityTimestamps = { createdAt: minute, updatedAt: minute };

export const eventInputSchema = eventInputShape.superRefine(refineEventTiming);

export const taskInputSchema = taskInputShape.superRefine(refineTaskWindow);

export const storedEventSchema = eventInputShape
  .extend({ id: entityId, taskId: entityId.nullable(), ...entityTimestamps })
  .superRefine(refineEventTiming);

export const storedTaskSchema = taskInputShape
  .extend({
    id: entityId,
    status: z.enum(['unscheduled', 'scheduled']),
    scheduledEventId: entityId.nullable(),
    ...entityTimestamps,
  })
  .superRefine(refineTaskWindow)
  .superRefine(refineScheduledLink);

// Start-of-range values stop one minute before midnight; end values may be midnight itself.
const minuteOfDayStart = z
  .number()
  .int()
  .min(0)
  .max(MINUTES_PER_DAY - 1);
const minuteOfDayEnd = z.number().int().min(0).max(MINUTES_PER_DAY);

const barredSlotSchema = z
  .object({
    id: entityId,
    label: z
      .string()
      .trim()
      .min(1, 'Label is required.')
      .max(MAX_BARRED_LABEL_LENGTH, 'Labels can be at most 40 characters.'),
    startMin: minuteOfDayStart,
    endMin: minuteOfDayEnd,
    days: z.array(weekday),
  })
  .superRefine((slot, ctx) => {
    if (slot.endMin <= slot.startMin) {
      addTimeIssue(ctx, ['endMin'], 'A barred slot must end after it starts.');
    }
  });

const bufferMinSchema = z
  .number()
  .int()
  .min(0, 'Buffer must be between 0 and 120 minutes.')
  .max(MAX_BUFFER_MIN, 'Buffer must be between 0 and 120 minutes.');

// The optional per-search override of the settings buffer (findSlots, suggestAlternatives, planReplan).
export const searchOptionsSchema = z.object({ bufferMin: bufferMinSchema.optional() });

export const settingsSchema = z
  .object({
    workDays: z.array(weekday).min(1, 'Pick at least one working day.'),
    workStartMin: minuteOfDayStart,
    workEndMin: minuteOfDayEnd,
    bufferMin: bufferMinSchema,
    barredSlots: z.array(barredSlotSchema),
    defaultCriterion: z.enum(['earliest', 'bestFit', 'priorityAware']),
  })
  .superRefine((settings, ctx) => {
    if (settings.workEndMin <= settings.workStartMin) {
      addTimeIssue(ctx, ['workEndMin'], 'Working hours must end after they start.');
    }
  });

// What engine.init() accepts from Repository.load(); settings are null on first run.
export const storedDataSchema = z.object({
  events: z.array(storedEventSchema),
  tasks: z.array(storedTaskSchema),
  settings: settingsSchema.nullable(),
});

export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  events: z.array(storedEventSchema),
  tasks: z.array(storedTaskSchema),
  settings: settingsSchema,
}); // plus engine-side checks in importData (§7.4.6)

// PRE:  zodError was produced by one of this module's schemas
// POST: returns one FieldIssue per issue of zodError, in order; each path joins its segments
//       with '.' ('' for the root), e.g. 'events.3.end'
export function toFieldIssues(zodError: z.ZodError): FieldIssue[] {
  return zodError.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

// PRE:  issue comes from a ZodError of this module's schemas
// POST: returns true iff issue was added by addTimeIssue
function isTimeIssue(issue: z.core.$ZodIssue): boolean {
  return issue.code === 'custom' && issue.params?.kind === TIME_ISSUE_KIND;
}

// PRE:  schema is one of this module's schemas; input is untrusted (any shape)
// POST: returns ok(parsed value) when input satisfies schema; otherwise err(InvalidTime) when every
//       issue is a time issue, else err(InvalidInput), both carrying toFieldIssues of all issues
export function parseInput<Output>(schema: z.ZodType<Output>, input: unknown): Result<Output> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return ok(parsed.data);
  }
  const issues = toFieldIssues(parsed.error);
  const error: EngineError = parsed.error.issues.every(isTimeIssue)
    ? { code: 'InvalidTime', issues }
    : { code: 'InvalidInput', issues };
  return err(error);
}

// PRE:  records have an id each
// POST: returns one issue at path for every id that already appeared earlier in records
function duplicateIdIssues(records: readonly { id: string }[], path: string): FieldIssue[] {
  const seen = new Set<string>();
  const issues: FieldIssue[] = [];

  // INVARIANT: seen holds the ids of the visited records ∧ issues names every repeat among them
  for (const record of records) {
    if (seen.has(record.id)) {
      issues.push({ path, message: `Duplicate id "${record.id}".` });
    }
    seen.add(record.id);
  }
  // POST: issues names every repeated id

  return issues;
}

// PRE:  events and tasks are shape-valid stored records (storedEventSchema, storedTaskSchema)
// POST: returns the cross-record issues (TECH_SPEC §7.4.6), empty when the data is consistent:
//       duplicate event ids ('events'), duplicate task ids ('tasks'), a scheduled task whose event
//       is missing or does not point back ('tasks.N.scheduledEventId'), and an event whose taskId
//       does not name a task scheduled as that event ('events.N.taskId')
export function linkIssues(events: readonly CalendarEvent[], tasks: readonly Task[]): FieldIssue[] {
  const issues = [...duplicateIdIssues(events, 'events'), ...duplicateIdIssues(tasks, 'tasks')];
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  // INVARIANT: issues names every broken link of the tasks before taskIndex
  for (const [taskIndex, task] of tasks.entries()) {
    const linked =
      task.scheduledEventId === null ? undefined : eventsById.get(task.scheduledEventId);
    if (task.status === 'scheduled' && linked?.taskId !== task.id) {
      issues.push({
        path: `tasks.${taskIndex}.scheduledEventId`,
        message: 'This scheduled task has no event that points back to it.',
      });
    }
  }
  // POST: issues names every task with a broken link

  // INVARIANT: issues names every broken link of the events before eventIndex
  for (const [eventIndex, event] of events.entries()) {
    const owner = event.taskId === null ? undefined : tasksById.get(event.taskId);
    if (event.taskId !== null && owner?.scheduledEventId !== event.id) {
      issues.push({
        path: `events.${eventIndex}.taskId`,
        message: 'This event names a task that is not scheduled as this event.',
      });
    }
  }
  // POST: issues names every event with a broken link

  return issues;
}

// PRE:  json is untrusted text (a file the user picked)
// POST: returns the ExportFile it holds; err InvalidImport with path '' for text that is not JSON,
//       with every schema issue when the shape is wrong, or with the linkIssues otherwise (ER6)
export function parseExportFile(json: string): Result<ExportFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return err({ code: 'InvalidImport', issues: [{ path: '', message: 'Not valid JSON.' }] });
  }
  const parsed = exportFileSchema.safeParse(raw);
  if (!parsed.success) {
    return err({ code: 'InvalidImport', issues: toFieldIssues(parsed.error) });
  }
  const issues = linkIssues(parsed.data.events, parsed.data.tasks);
  return issues.length === 0 ? ok(parsed.data) : err({ code: 'InvalidImport', issues });
}
