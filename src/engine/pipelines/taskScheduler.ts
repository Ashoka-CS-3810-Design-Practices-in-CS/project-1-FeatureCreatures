// Task Scheduler pipeline (TECH_SPEC §7.4.3, FR5, FR8, FR9): task CRUD, the best-time search for a
// task, and scheduling it as a flexible event that stays in sync with it (BR-9).

import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import {
  eventInputSchema,
  parseInput,
  parseCategorisedInput,
  searchOptionsSchema,
  taskInputSchema,
  doneBeforeSchema,
  doneBeforeApplySchema,
} from '@/shared/schemas';
import type {
  CalendarEvent,
  DoneTasksPreview,
  Interval,
  Minute,
  SlotSearchResult,
  Task,
  UserCriterion,
  WindowExplanation,
} from '@/shared/types';
import { compareTasksForQueue } from '../algorithms/taskOrder';
import {
  explainSearch,
  requireCurrentVersion,
  requireNotPast,
  requireValidSlot,
  search,
  type SearchRequest,
} from '../search';
import {
  commit,
  type Change,
  type EngineState,
  type PipelineContext,
  type PipelineOutcome,
  type RecordChange,
  unchangedOutcome,
} from '../state';
import { commitWithSuggestion, inputOf } from './eventCrud';

type PipelineResult = Promise<Result<PipelineOutcome, EngineError>>;

export interface FindSlotsRequest {
  taskId: string;
  criterion?: UserCriterion;
  bufferMin?: number;
}

export interface ScheduleRequest {
  taskId: string;
  slot: Interval;
  baseVersion: number;
}

const ALREADY_SCHEDULED: EngineError = {
  code: 'InvalidInput',
  issues: [{ path: 'status', message: 'Task is already scheduled.' }],
};

const TASK_DONE: EngineError = {
  code: 'InvalidInput',
  issues: [{ path: 'status', message: 'Reopen this task before finding time.' }],
};

// PRE:  state is an EngineState; id is any string
// POST: returns the task with that id, or err NotFound
function findTask(state: EngineState, id: string): Result<Task, EngineError> {
  const task = state.tasks.find((candidate) => candidate.id === id);
  return task === undefined ? err({ code: 'NotFound', entity: 'task', id }) : ok(task);
}

// PRE:  task is in state.tasks
// POST: returns task's scheduled event, or null when task is unscheduled
function linkedEvent(state: EngineState, task: Task): CalendarEvent | null {
  return state.events.find((event) => event.id === task.scheduledEventId) ?? null;
}

// PRE:  committed is the result of commit
// POST: returns it as a pipeline result whose outcome has no suggestion; errors pass through
function withoutSuggestion(
  committed: Result<Omit<PipelineOutcome, 'suggestion'>, EngineError>,
): Result<PipelineOutcome, EngineError> {
  return committed.ok ? ok({ ...committed.value, suggestion: null }) : committed;
}

// PRE:  change is valid for context.state
// POST: commits change ('do') and returns the outcome without a suggestion; errors pass through
async function commitPlain(context: PipelineContext, change: Change): PipelineResult {
  return withoutSuggestion(await commit(context.state, change, 'do', context.repo));
}

// PRE:  input comes from outside (any shape)
// POST: on valid input, persists a new unscheduled task and returns the outcome
//       (label 'Create task "<name>"'); err InvalidInput / InvalidTime otherwise (T31)
export async function createTask(context: PipelineContext, input: unknown): PipelineResult {
  const parsed = parseCategorisedInput(taskInputSchema, input, context.state.categories);
  if (!parsed.ok) {
    return parsed;
  }
  const task: Task = {
    ...parsed.value,
    id: context.newId(),
    status: 'unscheduled',
    doneAt: null,
    scheduledEventId: null,
    createdAt: context.now,
    updatedAt: context.now,
  };
  return commitPlain(context, {
    label: `Create task "${task.name}"`,
    events: [],
    tasks: [{ id: task.id, before: null, after: task }],
  });
}

