// Zod schemas shared by the UI forms and the engine — frozen contract (TECH_SPEC §6).
// These are the project's shared validators: the engine re-validates every command with them.

import { z } from 'zod';
import { colourDistance, contrastRatio } from './colours';
import {
  CATEGORY_TAG_BACKGROUNDS,
  MIN_CATEGORY_COLOUR_DISTANCE,
  MIN_NON_TEXT_CONTRAST,
  RESERVED_COLOURS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  LEGACY_EXPORT_VERSION,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_BARRED_LABEL_LENGTH,
  MAX_BUFFER_MIN,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVENT_MIN,
  MAX_TASK_DURATION_MIN,
  MAX_SUPPORTED_MINUTE,
  MAX_TITLE_LENGTH,
  MIN_SUPPORTED_MINUTE,
  MIN_TASK_DURATION_MIN,
  MINUTES_PER_DAY,
} from './constants';
import type { EngineError, FieldIssue } from './errors';
import { err, ok, type Result } from './result';
import { migrateLegacyData } from './legacy';
import { barredSlotClashes, barredDaysText, sameBarredSlots } from './barredSlots';
import type {
  BarredSlot,
  CalendarEvent,
  Category,
  CategoryInput,
  EventInput,
  ExportFile,
  Interval,
  Settings,
  Task,
} from './types';

// Tags ordering issues so they map to InvalidTime rather than InvalidInput.
const TIME_ISSUE_KIND = 'time';

const DATE_RANGE_MESSAGE = 'Dates must be between the years 1970 and 9999.';

// Every stored, imported or commanded Minute passes here, so no unrepresentable date reaches the
// state, the repository or the UI's date formatting (AUDIT A02).
const minute = z
  .number()
  .int()
  .superRefine((value, ctx) => {
    if (value < MIN_SUPPORTED_MINUTE || value > MAX_SUPPORTED_MINUTE) {
      addTimeIssue(ctx, [], DATE_RANGE_MESSAGE);
    }
  });
const interval = z.object({ start: minute, end: minute });
const priority = z.enum(['high', 'medium', 'low']);
const legacyCategory = z.enum(['meeting', 'class', 'appointment', 'assignment', 'personal']);
const weekday = z.literal([0, 1, 2, 3, 4, 5, 6]);
const entityId = z.string().min(1);
export const doneBeforeSchema = z.object({ before: minute });
export const doneBeforeApplySchema = doneBeforeSchema.extend({
  baseVersion: z.number().int().min(0),
});
const description = z
  .string()
  .max(MAX_DESCRIPTION_LENGTH, `Description can be at most ${MAX_DESCRIPTION_LENGTH} characters.`);

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
  value: { status: Task['status']; scheduledEventId: string | null },
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
  categoryId: entityId,
  priority,
  start: minute,
  end: minute,
  flexible: z.boolean(),
  flexWindow: interval.nullable(),
});

const taskInputShape = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(MAX_TITLE_LENGTH),
  description,
  categoryId: entityId,
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
  .extend({
    id: entityId,
    taskId: entityId.nullable(),
    keptInBarred: z.array(entityId),
    ...entityTimestamps,
  })
  .superRefine(refineEventTiming);

export const storedTaskSchema = taskInputShape
  .extend({
    id: entityId,
    status: z.enum(['unscheduled', 'scheduled', 'done']),
    doneAt: minute.nullable(),
    scheduledEventId: entityId.nullable(),
    ...entityTimestamps,
  })
  .superRefine(refineTaskWindow)
  .superRefine(refineScheduledLink)
  .superRefine((task, ctx) => {
    if ((task.status === 'done') !== (task.doneAt !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['doneAt'],
        message: 'A task has a completion time exactly when it is done.',
      });
    }
  });

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

const BUFFER_RANGE_MESSAGE = 'Buffer must be between 0 and 120 minutes.';

// A blank or non-numeric buffer field arrives as NaN, which gets the same range message.
const bufferMinSchema = z
  .number({ message: BUFFER_RANGE_MESSAGE })
  .int()
  .min(0, BUFFER_RANGE_MESSAGE)
  .max(MAX_BUFFER_MIN, BUFFER_RANGE_MESSAGE);

// The slot of scheduleTask / applyAlternative, nested so issue paths read 'slot.start' (AUDIT A06).
export const slotSchema = z.object({ slot: interval });

