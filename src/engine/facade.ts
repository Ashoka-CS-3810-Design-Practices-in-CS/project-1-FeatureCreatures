// The engine's single entry point (TECH_SPEC §7.2) — Facade pattern: the UI calls only this
// interface, which hides the state, the pipelines, the algorithms and the repository behind it.

import type { Repository } from '@/data/repository';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import { parseInput, settingsSchema, storedDataSchema } from '@/shared/schemas';
import type {
  EventInput,
  Interval,
  Minute,
  MutationResult,
  ReplanPlan,
  ReplanResult,
  Settings,
  SlotSearchResult,
  Snapshot,
  TaskInput,
  UserCriterion,
} from '@/shared/types';
import { applyAlternative, suggestAlternatives } from './pipelines/conflictResolution';
import { createEvent, deleteEvent, moveEvent, updateEvent } from './pipelines/eventCrud';
import {
  createTask,
  deleteTask,
  findSlots,
  orderForScheduling,
  scheduleTask,
  unscheduleTask,
  updateTask,
} from './pipelines/taskScheduler';
import { notBeforeFor } from './search';
import { createState, type EngineState, type PipelineContext, type PipelineOutcome } from './state';

export interface EngineDeps {
  repo: Repository;
  now: () => Minute;
  newId: () => string;
}

export interface Engine {
  init(): Promise<Result<Snapshot>>;
  snapshot(): Snapshot;

  // ── Event CRUD pipeline (FR1–FR3) ──
  createEvent(input: EventInput): Promise<Result<MutationResult>>;
  updateEvent(id: string, input: EventInput): Promise<Result<MutationResult>>;
  moveEvent(id: string, to: Interval): Promise<Result<MutationResult>>; // drag / resize
  deleteEvent(id: string): Promise<Result<MutationResult>>;

  // ── Conflict Resolution pipeline (FR4 is automatic inside commit; FR7) ──
  suggestAlternatives(req: {
    eventId: string;
    otherEventId?: string;
    bufferMin?: number;
  }): Result<SlotSearchResult>;
  applyAlternative(req: {
    eventId: string;
    slot: Interval;
    baseVersion: number;
  }): Promise<Result<MutationResult>>;

  // ── Task Scheduler pipeline (FR5, FR8, FR9) ──
  createTask(input: TaskInput): Promise<Result<MutationResult>>;
  updateTask(id: string, input: TaskInput): Promise<Result<MutationResult>>;
  deleteTask(id: string): Promise<Result<MutationResult>>;
  unscheduleTask(id: string): Promise<Result<MutationResult>>;
  orderForScheduling(taskIds: readonly string[]): string[]; // BR-11; drops non-unscheduled/unknown
  findSlots(req: {
    taskId: string;
    criterion?: UserCriterion;
    bufferMin?: number;
  }): Result<SlotSearchResult>;
  scheduleTask(req: {
    taskId: string;
    slot: Interval;
    baseVersion: number;
  }): Promise<Result<MutationResult>>;

  // ── Replan pipeline (FR10) ──
  planReplan(req: { range: Interval; bufferMin?: number }): Result<ReplanResult>;
  applyReplan(req: {
    baseVersion: number;
    planId: ReplanPlan['id'];
  }): Promise<Result<MutationResult>>;

  // ── services ──
  updateSettings(settings: Settings): Promise<Result<Snapshot>>; // not undoable; bumps version
  undo(): Promise<Result<MutationResult>>; // no-op ok() with same snapshot if empty
  redo(): Promise<Result<MutationResult>>;
  exportData(): string; // JSON of ExportFile
  importData(json: string): Promise<Result<Snapshot>>; // replace-all; clears history
}

// PRE:  workItem names the WI that implements the method, e.g. 'WI-14'
// POST: never returns; throws so a call to an unfinished method fails loudly instead of silently
function notImplementedUntil(workItem: string): never {
  throw new Error(`Not implemented until ${workItem}`);
}

// PRE:  error is any value thrown by a repository
// POST: returns err StorageError carrying error's message (ER5)
function storageError(error: unknown): Result<never, EngineError> {
  return err({
    code: 'StorageError',
    message: error instanceof Error ? error.message : String(error),
  });
}

class CalendarEngine implements Engine {
  private readonly deps: EngineDeps;
  private state: EngineState = createState({ events: [], tasks: [], settings: DEFAULT_SETTINGS });
  private chain: Promise<unknown> = Promise.resolve();