// PRE:  task is scheduled as event; now is the Minute
// POST: returns the BR-9 mirror of task onto event (title, priority, window; start kept, end =
//       start + durationMin), validated as an event; err InvalidInput / InvalidTime when invalid
//       (a task window may be shorter than the task, but a flex window may not)
function mirrorEvent(
  task: Task,
  event: CalendarEvent,
  now: Minute,
): Result<CalendarEvent, EngineError> {
  const mirrored = parseInput(eventInputSchema, {
    ...inputOf(event),
    title: task.name,
    priority: task.priority,
    end: event.start + task.durationMin,
    flexible: true,
    flexWindow: task.window,
  });
  return mirrored.ok ? ok({ ...event, ...mirrored.value, updatedAt: now }) : mirrored;
}

// PRE:  id is any string; input comes from outside
// POST: on valid input, persists the edited task (and, when scheduled, its mirrored event in the
//       same change, BR-9) and returns the outcome labelled 'Edit task "<name>"' with the ER4
//       suggestion for the event; err NotFound / InvalidInput / InvalidTime otherwise
export async function updateTask(
  context: PipelineContext,
  id: string,
  input: unknown,
): PipelineResult {
  const found = findTask(context.state, id);
  if (!found.ok) {
    return found;
  }
  const parsed = parseCategorisedInput(taskInputSchema, input, context.state.categories);
  if (!parsed.ok) {
    return parsed;
  }
  const old = found.value;
  const next: Task = { ...old, ...parsed.value, updatedAt: context.now };
  const change: Change = {
    label: `Edit task "${next.name}"`,
    events: [],
    tasks: [{ id, before: old, after: next }],
  };
  const event = linkedEvent(context.state, old);
  if (event === null) {
    return commitPlain(context, change);
  }
  const mirrored = mirrorEvent(next, event, context.now);
  if (!mirrored.ok) {
    return mirrored;
  }
  return commitWithSuggestion(
    context,
    { ...change, events: [{ id: event.id, before: event, after: mirrored.value }] },
    event.id,
  );
}

// PRE:  task is in context.state.tasks
// POST: returns the record change deleting task's event, or none when task is unscheduled
function eventDeletion(context: PipelineContext, task: Task): RecordChange<CalendarEvent>[] {
  const event = linkedEvent(context.state, task);
  return event === null ? [] : [{ id: event.id, before: event, after: null }];
}

// PRE:  id is any string
// POST: persists the deletion of the task and of its event when scheduled, in one change labelled
//       'Delete task "<name>"'; err NotFound otherwise
export async function deleteTask(context: PipelineContext, id: string): PipelineResult {
  const found = findTask(context.state, id);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  return commitPlain(context, {
    label: `Delete task "${task.name}"`,
    events: eventDeletion(context, task),
    tasks: [{ id, before: task, after: null }],
  });
}

// PRE:  id is any string
// POST: for a scheduled task, persists deleting its event and setting it unscheduled in one change
//       labelled 'Unschedule "<name>"'; for an unscheduled task, returns ok with the state
//       unchanged, no history entry and the label ''; done tasks also stay unchanged; err NotFound otherwise
export async function unscheduleTask(context: PipelineContext, id: string): PipelineResult {
  const found = findTask(context.state, id);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (task.status !== 'scheduled') {
    return ok(unchangedOutcome(context.state));
  }
  return commitPlain(context, {
    label: `Unschedule "${task.name}"`,
    events: eventDeletion(context, task),
    tasks: [
      {
        id,
        before: task,
        after: { ...task, status: 'unscheduled', scheduledEventId: null, updatedAt: context.now },
      },
    ],
  });
}