// The optional per-search override of the settings buffer (findSlots, suggestAlternatives, planReplan).
export const searchOptionsSchema = z.object({ bufferMin: bufferMinSchema.optional() });
export const alternativesOptionsSchema = searchOptionsSchema.extend({
  allowMoving: z.boolean().optional(),
  useWorkingHours: z.boolean().optional(),
});
const alternativeRangeSchema = z.object({ range: interval }).superRefine((value, ctx) => {
  if (value.range.end <= value.range.start)
    addTimeIssue(ctx, ['range', 'end'], 'Range end must be after its start.');
});

// PRE:  input is an untrusted temporary range for an opted-in fixed event
// POST: returns its valid interval, otherwise InvalidTime with range-prefixed field issues (D-02)
export function parseAlternativeRange(input: unknown): Result<Interval> {
  const parsed = alternativeRangeSchema.safeParse({ range: input });
  return parsed.success
    ? ok(parsed.data.range)
    : err({ code: 'InvalidTime', issues: toFieldIssues(parsed.error) });
}

// PRE:  slots each passed barredSlotSchema
// POST: adds the first earlier overlap's D-09 issue under every offending later slot's days
function refineDistinctBarredSlots(slots: readonly BarredSlot[], ctx: z.RefinementCtx): void {
  const reported = new Set<number>();
  // INVARIANT: reported contains each later slot already given its first earlier overlap issue
  for (const clash of barredSlotClashes(slots)) {
    if (!reported.has(clash.secondIndex)) {
      const first = slots[clash.firstIndex] as BarredSlot;
      ctx.addIssue({
        code: 'custom',
        path: ['barredSlots', clash.secondIndex, 'days'],
        message: `Overlaps barred slot ${clash.firstIndex + 1} (${first.label}) on ${barredDaysText(clash.days)}.`,
      });
      reported.add(clash.secondIndex);
    }
  }
  // POST: each overlapping later slot has one issue naming its first earlier overlap
}

const settingsShape = z.object({
  useWorkingHours: z.boolean(),
  workDays: z.array(weekday).min(1, 'Pick at least one working day.'),
  workStartMin: minuteOfDayStart,
  workEndMin: minuteOfDayEnd,
  bufferMin: bufferMinSchema,
  barredSlots: z.array(barredSlotSchema),
  defaultCriterion: z.enum(['earliest', 'bestFit', 'priorityAware']),
});

// PRE:  settings has integer working-time boundaries; ctx belongs to its enclosing schema
// POST: adds a time issue iff working hours end no later than they start
function refineWorkingTime(
  settings: Pick<Settings, 'workStartMin' | 'workEndMin'>,
  ctx: z.RefinementCtx,
): void {
  if (settings.workEndMin <= settings.workStartMin) {
    addTimeIssue(ctx, ['workEndMin'], 'Working hours must end after they start.');
  }
}

// Legacy overlaps remain readable; new settings edits still enforce the current slot rules.
export const storedSettingsSchema = settingsShape.superRefine(refineWorkingTime);
export const settingsSchema = storedSettingsSchema.superRefine((settings, ctx) => {
  refineDistinctBarredSlots(settings.barredSlots, ctx);
});

export const barredKeepSchema = z.object({
  eventId: entityId,
  slotId: entityId,
  kept: z.boolean(),
});

// PRE:  input is untrusted; previous is the current structurally valid settings
// POST: validates shape/time always, and rejects overlapping slots when their content was edited;
//       unrelated changes preserve readable legacy overlaps
export function parseSettingsChange(input: unknown, previous: Settings): Result<Settings> {
  const parsed = parseInput(storedSettingsSchema, input);
  if (!parsed.ok) return parsed;
  return sameBarredSlots(parsed.value.barredSlots, previous.barredSlots)
    ? parsed
    : parseInput(settingsSchema, parsed.value);
}

