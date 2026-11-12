// Event CRUD pipeline (TECH_SPEC §7.4.1, FR1–FR3, ER4): validate → look up → build a Change →
// commit → attach a suggestion when the change caused a conflict.

import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import {
  eventInputSchema,
  parseCategorisedInput,
  parseInput,
  taskInputSchema,
} from '@/shared/schemas';
import type { CalendarEvent, EventInput, Interval, Minute, SlotOption, Task } from '@/shared/types';
import { notBeforeFor } from '../search';
import {
  commit,
  type Change,
  type EngineState,
  type PipelineContext,
  type PipelineOutcome,
  type RecordChange,
} from '../state';
import { suggestAlternatives } from './conflictResolution';

type PipelineResult = Promise<Result<PipelineOutcome, EngineError>>;

// PRE:  state is an EngineState; id is any string
// POST: returns the event with that id, or err NotFound
function findEvent(state: EngineState, id: string): Result<CalendarEvent, EngineError> {
  const event = state.events.find((candidate) => candidate.id === id);
  return event === undefined ? err({ code: 'NotFound', entity: 'event', id }) : ok(event);
}

// PRE:  event is an event
// POST: returns the EventInput fields of event
export function inputOf(event: CalendarEvent): EventInput {
  const { title, description, categoryId, priority, start, end, flexible, flexWindow } = event;
  return { title, description, categoryId, priority, start, end, flexible, flexWindow };
}

// PRE:  state.events is sorted; eventId is in state.events; notBefore is now rounded to SNAP_MIN
// POST: returns the top nearest alternative for eventId, or null when the search finds none
function topAlternative(state: EngineState, eventId: string, notBefore: Minute): SlotOption | null {
  const result = suggestAlternatives(state, { eventId }, notBefore);
  return result.ok ? (result.value.options[0] ?? null) : null;
}

// PRE:  change is valid for context.state; subjectId is the id of the event change creates or edits
// POST: commits change ('do'); on success also returns, as suggestion, the top alternative for
//       subjectId when an introduced conflict involves it (ER4), else null; errors pass through
export async function commitWithSuggestion(
  context: PipelineContext,
  change: Change,
  subjectId: string,
): PipelineResult {
  const committed = await commit(context.state, change, 'do', context.repo);
  if (!committed.ok) {
    return committed;
  }
  const involved = committed.value.introducedConflicts.some(
    (conflict) => conflict.aId === subjectId || conflict.bId === subjectId,
  );
  const suggestion = involved
    ? topAlternative(committed.value.state, subjectId, notBeforeFor(context.now))
    : null;
  return ok({ ...committed.value, suggestion });
}

// PRE:  input comes from outside (any shape)
// POST: on valid input, persists a new fixed-or-flexible event with a fresh id and returns the
//       outcome (label 'Create "<title>"'); err InvalidInput / InvalidTime otherwise
export async function createEvent(context: PipelineContext, input: unknown): PipelineResult {
  const parsed = parseCategorisedInput(eventInputSchema, input, context.state.categories);
  if (!parsed.ok) {
    return parsed;
  }
  const event: CalendarEvent = {
    ...parsed.value,
    id: context.newId(),
    taskId: null,
    keptInBarred: [],
    createdAt: context.now,
    updatedAt: context.now,
  };
  return commitWithSuggestion(
    context,
    {
      label: `Create "${event.title}"`,
      events: [{ id: event.id, before: null, after: event }],
      tasks: [],
    },
    event.id,
  );
}

// PRE:  task is the task scheduled as event (task.scheduledEventId = event.id); now is the Minute
// POST: returns the BR-9 mirror of event onto task: name, priority, duration and window copied from
//       the event, validated as a task; err InvalidInput / InvalidTime when that task is invalid
function mirrorTask(task: Task, event: CalendarEvent, now: Minute): Result<Task, EngineError> {
  const mirrored = parseInput(taskInputSchema, {
    name: event.title,
    description: task.description,
    categoryId: task.categoryId,
    priority: event.priority,
    durationMin: event.end - event.start,
    window: event.flexWindow,
    useWorkingHours: task.useWorkingHours,
  });
  return mirrored.ok ? ok({ ...task, ...mirrored.value, updatedAt: now }) : mirrored;
}

// PRE:  old is in context.state.events; input comes from outside; verb names the action ('Edit', 'Move')
// POST: on valid input, persists old updated with input (a task's event stays flexible, keeps a
//       window, and mirrors into its task, BR-9) and returns the outcome labelled
//       '<verb> "<title>"'; err InvalidInput / InvalidTime otherwise
async function editEvent(
  context: PipelineContext,
  old: CalendarEvent,
  input: unknown,
  verb: string,
): PipelineResult {
  const parsed = parseCategorisedInput(eventInputSchema, input, context.state.categories);
  if (!parsed.ok) {
    return parsed;
  }
  const task = context.state.tasks.find((candidate) => candidate.id === old.taskId);
  let next: CalendarEvent = { ...old, ...parsed.value, updatedAt: context.now };
  const taskChanges: RecordChange<Task>[] = [];
  if (task !== undefined) {
    next = { ...next, flexible: true, flexWindow: next.flexWindow ?? task.window };
    const mirrored = mirrorTask(task, next, context.now);
    if (!mirrored.ok) {
      return mirrored;
    }
    taskChanges.push({ id: task.id, before: task, after: mirrored.value });
  }
  return commitWithSuggestion(
    context,
    {
      label: `${verb} "${next.title}"`,
      events: [{ id: old.id, before: old, after: next }],
      tasks: taskChanges,
    },
    old.id,
  );
}

// PRE:  id is any string; input comes from outside
// POST: as editEvent with the label 'Edit "<title>"'; err NotFound for an unknown id
export async function updateEvent(
  context: PipelineContext,
  id: string,
  input: unknown,
): PipelineResult {
  const old = findEvent(context.state, id);
  return old.ok ? editEvent(context, old.value, input, 'Edit') : old;
}

// PRE:  id is any string; to comes from outside (a drag or resize)
// POST: as editEvent with the event's other fields kept, its interval set to to, and the label
//       'Move "<title>"'; err NotFound for an unknown id
export async function moveEvent(
  context: PipelineContext,
  id: string,
  to: Interval,
): PipelineResult {
  const old = findEvent(context.state, id);
  if (!old.ok) {
    return old;
  }
  return editEvent(
    context,
    old.value,
    { ...inputOf(old.value), start: to.start, end: to.end },
    'Move',
  );
}

// PRE:  id is any string
// POST: persists the deletion of the event (its task, if any, back to unscheduled in the same
//       change, BR-9) and returns the outcome labelled 'Delete "<title>"'; err NotFound otherwise
export async function deleteEvent(context: PipelineContext, id: string): PipelineResult {
  const found = findEvent(context.state, id);
  if (!found.ok) {
    return found;
  }
  const event = found.value;
  const task = context.state.tasks.find((candidate) => candidate.id === event.taskId);
  const taskChanges: RecordChange<Task>[] =
    task === undefined
      ? []
      : [
          {
            id: task.id,
            before: task,
            after: {
              ...task,
              status: 'unscheduled',
              scheduledEventId: null,
              updatedAt: context.now,
            },
          },
        ];
  const committed = await commit(
    context.state,
    {
      label: `Delete "${event.title}"`,
      events: [{ id: event.id, before: event, after: null }],
      tasks: taskChanges,
    },
    'do',
    context.repo,
  );
  return committed.ok ? ok({ ...committed.value, suggestion: null }) : committed;
}