// PRE: tasks are distinct open tasks from context.state
// POST: atomically deletes their linked events and completes them at context.now in one undo step;
//       empty tasks is a no-op; repository failure preserves state/storage/history
async function completeTasks(
  context: PipelineContext,
  tasks: readonly Task[],
  label: string,
): PipelineResult {
  if (tasks.length === 0) return ok(unchangedOutcome(context.state));
  return commitPlain(context, {
    label,
    events: tasks.flatMap((task) => eventDeletion(context, task)),
    tasks: tasks.map((task) => ({
      id: task.id,
      before: task,
      after: {
        ...task,
        status: 'done',
        doneAt: context.now,
        scheduledEventId: null,
        updatedAt: context.now,
      },
    })),
  });
}

// PRE: id is any string
// POST: completes the task atomically with deleting its event; already done is a no-op; err NotFound
export async function markTaskDone(context: PipelineContext, id: string): PipelineResult {
  const found = findTask(context.state, id);
  if (!found.ok) return found;
  const task = found.value;
  return completeTasks(context, task.status === 'done' ? [] : [task], `Mark done "${task.name}"`);
}

// PRE: id is any string
// POST: reopens a done task to unscheduled, clears doneAt and creates no event in one undo step;
//       open tasks are unchanged; err NotFound
export async function reopenTask(context: PipelineContext, id: string): PipelineResult {
  const found = findTask(context.state, id);
  if (!found.ok) return found;
  const task = found.value;
  if (task.status !== 'done') return ok(unchangedOutcome(context.state));
  return commitPlain(context, {
    label: `Reopen "${task.name}"`,
    events: [],
    tasks: [
      {
        id,
        before: task,
        after: { ...task, status: 'unscheduled', doneAt: null, updatedAt: context.now },
      },
    ],
  });
}

// PRE: state has valid task links; before is a validated Minute
// POST: returns open tasks with event end (scheduled) or window end (unscheduled) <= before,
//       in stored task order, with no writes
function tasksDoneBefore(state: EngineState, before: Minute): Task[] {
  const eventsById = new Map(state.events.map((event) => [event.id, event]));
  return state.tasks.filter((task) => {
    if (task.status === 'done') return false;
    const end =
      task.status === 'scheduled'
        ? (eventsById.get(task.scheduledEventId as string) as CalendarEvent).end
        : task.window.end;
    return end <= before;
  });
}

// PRE: before comes from outside
// POST: validates cutoff and returns a detached, read-only preview/version without writing
export function previewDoneBefore(state: EngineState, before: Minute): Result<DoneTasksPreview> {
  const parsed = parseInput(doneBeforeSchema, { before });
  if (!parsed.ok) return parsed;
  return ok({
    before: parsed.value.before,
    baseVersion: state.version,
    tasks: structuredClone(tasksDoneBefore(state, parsed.value.before)),
  });
}

// PRE: request comes from outside
// POST: validates cutoff/version and completes the eligible set in one atomic undo step;
//       stale previews return StaleResult without writing; task ids are derived, never trusted from UI
export async function applyDoneBefore(
  context: PipelineContext,
  request: { before: Minute; baseVersion: number },
): PipelineResult {
  const parsed = parseInput(doneBeforeApplySchema, request);
  if (!parsed.ok) return parsed;
  const current = requireCurrentVersion(context.state, parsed.value.baseVersion);
  if (!current.ok) return current;
  const tasks = tasksDoneBefore(context.state, parsed.value.before);
  return completeTasks(context, tasks, `Mark ${tasks.length} tasks done`);
}

// PRE:  taskIds is any list of strings
// POST: returns the ids of the distinct unscheduled tasks among taskIds in BR-11 queue order;
//       unknown and scheduled ids are dropped
export function orderForScheduling(state: EngineState, taskIds: readonly string[]): string[] {
  const wanted = new Set(taskIds);
  return state.tasks
    .filter((task) => wanted.has(task.id) && task.status === 'unscheduled')
    .toSorted(compareTasksForQueue)
    .map((task) => task.id);
}

