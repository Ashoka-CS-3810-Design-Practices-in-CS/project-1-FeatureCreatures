// The engine's single entry point (TECH_SPEC §7.2) — Facade pattern: the UI calls only this
// interface, which hides the state, the pipelines, the algorithms and the repository behind it.

import type { Repository } from '@/data/repository';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import {
  linkIssues,
  parseExportFile,
  parseInput,
  storedDataSchema,
  storedRevisionSchema,
} from '@/shared/schemas';
import { fromMinute } from '@/shared/time';
import type {
  CalendarEvent,
  Category,
  CategoryInput,
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
  Task,
  TaskInput,
  UserCriterion,
  WindowExplanation,
} from '@/shared/types';
import {
  applyAlternative,
  explainAlternativesWindow,
  suggestAlternatives,
} from './pipelines/conflictResolution';
import { applyReplan, planReplan } from './pipelines/replan';
import { createEvent, deleteEvent, moveEvent, updateEvent } from './pipelines/eventCrud';
import {
  createTask,
  deleteTask,
  explainTaskWindow,
  findSlots,
  orderForScheduling,
  scheduleTask,
  unscheduleTask,
  updateTask,
} from './pipelines/taskScheduler';
import { notBeforeFor } from './search';
import { createCategory, updateCategory, deleteCategory } from './pipelines/categories';
import { setBarredKept, type BarredKeepRequest } from './pipelines/barred';
import { updateSettings } from './pipelines/settings';
import {
  createState,
  replay,
  repositoryError,
  type EngineState,
  type PipelineContext,
  type PipelineOutcome,
} from './state';

const EXPORT_INDENT = 2; // pretty-printed JSON (§9.4)

export interface EngineDeps {
  repo: Repository;
  now: () => Minute;
  newId: () => string;
  onCommit?: () => void; // called after every write the repository accepted (WI-40: tells other tabs)
}

/** The search explainWindow describes: a task's (as findSlots) or an event's alternatives. */
export type WindowRequest =
  | { taskId: string; bufferMin?: number }
  | {
      eventId: string;
      useWorkingHours?: boolean;
      bufferMin?: number;
      allowMoving?: boolean;
      range?: Interval;
    };

export interface Engine {
  init(): Promise<Result<Snapshot>>;
  reload(): Promise<Result<Snapshot>>; // adopt what another tab stored; clears history (WI-40)
  snapshot(): Snapshot;
  createCategory(input: CategoryInput): Promise<Result<MutationResult>>;
  updateCategory(id: string, input: CategoryInput): Promise<Result<MutationResult>>;
  deleteCategory(id: string): Promise<Result<MutationResult>>;

  // ── Event CRUD pipeline (FR1–FR3) ──
  createEvent(input: EventInput): Promise<Result<MutationResult>>;
  updateEvent(id: string, input: EventInput): Promise<Result<MutationResult>>;
  moveEvent(id: string, to: Interval): Promise<Result<MutationResult>>; // drag / resize
  deleteEvent(id: string): Promise<Result<MutationResult>>;
  setBarredKept(request: BarredKeepRequest): Promise<Result<MutationResult>>;

