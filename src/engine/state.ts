// Engine state, reversible changes and the commit step (TECH_SPEC §7.1, B1).
// Every data change is a Change of before/after images, so undo is the same change applied backward.

import type { ChangeSet, Repository } from '@/data/repository';
import { HISTORY_LIMIT } from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import type { CalendarEvent, Conflict, Minute, Settings, SlotOption, Task } from '@/shared/types';
import { compareEvents, insertSorted, removeById } from './algorithms/sortedArray';
import { detectConflicts } from './algorithms/sweep';

export interface EngineState {
  readonly version: number;
  readonly events: readonly CalendarEvent[]; // ALWAYS sorted by compareEvents (start, end, id)
  readonly tasks: readonly Task[];
  readonly settings: Settings;
  readonly conflicts: readonly Conflict[];
  readonly undo: readonly Change[]; // ≤ HISTORY_LIMIT, newest last
  readonly redo: readonly Change[];
}
export interface RecordChange<T> {
  readonly id: string;
  readonly before: T | null;
  readonly after: T | null;
}
export interface Change {
  readonly label: string;
  readonly events: readonly RecordChange<CalendarEvent>[];
  readonly tasks: readonly RecordChange<Task>[];
}

export type Direction = 'forward' | 'backward';
export type CommitMode = 'do' | 'undo' | 'redo';

/** What commit hands back to the facade, which adds the snapshot and suggestion of MutationResult. */
export interface CommitOutcome {
  readonly state: EngineState;
  readonly label: string;
  readonly changedEventIds: readonly string[];
  readonly introducedConflicts: readonly Conflict[];
  readonly resolvedConflicts: readonly Conflict[];
}

/** What every mutation pipeline reads: the current state and the facade's dependencies. */
export interface PipelineContext {
  readonly state: EngineState;
  readonly repo: Repository;
  readonly now: Minute;
  readonly newId: () => string;
}

/** A mutation pipeline's result: the commit outcome plus the ER4 suggestion, if any. */
export interface PipelineOutcome extends CommitOutcome {
  readonly suggestion: SlotOption | null;
}

// PRE:  events have distinct ids, in any order; tasks have distinct ids
// POST: returns version 0 over these records: events sorted by compareEvents, their conflicts
//       detected, and empty undo / redo stacks
export function createState(data: {
  events: readonly CalendarEvent[];
  tasks: readonly Task[];
  settings: Settings;
}): EngineState {
  const events = data.events.toSorted(compareEvents);
  return {
    version: 0,
    events,
    tasks: [...data.tasks],
    settings: data.settings,
    conflicts: detectConflicts(events),
    undo: [],
    redo: [],
  };
}

// PRE:  record is a RecordChange; direction is 'forward' or 'backward'
// POST: returns the image direction writes: after when forward, before when backward (null = absent)
function imageFor<T>(record: RecordChange<T>, direction: Direction): T | null {
  return direction === 'forward' ? record.after : record.before;
}

// PRE:  tasks have distinct ids; image is null or a task with id = id
// POST: returns tasks with the task id replaced in place by image, appended when it was absent,
//       or removed when image is null
function writeTask(tasks: readonly Task[], id: string, image: Task | null): Task[] {
  if (image === null) {
    return removeById(tasks, id);
  }
  const index = tasks.findIndex((existing) => existing.id === id);
  return index === -1 ? [...tasks, image] : tasks.with(index, image);
}

// PRE:  state.events is sorted by compareEvents; change touches each record at most once
// POST: returns state's events and tasks with every image for direction written: a null image
//       deletes the record; events stay sorted; state is not mutated
export function applyChange(
  state: EngineState,
  change: Change,
  direction: Direction,
): { events: CalendarEvent[]; tasks: Task[] } {
  let events = [...state.events];
  let tasks = [...state.tasks];

  // INVARIANT: events is sorted and has every visited event record's image written
  for (const record of change.events) {
    events = removeById(events, record.id);
    const image = imageFor(record, direction);
    if (image !== null) {
      events = insertSorted(events, image);
    }
  }
  // POST: events has every event image written, sorted

  // INVARIANT: tasks has every visited task record's image written, other tasks in their old order
  for (const record of change.tasks) {
    tasks = writeTask(tasks, record.id, imageFor(record, direction));
  }
  // POST: tasks has every task image written

  return { events, tasks };
}

// PRE:  records is a list of RecordChanges; direction is 'forward' or 'backward'
// POST: returns the records whose image for direction is non-null, and the ids of those whose is null
function splitImages<T>(
  records: readonly RecordChange<T>[],
  direction: Direction,
): { puts: T[]; deleteIds: string[] } {
  const puts: T[] = [];
  const deleteIds: string[] = [];

  // INVARIANT: every visited record is in puts (non-null image) or deleteIds (null image)
  for (const record of records) {
    const image = imageFor(record, direction);
    if (image === null) {
      deleteIds.push(record.id);
    } else {
      puts.push(image);
    }
  }
  // POST: every record is in exactly one of puts and deleteIds

  return { puts, deleteIds };
}