// PRE:  state.events is sorted; request comes from outside (bufferMin unchecked)
// POST: returns the search findSlots runs for the unscheduled task (its window, working hours as
//       the task says, criterion ?? settings.defaultCriterion, buffer ?? settings.bufferMin); err
//       InvalidInput for a bad bufferMin or a scheduled task, or NotFound
function taskSearch(
  state: EngineState,
  request: FindSlotsRequest,
): Result<SearchRequest, EngineError> {
  const options = parseInput(searchOptionsSchema, { bufferMin: request.bufferMin });
  if (!options.ok) {
    return options;
  }
  const found = findTask(state, request.taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (task.status === 'scheduled') {
    return err(ALREADY_SCHEDULED);
  }
  if (task.status === 'done') return err(TASK_DONE);
  return ok({
    durationMin: task.durationMin,
    priority: task.priority,
    window: task.window,
    useWorkingHours: task.useWorkingHours,
    excludeIds: [],
    originalStart: null,
    criterion: request.criterion ?? state.settings.defaultCriterion,
    bufferMin: options.value.bufferMin ?? state.settings.bufferMin,
    subject: { kind: 'task', taskId: task.id, name: task.name },
  });
}

// PRE:  state.events is sorted; request comes from outside (bufferMin unchecked); notBefore is now
//       rounded up to SNAP_MIN
// POST: returns the ranked slots for the unscheduled task (taskSearch); err InvalidInput for a bad
//       bufferMin or a scheduled task, NotFound, or the search's ER2 / ER3
export function findSlots(
  state: EngineState,
  request: FindSlotsRequest,
  notBefore: Minute,
): Result<SlotSearchResult, EngineError> {
  const prepared = taskSearch(state, request);
  return prepared.ok ? search(state, prepared.value, notBefore) : prepared;
}

// PRE:  as findSlots
// POST: returns explainSearch of the search findSlots would run for request (WI-45), or its
//       InvalidInput / NotFound error
export function explainTaskWindow(
  state: EngineState,
  request: FindSlotsRequest,
  notBefore: Minute,
): Result<WindowExplanation, EngineError> {
  const prepared = taskSearch(state, request);
  return prepared.ok ? ok(explainSearch(state, prepared.value, notBefore)) : prepared;
}

// PRE:  request comes from the UI, normally an option of findSlots
// POST: persists a new flexible event for the task at request.slot (window = task window, taskId
//       set) and the task as scheduled, in one change labelled 'Schedule "<name>"'; err StaleResult
//       when the state changed since request.baseVersion or the slot now starts in the past (ER7),
//       NotFound, InvalidInput for a
//       scheduled task, or InvalidTime when the slot is not exactly the task's duration
export async function scheduleTask(
  context: PipelineContext,
  request: ScheduleRequest,
): PipelineResult {
  const current = requireCurrentVersion(context.state, request.baseVersion);
  if (!current.ok) {
    return current;
  }
  const found = findTask(context.state, request.taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (task.status === 'scheduled') {
    return err(ALREADY_SCHEDULED);
  }
  if (task.status === 'done') return err(TASK_DONE);
  const fits = requireValidSlot(request.slot, task.durationMin);
  if (!fits.ok) {
    return fits;
  }
  const upcoming = requireNotPast(request.slot.start, context.now);
  if (!upcoming.ok) {
    return upcoming;
  }

  const event: CalendarEvent = {
    id: context.newId(),
    title: task.name,
    description: task.description,
    categoryId: task.categoryId,
    priority: task.priority,
    start: request.slot.start,
    end: request.slot.end,
    flexible: true,
    flexWindow: task.window,
    taskId: task.id,
    keptInBarred: [],
    createdAt: context.now,
    updatedAt: context.now,
  };
  return commitPlain(context, {
    label: `Schedule "${task.name}"`,
    events: [{ id: event.id, before: null, after: event }],
    tasks: [
      {
        id: task.id,
        before: task,
        after: { ...task, status: 'scheduled', scheduledEventId: event.id, updatedAt: context.now },
      },
    ],
  });
}