  // PRE:  deps.repo is a Repository; deps.now returns the current Minute; deps.newId returns fresh ids
  // POST: creates an engine with empty state; call init() before anything else
  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  // PRE:  task is an async function
  // POST: runs task after every earlier queued task has settled, so mutations never interleave
  //       (TECH_SPEC §7.3); returns task's own promise, while a failure does not break the queue
  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task, task);
    this.chain = result.catch(() => undefined);
    return result;
  }

  // PRE:  none
  // POST: returns the pipeline context for the current state, with now read once
  private context(): PipelineContext {
    return {
      state: this.state,
      repo: this.deps.repo,
      now: this.deps.now(),
      newId: this.deps.newId,
    };
  }

  // PRE:  pipeline is a mutation pipeline
  // POST: queues pipeline on the current state; on success the engine adopts the new state and
  //       returns its MutationResult; on error the state is unchanged and the error is returned
  private mutate(
    pipeline: (context: PipelineContext) => Promise<Result<PipelineOutcome>>,
  ): Promise<Result<MutationResult>> {
    return this.run(async () => {
      const result = await pipeline(this.context());
      if (!result.ok) {
        return result;
      }
      this.state = result.value.state;
      const { label, changedEventIds, introducedConflicts, resolvedConflicts, suggestion } =
        result.value;
      return ok({
        snapshot: this.snapshot(),
        label,
        changedEventIds,
        introducedConflicts,
        resolvedConflicts,
        suggestion,
      });
    });
  }

  // PRE:  none (Repository.load() returns untrusted data)
  // POST: replaces the state with the validated stored data (events sorted, conflicts detected,
  //       empty history); first run saves DEFAULT_SETTINGS; err StorageError when loading or saving
  //       fails or the stored data is damaged, leaving the state unchanged
  init(): Promise<Result<Snapshot>> {
    return this.run(async () => {
      let loaded: unknown;
      try {
        loaded = await this.deps.repo.load();
      } catch (error) {
        return storageError(error);
      }
      const parsed = parseInput(storedDataSchema, loaded);
      if (!parsed.ok) {
        return storageError(new Error('Saved data is damaged.'));
      }
      const settings = parsed.value.settings ?? DEFAULT_SETTINGS;
      if (parsed.value.settings === null) {
        try {
          await this.deps.repo.saveSettings(settings);
        } catch (error) {
          return storageError(error);
        }
      }
      this.state = createState({ ...parsed.value, settings });
      return ok(this.snapshot());
    });
  }

  // PRE:  none
  // POST: returns the read-only view of the current state the UI renders
  snapshot(): Snapshot {
    const { version, events, tasks, settings, conflicts, undo, redo } = this.state;
    return {
      version,
      events,
      tasks,
      settings,
      conflicts,
      canUndo: undo.length > 0,
      canRedo: redo.length > 0,
      undoLabel: undo.at(-1)?.label ?? null,
      redoLabel: redo.at(-1)?.label ?? null,
    };
  }

  // PRE:  input comes from the UI (validated by the pipeline)
  // POST: as eventCrud.createEvent, queued
  createEvent(input: EventInput): Promise<Result<MutationResult>> {
    return this.mutate((context) => createEvent(context, input));
  }

  // PRE:  input comes from the UI (validated by the pipeline)
  // POST: as eventCrud.updateEvent, queued
  updateEvent(id: string, input: EventInput): Promise<Result<MutationResult>> {
    return this.mutate((context) => updateEvent(context, id, input));
  }

  // PRE:  to comes from the UI (validated by the pipeline)
  // POST: as eventCrud.moveEvent, queued
  moveEvent(id: string, to: Interval): Promise<Result<MutationResult>> {
    return this.mutate((context) => moveEvent(context, id, to));
  }

  // PRE:  none
  // POST: as eventCrud.deleteEvent, queued
  deleteEvent(id: string): Promise<Result<MutationResult>> {
    return this.mutate((context) => deleteEvent(context, id));
  }

  // PRE:  req comes from the UI (bufferMin validated by the pipeline)
  // POST: as conflictResolution.suggestAlternatives on the current state, with notBefore from now
  suggestAlternatives(req: {
    eventId: string;
    otherEventId?: string;
    bufferMin?: number;
  }): Result<SlotSearchResult> {
    return suggestAlternatives(this.state, req, notBeforeFor(this.deps.now()));
  }

  // PRE:  req comes from the UI (checked by the pipeline, version check included)
  // POST: as conflictResolution.applyAlternative, queued, so the version check sees the latest state
  applyAlternative(req: {
    eventId: string;
    slot: Interval;
    baseVersion: number;
  }): Promise<Result<MutationResult>> {
    return this.mutate((context) => applyAlternative(context, req));
  }

  // PRE:  input comes from the UI (validated by the pipeline)
  // POST: as taskScheduler.createTask, queued
  createTask(input: TaskInput): Promise<Result<MutationResult>> {
    return this.mutate((context) => createTask(context, input));
  }

  // PRE:  input comes from the UI (validated by the pipeline)
  // POST: as taskScheduler.updateTask, queued
  updateTask(id: string, input: TaskInput): Promise<Result<MutationResult>> {
    return this.mutate((context) => updateTask(context, id, input));
  }

  // PRE:  none
  // POST: as taskScheduler.deleteTask, queued
  deleteTask(id: string): Promise<Result<MutationResult>> {
    return this.mutate((context) => deleteTask(context, id));
  }

  // PRE:  none
  // POST: as taskScheduler.unscheduleTask, queued
  unscheduleTask(id: string): Promise<Result<MutationResult>> {
    return this.mutate((context) => unscheduleTask(context, id));
  }

  // PRE:  none
  // POST: as taskScheduler.orderForScheduling on the current state
  orderForScheduling(taskIds: readonly string[]): string[] {
    return orderForScheduling(this.state, taskIds);
  }

  // PRE:  req comes from the UI (bufferMin validated by the pipeline)
  // POST: as taskScheduler.findSlots on the current state, with notBefore from now
  findSlots(req: {
    taskId: string;
    criterion?: UserCriterion;
    bufferMin?: number;
  }): Result<SlotSearchResult> {
    return findSlots(this.state, req, notBeforeFor(this.deps.now()));
  }

  // PRE:  req comes from the UI (checked by the pipeline, version check included)
  // POST: as taskScheduler.scheduleTask, queued, so the version check sees the latest state
  scheduleTask(req: {
    taskId: string;
    slot: Interval;
    baseVersion: number;
  }): Promise<Result<MutationResult>> {
    return this.mutate((context) => scheduleTask(context, req));
  }

  // PRE:  none
  // POST: not implemented until WI-16
  planReplan(): Result<ReplanResult> {
    return notImplementedUntil('WI-16');
  }

  // PRE:  none
  // POST: not implemented until WI-16
  applyReplan(): Promise<Result<MutationResult>> {
    return notImplementedUntil('WI-16');
  }

  // PRE:  settings comes from the UI (any shape)
  // POST: on valid settings, persists them, adopts them and bumps the version (no history entry,
  //       conflicts unchanged, §7.4.5); err InvalidInput / InvalidTime, or StorageError when saving
  //       fails, leaving the state unchanged
  updateSettings(settings: Settings): Promise<Result<Snapshot>> {
    return this.run(async () => {
      const parsed = parseInput(settingsSchema, settings);
      if (!parsed.ok) {
        return parsed;
      }
      try {
        await this.deps.repo.saveSettings(parsed.value);
      } catch (error) {
        return storageError(error);
      }
      this.state = { ...this.state, settings: parsed.value, version: this.state.version + 1 };
      return ok(this.snapshot());
    });
  }

  // PRE:  none
  // POST: not implemented until WI-17
  undo(): Promise<Result<MutationResult>> {
    return notImplementedUntil('WI-17');
  }

  // PRE:  none
  // POST: not implemented until WI-17
  redo(): Promise<Result<MutationResult>> {
    return notImplementedUntil('WI-17');
  }

  // PRE:  none
  // POST: not implemented until WI-17
  exportData(): string {
    return notImplementedUntil('WI-17');
  }

  // PRE:  none
  // POST: not implemented until WI-17
  importData(): Promise<Result<Snapshot>> {
    return notImplementedUntil('WI-17');
  }
}

// PRE:  deps.repo is a Repository; deps.now returns the current Minute; deps.newId returns fresh ids
// POST: returns an Engine with empty state; the caller must await init() before using it
export function createEngine(deps: EngineDeps): Engine {
  return new CalendarEngine(deps);
}
