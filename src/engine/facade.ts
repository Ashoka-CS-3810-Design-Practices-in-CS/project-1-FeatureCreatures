// The engine's single entry point (TECH_SPEC §7.2) — Facade pattern: the UI calls only this
// interface, which hides the state, the pipelines, the algorithms and the repository behind it.

import type { Repository } from '@/data/repository';
import { DEFAULT_SETTINGS, EXPORT_FORMAT, EXPORT_VERSION } from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import {
  linkIssues,
  parseExportFile,
  parseInput,
  settingsSchema,
  storedDataSchema,
} from '@/shared/schemas';
import { fromMinute } from '@/shared/time';
import type {
  EventInput,
  ExportFile,
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
import { applyReplan, planReplan } from './pipelines/replan';
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
import {
  createState,
  barredOverlapsFor,
  replay,
  type EngineState,
  type PipelineContext,
  type PipelineOutcome,
} from './state';

const EXPORT_INDENT = 2; // pretty-printed JSON (§9.4)

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
  private lastReplan: ReplanResult | null = null; // §7.4.4: not part of EngineState

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
      if (!parsed.ok || linkIssues(parsed.value.events, parsed.value.tasks).length > 0) {
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
    const { version, events, tasks, settings, conflicts, barredOverlaps, undo, redo } = this.state;
    return {
      version,
      events,
      tasks,
      settings,
      conflicts,
      barredOverlaps,
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

  // PRE:  req comes from the UI (checked by the pipeline)
  // POST: as replan.planReplan on the current state, with notBefore from now; a successful result
  //       becomes lastReplan, the only plan applyReplan accepts
  planReplan(req: { range: Interval; bufferMin?: number }): Result<ReplanResult> {
    const result = planReplan(this.state, req, notBeforeFor(this.deps.now()));
    if (result.ok) {
      this.lastReplan = result.value;
    }
    return result;
  }

  // PRE:  req comes from the UI (checked by the pipeline, version check included)
  // POST: as replan.applyReplan against lastReplan, queued, so the check sees the latest state
  applyReplan(req: {
    baseVersion: number;
    planId: ReplanPlan['id'];
  }): Promise<Result<MutationResult>> {
    return this.mutate((context) => applyReplan(context, this.lastReplan, req));
  }

  // PRE:  settings comes from the UI (any shape)
  // POST: on valid settings, persists them, adopts them and bumps the version (no history entry,
  //       conflicts unchanged, barred warnings recomputed, §7.4.5); err InvalidInput / InvalidTime, or StorageError when saving
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
      this.state = {
        ...this.state,
        settings: parsed.value,
        barredOverlaps: barredOverlapsFor(this.state.events, parsed.value),
        version: this.state.version + 1,
      };
      return ok(this.snapshot());
    });
  }

  // PRE:  none
  // POST: as state.replay('undo'), queued: undoes the newest change (B1), or returns ok with the
  //       same snapshot and the label '' when there is nothing to undo
  undo(): Promise<Result<MutationResult>> {
    return this.mutate((context) => replay(context, 'undo'));
  }

  // PRE:  none
  // POST: as state.replay('redo'), queued: redoes the newest undone change, or returns ok with the
  //       same snapshot and the label '' when there is nothing to redo
  redo(): Promise<Result<MutationResult>> {
    return this.mutate((context) => replay(context, 'redo'));
  }

  // PRE:  none
  // POST: returns the current events, tasks and settings as pretty-printed ExportFile JSON (§9.4),
  //       stamped with now
  exportData(): string {
    const { events, tasks, settings } = this.state;
    const file: ExportFile = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: fromMinute(this.deps.now()).toISOString(),
      events,
      tasks,
      settings,
    };
    return JSON.stringify(file, null, EXPORT_INDENT);
  }

  // PRE:  json is untrusted text (validated here)
  // POST: on a valid export, replaces everything stored and in memory with it (events sorted,
  //       conflicts detected, history and lastReplan cleared, version + 1, §7.4.6); err
  //       InvalidImport (ER6) or StorageError, leaving the state and the repository unchanged
  importData(json: string): Promise<Result<Snapshot>> {
    return this.run(async () => {
      const parsed = parseExportFile(json);
      if (!parsed.ok) {
        return parsed;
      }
      const { events, tasks, settings } = parsed.value;
      try {
        await this.deps.repo.replaceAll({ events: [...events], tasks: [...tasks], settings });
      } catch (error) {
        return storageError(error);
      }
      const fresh = createState({ events, tasks, settings });
      this.state = { ...fresh, version: this.state.version + 1 };
      this.lastReplan = null;
      return ok(this.snapshot());
    });
  }
}

// PRE:  deps.repo is a Repository; deps.now returns the current Minute; deps.newId returns fresh ids
// POST: returns an Engine with empty state; the caller must await init() before using it
export function createEngine(deps: EngineDeps): Engine {
  return new CalendarEngine(deps);
}