  // ── Conflict Resolution pipeline (FR4 is automatic inside commit; FR7) ──
  suggestAlternatives(req: {
    eventId: string;
    otherEventId?: string;
    bufferMin?: number;
    useWorkingHours?: boolean; // WI-41; omitted = true
    allowMoving?: boolean;
    range?: Interval;
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

  // WI-45 (#7): what is left of the window findSlots / suggestAlternatives would search, read-only
  explainWindow(req: WindowRequest): Result<WindowExplanation>;

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
// POST: returns err ConcurrentModification (ER8) when another tab wrote first, otherwise err
//       StorageError carrying error's message (ER5)
function storageError(error: unknown): Result<never, EngineError> {
  return err(repositoryError(error));
}

/** What the repository holds, validated, with its revision. */
interface LoadedData {
  readonly categories: readonly Category[];
  readonly events: readonly CalendarEvent[];
  readonly tasks: readonly Task[];
  readonly settings: Settings | null;
  readonly revision: number;
}

class CalendarEngine implements Engine {
  private readonly deps: EngineDeps;
  private state: EngineState = createState({
    categories: DEFAULT_CATEGORIES,
    events: [],
    tasks: [],
    settings: DEFAULT_SETTINGS,
  });
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
      const wrote = result.value.state.revision !== this.state.revision;
      this.state = result.value.state;
      if (wrote) {
        this.deps.onCommit?.();
      }
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
  // POST: returns stored categories, events, tasks, settings and revision once validated (shapes, links
  //       and the BR-9 mirror); err StorageError when loading fails or the data is damaged
  private async loadStored(): Promise<Result<LoadedData>> {
    let loaded: unknown;
    try {
      loaded = await this.deps.repo.load();
    } catch (error) {
      return storageError(error);
    }
    const parsed = parseInput(storedDataSchema, loaded);
    const revision = parseInput(storedRevisionSchema, loaded);
    if (
      !parsed.ok ||
      !revision.ok ||
      linkIssues(parsed.value.events, parsed.value.tasks, parsed.value.categories).length > 0
    ) {
      return storageError(new Error('Saved data is damaged.'));
    }
    return ok({ ...parsed.value, revision: revision.value.revision });
  }

  // PRE:  none (Repository.load() returns untrusted data)
  // POST: replaces the state with the validated stored data (events sorted, conflicts detected,
  //       empty history); first run saves DEFAULT_SETTINGS; err StorageError when loading or saving
  //       fails or the stored data is damaged (ConcurrentModification when another tab saved the
  //       first settings meanwhile), leaving the state unchanged
  init(): Promise<Result<Snapshot>> {
    return this.run(async () => {
      const loaded = await this.loadStored();
      if (!loaded.ok) {
        return loaded;
      }
      const { categories, events, tasks, revision } = loaded.value;
      if (loaded.value.settings !== null) {
        this.state = createState(
          { categories, events, tasks, settings: loaded.value.settings },
          revision,
        );
        return ok(this.snapshot());
      }
      try {
        await this.deps.repo.saveSettings(DEFAULT_SETTINGS, revision);
      } catch (error) {
        return storageError(error);
      }
      this.state = createState(
        { categories, events, tasks, settings: DEFAULT_SETTINGS },
        revision + 1,
      );
      this.deps.onCommit?.();
      return ok(this.snapshot());
    });
  }

  // PRE:  none (Repository.load() returns untrusted data)
  // POST: queued; replaces the state with what is stored now, as after an import: events sorted,
  //       conflicts and barred overlaps detected, history and lastReplan cleared (they describe
  //       data another tab replaced) and version + 1, so open options and plans are StaleResult;
  //       err StorageError when loading fails or the data is damaged, leaving the state unchanged
  reload(): Promise<Result<Snapshot>> {
    return this.run(async () => {
      const loaded = await this.loadStored();
      if (!loaded.ok) {
        return loaded;
      }
      const { categories, events, tasks, revision } = loaded.value;
      const settings = loaded.value.settings ?? DEFAULT_SETTINGS;
      const fresh = createState({ categories, events, tasks, settings }, revision);
      this.state = { ...fresh, version: this.state.version + 1 };
      this.lastReplan = null;
      return ok(this.snapshot());
    });
  }

  // PRE:  none
  // POST: returns the read-only view of the current state the UI renders
  snapshot(): Snapshot {
    const { categories, version, events, tasks, settings, conflicts, barredOverlaps, undo, redo } =
      this.state;
    return {
      categories,
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

  // PRE:  input comes from the UI (validated by the category pipeline)
  // POST: queues one atomic, undoable category creation
  createCategory(input: CategoryInput): Promise<Result<MutationResult>> {
    return this.mutate((context) => createCategory(context, input));
  }

  // PRE:  id is any string; input comes from the UI
  // POST: queues a validated category edit, with references preserved
  updateCategory(id: string, input: CategoryInput): Promise<Result<MutationResult>> {
    return this.mutate((context) => updateCategory(context, id, input));
  }

  // PRE:  id is any string
  // POST: queues deletion of an unused category, or returns CategoryInUse/NotFound
  deleteCategory(id: string): Promise<Result<MutationResult>> {
    return this.mutate((context) => deleteCategory(context, id));
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
    useWorkingHours?: boolean;
    allowMoving?: boolean;
    range?: Interval;
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

  // PRE:  req comes from the UI (bufferMin validated by the pipelines)
  // POST: as taskScheduler.explainTaskWindow (taskId) or conflictResolution.explainAlternativesWindow
  //       (eventId) on the current state, with notBefore from now; changes nothing
  explainWindow(req: WindowRequest): Result<WindowExplanation> {
    const notBefore = notBeforeFor(this.deps.now());
    return 'taskId' in req
      ? explainTaskWindow(this.state, req, notBefore)
      : explainAlternativesWindow(this.state, req, notBefore);
  }

  // PRE:  req comes from the UI (checked by the pipeline)
  // POST: as replan.planReplan on the current state, passing raw now for diagnostics while the
  //       pipeline rounds placement's notBefore; a successful result
  //       becomes lastReplan, the only plan applyReplan accepts
  planReplan(req: { range: Interval; bufferMin?: number }): Result<ReplanResult> {
    const result = planReplan(this.state, req, this.deps.now());
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
  //       conflicts unchanged, barred warnings recomputed, §7.4.5); err InvalidInput / InvalidTime,
  //       StorageError when saving fails, or ConcurrentModification (ER8) when another tab saved
  //       first, leaving the state unchanged
  updateSettings(settings: Settings): Promise<Result<Snapshot>> {
    return this.run(async () => {
      const result = await updateSettings(this.context(), settings);
      if (!result.ok) return result;
      this.state = result.value;
      this.deps.onCommit?.();
      return ok(this.snapshot());
    });
  }

  // PRE:  request comes from outside
  // POST: queued, validated, undoable Keep here/Stop keeping change through the barred pipeline
  setBarredKept(request: BarredKeepRequest): Promise<Result<MutationResult>> {
    return this.mutate((context) => setBarredKept(context, request));
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
  // POST: returns categories, events, tasks and settings as pretty-printed v2 ExportFile JSON (§9.4),
  //       stamped with now
  exportData(): string {
    const { categories, events, tasks, settings } = this.state;
    const file: ExportFile = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: fromMinute(this.deps.now()).toISOString(),
      categories,
      events,
      tasks,
      settings,
    };
    return JSON.stringify(file, null, EXPORT_INDENT);
  }

  // PRE:  json is untrusted text (validated here)
  // POST: on a valid export, replaces everything stored and in memory with it (events sorted,
  //       conflicts detected, history and lastReplan cleared, version + 1, §7.4.6); err
  //       InvalidImport (ER6), StorageError or ConcurrentModification (ER8), leaving the state and
  //       the repository unchanged
  importData(json: string): Promise<Result<Snapshot>> {
    return this.run(async () => {
      const parsed = parseExportFile(json);
      if (!parsed.ok) {
        return parsed;
      }
      const { categories, events, tasks, settings } = parsed.value;
      try {
        await this.deps.repo.replaceAll(
          { categories: [...categories], events: [...events], tasks: [...tasks], settings },
          this.state.revision,
        );
      } catch (error) {
        return storageError(error);
      }
      const fresh = createState({ categories, events, tasks, settings }, this.state.revision + 1);
      this.state = { ...fresh, version: this.state.version + 1 };
      this.lastReplan = null;
      this.deps.onCommit?.();
      return ok(this.snapshot());
    });
  }
}

// PRE:  deps.repo is a Repository; deps.now returns the current Minute; deps.newId returns fresh ids
// POST: returns an Engine with empty state; the caller must await init() before using it
export function createEngine(deps: EngineDeps): Engine {
  return new CalendarEngine(deps);
}