export const categorySchema = z.object({
  id: entityId,
  name: z.string().trim().min(1, 'Category name is required.').max(MAX_CATEGORY_NAME_LENGTH),
  colour: z
    .string()
    .regex(/^#[\da-f]{6}$/i, 'Choose a hex colour.')
    .transform((colour) => colour.toLowerCase()),
  createdAt: minute,
});

export const categoryInputSchema = categorySchema.pick({ name: true, colour: true });

// PRE:  colour is a normalised six-digit hex colour; categories excludes the category being edited
// POST: returns the colour's D-11 validation message, or null if it is available and readable
export function categoryColourIssue(
  colour: string,
  categories: readonly Category[],
): string | null {
  if (
    RESERVED_COLOURS.some(
      (reserved) => colourDistance(colour, reserved) < MIN_CATEGORY_COLOUR_DISTANCE,
    )
  ) {
    return 'Choose a colour further from the reserved event, conflict and priority colours.';
  }
  if (
    categories.some(
      (category) => colourDistance(colour, category.colour) < MIN_CATEGORY_COLOUR_DISTANCE,
    )
  ) {
    return 'Choose a colour further from the colours already in use.';
  }
  return CATEGORY_TAG_BACKGROUNDS.every(
    (background) => contrastRatio(colour, background) >= MIN_NON_TEXT_CONTRAST,
  )
    ? null
    : 'Choose a colour with at least 3:1 contrast in both themes.';
}

// PRE:  input is untrusted; categories are current categories; editingId is absent for creation
// POST: returns a trimmed, normalised unique category input, or InvalidInput with field issues
export function parseCategoryInput(
  input: unknown,
  categories: readonly Category[],
  editingId?: string,
): Result<CategoryInput> {
  const parsed = parseInput(categoryInputSchema, input);
  if (!parsed.ok) return parsed;
  const others = categories.filter((category) => category.id !== editingId);
  const issues: FieldIssue[] = [];
  if (others.some((category) => category.name.toLowerCase() === parsed.value.name.toLowerCase())) {
    issues.push({ path: 'name', message: 'A category with this name already exists.' });
  }
  const colourIssue = categoryColourIssue(parsed.value.colour, others);
  if (colourIssue !== null) issues.push({ path: 'colour', message: colourIssue });
  return issues.length === 0 ? parsed : err({ code: 'InvalidInput', issues });
}

const legacyEventSchema = eventInputShape
  .omit({ categoryId: true })
  .extend({
    category: legacyCategory,
    id: entityId,
    taskId: entityId.nullable(),
    ...entityTimestamps,
  })
  .superRefine(refineEventTiming);
const legacyTaskSchema = taskInputShape
  .omit({ categoryId: true })
  .extend({
    category: legacyCategory,
    id: entityId,
    status: z.enum(['unscheduled', 'scheduled']),
    scheduledEventId: entityId.nullable(),
    ...entityTimestamps,
  })
  .superRefine(refineTaskWindow)
  .superRefine(refineScheduledLink);
const legacySettingsSchema = settingsShape
  .omit({ useWorkingHours: true })
  .superRefine(refineWorkingTime);
export const legacyStoredDataSchema = z.object({
  events: z.array(legacyEventSchema),
  tasks: z.array(legacyTaskSchema),
  settings: legacySettingsSchema.nullable(),
});

// What engine.init() accepts from Repository.load(); settings are null on first run.
export const storedDataSchema = z.object({
  categories: z.array(categorySchema),
  events: z.array(storedEventSchema),
  tasks: z.array(storedTaskSchema),
  settings: storedSettingsSchema.nullable(),
});

// The revision that comes with Repository.load() (WI-40); other keys are checked above.
export const storedRevisionSchema = z.object({ revision: z.number().int().min(0) });

export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  categories: z.array(categorySchema),
  events: z.array(storedEventSchema),
  tasks: z.array(storedTaskSchema),
  settings: settingsSchema,
}); // plus engine-side checks in importData (§7.4.6)

const legacyExportSchema = legacyStoredDataSchema
  .extend({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(LEGACY_EXPORT_VERSION),
    exportedAt: z.string(),
    settings: legacySettingsSchema,
  })
  .transform((file): ExportFile => ({
    ...file,
    ...migrateLegacyData(file),
    version: EXPORT_VERSION,
    settings: { ...file.settings, useWorkingHours: true },
  }));

const importFileSchema = z.discriminatedUnion('version', [exportFileSchema, legacyExportSchema]);

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

// PRE:  task is scheduled as event, which points back to it
// POST: returns true iff event mirrors task as BR-9 requires: flexible, title = name, the same
//       priority, end − start = durationMin and flexWindow = window (description and categoryId are
//       only copied when scheduling, so they may differ)
function mirrorsTask(event: CalendarEvent, task: Task): boolean {
  return (
    event.flexible &&
    event.title === task.name &&
    event.priority === task.priority &&
    event.end - event.start === task.durationMin &&
    event.flexWindow !== null &&
    event.flexWindow.start === task.window.start &&
    event.flexWindow.end === task.window.end
  );
}