// PRE:  change is a Change; direction is 'forward' or 'backward'
// POST: returns the repository ChangeSet that writes change's images for direction (§9.1)
function changeSetFor(change: Change, direction: Direction): ChangeSet {
  const events = splitImages(change.events, direction);
  const tasks = splitImages(change.tasks, direction);
  return {
    putEvents: events.puts,
    deleteEventIds: events.deleteIds,
    putTasks: tasks.puts,
    deleteTaskIds: tasks.deleteIds,
  };
}

// PRE:  from and to are conflict lists
// POST: returns the conflicts of from whose key does not appear in to, in from's order
function conflictsMissingFrom(
  from: readonly Conflict[],
  to: readonly Conflict[],
): readonly Conflict[] {
  const keys = new Set(to.map((conflict) => conflict.key));
  return from.filter((conflict) => !keys.has(conflict.key));
}

// PRE:  mode 'undo' ⟹ change is the last entry of state.undo; mode 'redo' ⟹ the last of state.redo
// POST: returns the undo / redo stacks after mode: 'do' pushes change onto undo (dropping the oldest
//       beyond HISTORY_LIMIT) and clears redo; 'undo' moves it from undo to redo; 'redo' moves it back
function nextHistory(
  state: EngineState,
  change: Change,
  mode: CommitMode,
): { undo: readonly Change[]; redo: readonly Change[] } {
  if (mode === 'do') {
    return { undo: [...state.undo, change].slice(-HISTORY_LIMIT), redo: [] };
  }
  if (mode === 'undo') {
    return { undo: state.undo.slice(0, -1), redo: [...state.redo, change] };
  }
  return { undo: [...state.undo, change], redo: state.redo.slice(0, -1) };
}

// PRE:  error is any value thrown by a repository
// POST: returns a human-readable message for it
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// PRE:  state.events is sorted; change touches each record at most once and has been validated by the
//       caller; mode 'undo' / 'redo' ⟹ change is the last entry of state.undo / state.redo
// POST: on success, the repository holds change's images for the direction (backward for 'undo',
//       forward otherwise) and returns the next state (records written, conflicts re-detected,
//       history updated, version + 1) with the changed event ids and the introduced / resolved
//       conflicts; when repo.apply rejects, returns StorageError and neither state nor repo change
export async function commit(
  state: EngineState,
  change: Change,
  mode: CommitMode,
  repo: Repository,
): Promise<Result<CommitOutcome, EngineError>> {
  const direction: Direction = mode === 'undo' ? 'backward' : 'forward';
  const next = applyChange(state, change, direction);
  try {
    await repo.apply(changeSetFor(change, direction));
  } catch (error) {
    // Nothing has been assigned yet, so the old state is still the current one (ER5).
    return err({ code: 'StorageError', message: messageOf(error) });
  }

  const conflicts = detectConflicts(next.events);
  return ok({
    state: {
      ...state,
      ...next,
      ...nextHistory(state, change, mode),
      conflicts,
      version: state.version + 1,
    },
    label: change.label,
    changedEventIds: change.events
      .filter((record) => imageFor(record, direction) !== null)
      .map((record) => record.id),
    introducedConflicts: conflictsMissingFrom(conflicts, state.conflicts),
    resolvedConflicts: conflictsMissingFrom(state.conflicts, conflicts),
  });
}

// PRE:  state is the current state
// POST: returns the outcome of a command that had nothing to do: state as it is, label '', no
//       changes, no conflicts introduced or resolved, no suggestion (and so no history entry)
export function unchangedOutcome(state: EngineState): PipelineOutcome {
  return {
    state,
    label: '',
    changedEventIds: [],
    introducedConflicts: [],
    resolvedConflicts: [],
    suggestion: null,
  };
}

// PRE:  mode is 'undo' or 'redo'
// POST: commits the newest change of that stack in mode (undo applies it backward, redo forward,
//       and it moves to the other stack) and returns the outcome labelled with the change's label;
//       an empty stack returns unchangedOutcome; StorageError leaves everything unchanged
export async function replay(
  context: PipelineContext,
  mode: 'undo' | 'redo',
): Promise<Result<PipelineOutcome, EngineError>> {
  const stack = mode === 'undo' ? context.state.undo : context.state.redo;
  const change = stack.at(-1);
  if (change === undefined) {
    return ok(unchangedOutcome(context.state));
  }
  const committed = await commit(context.state, change, mode, context.repo);
  return committed.ok ? ok({ ...committed.value, suggestion: null }) : committed;
}