// PRE:  events, tasks and categories passed their stored schemas; hex colours are normalised
// POST: returns the cross-record issues (TECH_SPEC §7.4.6), empty when the data is consistent:
//       duplicate event ids ('events'), duplicate task ids ('tasks'), a scheduled task whose event
//       is missing, does not point back or does not mirror it (BR-9, AUDIT A04)
//       ('tasks.N.scheduledEventId'), and an event whose taskId does not name a task scheduled as
//       that event ('events.N.taskId'); duplicate categories/names/colours and absent category ids
export function linkIssues(
  events: readonly CalendarEvent[],
  tasks: readonly Task[],
  categories: readonly Category[],
): FieldIssue[] {
  const issues = [
    ...duplicateIdIssues(events, 'events'),
    ...duplicateIdIssues(tasks, 'tasks'),
    ...duplicateIdIssues(categories, 'categories'),
  ];
  const categoryIds = new Set(categories.map((category) => category.id));
  const categoryNames = new Set<string>();
  const categoryColours = new Set<string>();
  // INVARIANT: index ranges over categories; sets hold each earlier name/colour and issues names every earlier repeat.
  for (const [index, category] of categories.entries()) {
    const name = category.name.toLowerCase();
    if (categoryNames.has(name)) {
      issues.push({
        path: `categories.${index}.name`,
        message: 'Category names must be unique ignoring case.',
      });
    }
    if (categoryColours.has(category.colour)) {
      issues.push({
        path: `categories.${index}.colour`,
        message: 'Category colours must be unique.',
      });
    } else {
      const colourIssue = categoryColourIssue(category.colour, categories.slice(0, index));
      if (colourIssue !== null)
        issues.push({ path: `categories.${index}.colour`, message: colourIssue });
    }
    categoryNames.add(name);
    categoryColours.add(category.colour);
  }
  // POST: duplicate category names and colours have issues.
  issues.push(
    ...categoryReferenceIssues(events, categoryIds, 'events'),
    ...categoryReferenceIssues(tasks, categoryIds, 'tasks'),
  );
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  // INVARIANT: issues names every broken link or mirror of the tasks before taskIndex
  for (const [taskIndex, task] of tasks.entries()) {
    const linked =
      task.scheduledEventId === null ? undefined : eventsById.get(task.scheduledEventId);
    if (task.status === 'scheduled' && linked?.taskId !== task.id) {
      issues.push({
        path: `tasks.${taskIndex}.scheduledEventId`,
        message: 'This scheduled task has no event that points back to it.',
      });
    } else if (linked !== undefined && !mirrorsTask(linked, task)) {
      issues.push({
        path: `tasks.${taskIndex}.scheduledEventId`,
        message:
          "This scheduled task's event does not match its name, priority, duration or window, or is not flexible.",
      });
    }
  }
  // POST: issues names every task with a broken link or mirror

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

// PRE:  records are shape-valid entities and categoryIds contains the available category ids
// POST: returns a categoryId issue for every entity whose category is absent
function categoryReferenceIssues(
  records: readonly { categoryId: string }[],
  categoryIds: ReadonlySet<string>,
  path: string,
): FieldIssue[] {
  return records.flatMap((record, index) =>
    categoryIds.has(record.categoryId)
      ? []
      : [{ path: `${path}.${index}.categoryId`, message: 'This category does not exist.' }],
  );
}

// PRE:  schema validates a category-bearing input; categories are the current stored categories
// POST: validates input and its category reference, returning InvalidInput for an absent category
export function parseCategorisedInput<Output extends { categoryId: string }>(
  schema: z.ZodType<Output>,
  input: unknown,
  categories: readonly Category[],
): Result<Output> {
  const parsed = parseInput(schema, input);
  if (!parsed.ok) {
    return parsed;
  }
  return categories.some((category) => category.id === parsed.value.categoryId)
    ? parsed
    : err({
        code: 'InvalidInput',
        issues: [{ path: 'categoryId', message: 'This category does not exist.' }],
      });
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
  const parsed = importFileSchema.safeParse(raw);
  if (!parsed.success) {
    return err({ code: 'InvalidImport', issues: toFieldIssues(parsed.error) });
  }
  const issues = linkIssues(parsed.data.events, parsed.data.tasks, parsed.data.categories);
  return issues.length === 0 ? ok(parsed.data) : err({ code: 'InvalidImport', issues });
}
