// The UI's single store (TECH_SPEC §11.1, zustand). It holds the engine's latest Snapshot (the only
// copy of domain data in the UI) plus view state, and turns engine results into toasts.

import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { SAMPLES, type SampleId } from '@/data/samples';
import type { Engine } from '@/engine';
import {
  DEFAULT_SETTINGS,
  EMPHASIS_MS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  IMPORT_SPINNER_THRESHOLD,
} from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import type { Result } from '@/shared/result';
import { parseExportFile } from '@/shared/schemas';
import { fromMinute, overlapsWorkingHours, startOfLocalWeek } from '@/shared/time';
import type {
  Conflict,
  BarredOverlap,
  EventInput,
  ExportFile,
  Interval,
  Minute,
  MutationResult,
  Priority,
  ReplanPlan,
  ReplanResult,
  Settings,
  Snapshot,
  SlotSearchResult,
  TaskInput,
  UserCriterion,
} from '@/shared/types';
import { errorMessage } from '../format/errors';
import { toDateInput } from '../forms/eventForm';
import {
  alternativeAppliedText,
  conflictText,
  createdText,
  DATA_CLEARED_TEXT,
  deletedText,
  FIXED_MOVE_BODY,
  fixedMoveQuestion,
  OTHER_TAB_UPDATED_TEXT,
  historyText,
  importedText,
  movedText,
  moveToLabel,
  droppedFromQueueText,
  planAppliedText,
  queueSummaryText,
  scheduledText,
  sampleLoadedText,
  SETTINGS_SAVED_TEXT,
  barredOverlapToastText,
  taskCreatedText,
  taskDeletedText,
  taskSavedText,
  unscheduledText,
  updatedText,
} from '../format/explain';
import type { PickerState } from './pickerSlice';
import { withoutToast, type Toast } from './toastSlice';

export type ViewType = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek';

export type Dialog =
  | null
  | { kind: 'event'; mode: 'create'; defaults: Partial<EventInput> }
  | { kind: 'event'; mode: 'edit'; id: string }
  | { kind: 'task'; mode: 'create' }
  | { kind: 'task'; mode: 'edit'; id: string }
  | { kind: 'replan' }
  | { kind: 'settings' }
  | { kind: 'shortcuts' }
  | {
      kind: 'confirm';
      title: string;
      body: string;
      confirmLabel: string;
      onConfirm: () => void;
      cancelLabel?: string; // default 'Cancel'
      onCancel?: () => void; // runs on the cancel button, Esc or close (WI-42)
    };

export interface AppActions {
  dismissToast(id: string): void;
  pushToast(toast: Omit<Toast, 'id'>): string;
  openDialog(dialog: Exclude<Dialog, null>): void;
  closeDialog(): void;
  createEvent(input: EventInput): Promise<Result<MutationResult>>;
  updateEvent(id: string, input: EventInput): Promise<Result<MutationResult>>;
  moveEvent(id: string, to: Interval): Promise<Result<MutationResult>>;
  dragEvent(id: string, to: Interval, revert: () => void): Promise<void>;
  deleteEvent(id: string): Promise<Result<MutationResult>>;
  setActiveRange(range: Interval): void;
  setView(type: ViewType, date: Minute): void;
  toggleEventPriority(priority: Priority): void;
  createTask(input: TaskInput): Promise<Result<MutationResult>>;
  updateTask(id: string, input: TaskInput): Promise<Result<MutationResult>>;
  deleteTask(id: string): Promise<Result<MutationResult>>;
  unscheduleTask(id: string): Promise<Result<MutationResult>>;
  setTaskPanel(change: Partial<AppState['taskPanel']>): void;
  toggleTaskSelection(id: string): void;
  openTaskPicker(taskIds: readonly string[]): void;
  openAlternatives(conflict: Conflict): void;
  openEventAlternatives(eventId: string): void;
  setPanelsOpen(open: boolean): void;
  viewBarredOverlaps(): void;
  computeReplan(range: Interval, bufferMin: number | undefined): Result<ReplanResult>;
  applyReplan(baseVersion: number, planId: ReplanPlan['id']): Promise<Result<MutationResult>>;
  pickerSelect(index: number): void;
  pickerSetCriterion(criterion: UserCriterion): void;
  pickerSetBuffer(bufferMin: number): void;
  pickerToggleTarget(): void;
  pickerSetWorkingHours(useWorkingHours: boolean): void;
  pickerApply(): Promise<void>;
  pickerSkip(): void;
  pickerStop(): void;
  undo(): Promise<Result<MutationResult>>;
  redo(): Promise<Result<MutationResult>>;
  applyAlternative(eventId: string, slot: Interval): Promise<Result<MutationResult>>;
  loadSample(id: SampleId): Promise<Result<Snapshot>>;
  updateSettings(settings: Settings): Promise<Result<Snapshot>>;
  exportFile(): { fileName: string; json: string };
  checkImport(json: string): boolean;
  importData(json: string): Promise<Result<Snapshot>>;
  clearAllData(): Promise<Result<Snapshot>>;
  retryInit(): Promise<void>;
  resetLocalData(): Promise<void>;
  reloadFromOtherTab(): Promise<void>;
}

export interface AppState {
  status: 'loading' | 'ready' | 'fatal';
  fatalError: EngineError | null;
  storageWarning: boolean;
  busy: string | null;
  snapshot: Snapshot;
  view: { type: ViewType; date: Minute; activeRange: Interval | null };
  eventPriorityFilter: Priority[];
  taskPanel: {
    sort: 'priority' | 'windowEnd';
    priorities: Priority[];
    status: 'unscheduled' | 'scheduled' | 'all';
    selectedIds: string[];
  };
  dialog: Dialog;
  picker: PickerState | null;
  emphasisIds: string[];
  panelsOpen: boolean;
  barredViewRequest: number;
  toasts: Toast[];
  actions: AppActions;
}

export interface AppStoreOptions {
  storageWarning: boolean; // the repository fell back to memory (degraded mode)
  init: Result<Snapshot>; // the result of engine.init() at bootstrap
  now: () => Minute;
  resetStorage: () => Promise<void>; // empties the repository, for the fatal screen's Reset
  initialView?: ViewType; // the view remembered from the last visit (default: week)
}

export type AppStore = StoreApi<AppState>;

const ALL_PRIORITIES: Priority[] = ['high', 'medium', 'low'];

// PRE:  conflict is an introduced conflict; changedIds are the ids the mutation changed
// POST: returns the conflict's two ids as [the changed one, the other one]
function subjectAndOther(conflict: Conflict, changedIds: readonly string[]): [string, string] {
  return changedIds.includes(conflict.bId)
    ? [conflict.bId, conflict.aId]
    : [conflict.aId, conflict.bId];
}

// PRE:  overlap is a derived barred warning
// POST: returns a collision-free identity for comparing settings warning records
function barredOverlapKey(overlap: BarredOverlap): string {
  return JSON.stringify([
    overlap.eventId,
    overlap.label,
    overlap.overlap.start,
    overlap.overlap.end,
  ]);
}

// PRE:  before/after are warning lists from successive settings snapshots
// POST: returns the count of distinct event IDs in records introduced by the settings save
function newlyWarnedEventCount(
  before: readonly BarredOverlap[],
  after: readonly BarredOverlap[],
): number {
  const previous = new Set(before.map(barredOverlapKey));
  return new Set(
    after
      .filter((warning) => !previous.has(barredOverlapKey(warning)))
      .map((warning) => warning.eventId),
  ).size;
}

// PRE:  dialog is the open dialog; snapshot is the data just reloaded from another tab's change
// POST: returns null when dialog edits an event or task that snapshot no longer has (its
//       component would render nothing, yet an open dialog blocks shortcuts), otherwise dialog
function dialogAfterReload(dialog: Dialog, snapshot: Snapshot): Dialog {
  if (dialog?.kind === 'event' && dialog.mode === 'edit') {
    return snapshot.events.some((event) => event.id === dialog.id) ? dialog : null;
  }
  if (dialog?.kind === 'task' && dialog.mode === 'edit') {
    return snapshot.tasks.some((task) => task.id === dialog.id) ? dialog : null;
  }
  return dialog;
}

// PRE:  engine is initialised (or failed to); options.init is its init result
// POST: returns a store over engine whose status, snapshot and storage banner reflect options
export function createAppStore(engine: Engine, options: AppStoreOptions): AppStore {
  let toastCount = 0;

  return createStore<AppState>((set, get) => {
    // PRE:  toast has no id
    // POST: appends it with a fresh id and returns that id
    function pushToast(toast: Omit<Toast, 'id'>): string {
      toastCount += 1;
      const id = `toast-${toastCount}`;
      set({ toasts: [...get().toasts, { ...toast, id }] });
      return id;
    }

    // PRE:  ids are event ids
    // POST: emphasises ids now and clears the emphasis after EMPHASIS_MS unless it changed meanwhile
    function emphasise(ids: readonly string[]): void {
      const emphasisIds = [...ids];
      set({ emphasisIds });
      setTimeout(() => {
        if (get().emphasisIds === emphasisIds) {
          set({ emphasisIds: [] });
        }
      }, EMPHASIS_MS);
    }

    // PRE:  error is an engine error; retry re-runs the failed command
    // POST: shows its toast; a StorageError toast is sticky and offers Retry (ER5); a StaleResult
    //       toast is a brief info (ER7)
    function showError(error: EngineError, retry: () => void): void {
      const isStorage = error.code === 'StorageError';
      pushToast({
        // ER7 is a brief notice: the picker recomputes its options at once.
        tone: error.code === 'StaleResult' ? 'info' : 'error',
        text: errorMessage(error),
        sticky: isStorage,
        actions: isStorage ? [{ label: 'Retry', run: retry }] : undefined,
      });
    }

    // PRE:  toast says why the view is refreshed
    // POST: adopts what the repository holds now (engine.reload: history cleared, version bumped),
    //       closes an edit dialog whose record is gone (dialogAfterReload) and shows toast; when
    //       reloading fails shows that error's toast, whose Retry reloads
    async function reloadStored(toast: Omit<Toast, 'id'>): Promise<void> {
      const result = await engine.reload();
      if (!result.ok) {
        showError(result.error, () => {
          void reloadStored(toast);
        });
        return;
      }
      set({ snapshot: result.value, dialog: dialogAfterReload(get().dialog, result.value) });
      pushToast(toast);
    }

    // PRE:  error is an engine error; retry re-runs the failed command
    // POST: for ER8 (another tab saved first) reloads the stored data and says nothing was
    //       overwritten, with no Retry since the command was based on an old view; otherwise as
    //       showError
    async function handleError(error: EngineError, retry: () => void): Promise<void> {
      if (error.code === 'ConcurrentModification') {
        await reloadStored({ tone: 'warning', text: errorMessage(error) });
        return;
      }
      showError(error, retry);
    }

    // PRE:  slot was suggested for eventId at snapshot version baseVersion (ER4); otherEventId is
    //       the event it conflicted with
    // POST: moves eventId to slot when nothing changed since baseVersion; when something did
    //       (StaleResult, ER7) the old slot is not applied and fresh alternatives open instead
    async function moveToSuggestion(
      eventId: string,
      otherEventId: string,
      slot: Interval,
      baseVersion: number,
    ): Promise<void> {
      const result = await runMutation(
        () => engine.applyAlternative({ eventId, slot, baseVersion }),
        (value) => alternativeAppliedText(slot, value.resolvedConflicts.length > 0),
      );
      if (!result.ok && result.error.code === 'StaleResult') {
        openAlternativePicker(eventId, otherEventId);
      }
    }

    // PRE:  value is a successful mutation with at least one introduced conflict
    // POST: shows the ER4 warning toast, with Move to … when there is a suggestion; that action
    //       is checked against the version the suggestion was computed for (AUDIT A03)
    function showConflict(value: MutationResult): void {
      const conflict = value.introducedConflicts[0] as Conflict;
      const [subjectId, otherId] = subjectAndOther(conflict, value.changedEventIds);
      const other = value.snapshot.events.find((event) => event.id === otherId);
      const { overlap, minutes } = conflict;
      const suggestion = value.suggestion;
      const moveAction =
        suggestion === null
          ? []
          : [
              {
                label: moveToLabel(suggestion.slot),
                run: () => {
                  void moveToSuggestion(
                    subjectId,
                    otherId,
                    suggestion.slot,
                    value.snapshot.version,
                  );
                },
              },
            ];
      pushToast({
        tone: 'warning',
        text: conflictText(other?.title ?? otherId, overlap, minutes),
        actions: [
          ...moveAction,
          { label: 'View conflict', run: () => emphasise([subjectId, otherId]) },
        ],
      });
    }

    // PRE:  command calls one engine mutation; describe gives its success text (null = no toast)
    // POST: runs command; on ok adopts the snapshot, emphasises the changed events and shows the
    //       success (or ER4) toast; on err handles the error (handleError); returns the result
    async function runMutation(
      command: () => Promise<Result<MutationResult>>,
      describe: (value: MutationResult) => string | null,
    ): Promise<Result<MutationResult>> {
      const result = await command();
      if (!result.ok) {
        await handleError(result.error, () => {
          void runMutation(command, describe);
        });
        return result;
      }
      set({ snapshot: result.value.snapshot });
      emphasise(result.value.changedEventIds);
      if (result.value.introducedConflicts.length > 0) {
        showConflict(result.value);
        return result;
      }
      const text = describe(result.value);
      if (text !== null) {
        pushToast({ tone: 'success', text });
      }
      return result;
    }

    // PRE:  value is a successful mutation; id is a task id
    // POST: returns that task's name in the new snapshot ('' if it is gone)
    function taskNameIn(value: MutationResult, id: string): string {
      return value.snapshot.tasks.find((task) => task.id === id)?.name ?? '';
    }

    // PRE:  value is a successful mutation; id is an event id
    // POST: returns that event's title in the new snapshot ('' if it is gone)
    function titleIn(value: MutationResult, id: string): string {
      return value.snapshot.events.find((event) => event.id === id)?.title ?? '';
    }

    // PRE:  picker is a picker state
    // POST: returns a fresh search for its current subject, criterion and buffer
    function searchFor(picker: PickerState): Result<SlotSearchResult> {
      if (picker.mode === 'task') {
        return engine.findSlots({
          taskId: picker.queue[picker.index] ?? '',
          criterion: picker.criterion,
          bufferMin: picker.bufferMin,
        });
      }
      return engine.suggestAlternatives({
        eventId: picker.eventId,
        otherEventId: picker.otherEventId ?? undefined,
        bufferMin: picker.bufferMin,
        useWorkingHours: picker.useWorkingHours,
      });
    }

    // PRE:  picker is the picker state to show
    // POST: shows picker with a fresh search and the first option selected
    function refresh(picker: PickerState): void {
      set({ picker: { ...picker, result: searchFor(picker), selected: 0 } });
    }

    // PRE:  picker is a task picker whose counts include the task just handled
    // POST: moves to the next task in the queue and searches for it, or, after the last one,
    //       closes the picker with the summary toast
    function advance(picker: Extract<PickerState, { mode: 'task' }>): void {
      const index = picker.index + 1;
      if (index >= picker.queue.length) {
        set({ picker: null });
        pushToast({
          tone: 'success',
          text: queueSummaryText(picker.scheduled, picker.queue.length, picker.skipped),
        });
        return;
      }
      refresh({ ...picker, index });
    }

    // PRE:  buildJson supplies export text (validated by the engine); describe gives its success
    //       message; busy is the loading message, or null for an instant operation
    // POST: optionally paints loading feedback before building/importing data; on ok adopts the snapshot, closes the picker,
    //       clears the task selection (both may name records that are gone) and shows describe's
    //       toast; on err handles the error (handleError) and changes nothing; returns the result
    async function replaceAll(
      buildJson: () => string,
      describe: (snapshot: Snapshot) => string,
      busy: string | null = null,
    ): Promise<Result<Snapshot>> {
      set({ busy });
      if (busy !== null) {
        await new Promise<void>((resolve) => {
          // The extra task after the frame lets the browser paint before sample generation.
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => setTimeout(resolve, 0));
          } else {
            setTimeout(resolve, 0);
          }
        });
      }
      let result: Result<Snapshot>;
      try {
        result = await engine.importData(buildJson());
      } finally {
        set({ busy: null });
      }
      if (!result.ok) {
        await handleError(result.error, () => {
          void replaceAll(buildJson, describe, busy);
        });
        return result;
      }
      set({
        snapshot: result.value,
        picker: null,
        taskPanel: { ...get().taskPanel, selectedIds: [] },
      });
      pushToast({ tone: 'success', text: describe(result.value) });
      return result;
    }

    // PRE:  eventId names the event to search; otherEventId is the optional conflict counterpart
    // POST: opens the existing alternatives picker and refreshes via engine.suggestAlternatives;
    //       it searches working hours only, unless the event lies outside working hours or on a
    //       non-working day, where it searches any time (WI-41)
    function openAlternativePicker(eventId: string, otherEventId: string | null): void {
      const { settings, events } = get().snapshot;
      const event = events.find((candidate) => candidate.id === eventId);
      set({ dialog: null });
      refresh({
        mode: 'alternatives',
        eventId,
        otherEventId,
        bufferMin: settings.bufferMin,
        useWorkingHours: event === undefined || overlapsWorkingHours(event, settings),
        result: { ok: false, error: { code: 'StaleResult' } },
        selected: 0,
      });
    }

    const actions: AppActions = {
      // PRE:  open is the desired drawer state
      // POST: the panels drawer state is open
      setPanelsOpen(open) {
        set({ panelsOpen: open });
      },

      // PRE:  none
      // POST: opens panels and requests focus/scroll to their barred-warning section
      viewBarredOverlaps() {
        set({ panelsOpen: true, barredViewRequest: get().barredViewRequest + 1 });
      },
      // PRE:  id is any string
      // POST: removes that toast if present
      dismissToast(id) {
        set({ toasts: withoutToast(get().toasts, id) });
      },

      // PRE:  toast has no id
      // POST: shows it and returns its new id
      pushToast,

      // PRE:  dialog is a dialog descriptor
      // POST: dialog is the open dialog (replacing any other)
      openDialog(dialog) {
        set({ dialog });
      },

      // PRE:  none
      // POST: no dialog is open
      closeDialog() {
        set({ dialog: null });
      },

      // PRE:  input comes from the event dialog (validated by the engine)
      // POST: creates the event through runMutation; the toast reads 'Event created: "<title>".'
      createEvent(input) {
        return runMutation(
          () => engine.createEvent(input),
          (value) => createdText(titleIn(value, value.changedEventIds[0] ?? '')),
        );
      },

      // PRE:  input comes from the event dialog (validated by the engine)
      // POST: saves the edit through runMutation
      updateEvent(id, input) {
        return runMutation(
          () => engine.updateEvent(id, input),
          (value) => updatedText(titleIn(value, id)),
        );
      },

      // PRE:  to comes from a drag or resize
      // POST: moves the event through runMutation; the toast names where it went
      moveEvent(id, to) {
        return runMutation(
          () => engine.moveEvent(id, to),
          (value) => movedText(titleIn(value, id), to),
        );
      },

      // PRE:  to comes from a calendar drag or resize of event id; revert puts the block back
      // POST: a fixed event asks first (WI-42, report #1): "<title> is fixed. Move it anyway?"
      //       Move moves it through moveEvent, Keep it / Esc / close only revert (nothing written,
      //       no history); any other event moves at once. A move the engine refuses reverts too
      async dragEvent(id, to, revert) {
        // PRE:  none
        // POST: moves the event through moveEvent and reverts the block when that fails
        async function moveOrRevert(): Promise<void> {
          const result = await actions.moveEvent(id, to);
          if (!result.ok) {
            revert();
          }
        }

        const event = get().snapshot.events.find((candidate) => candidate.id === id);
        if (event === undefined || event.flexible) {
          await moveOrRevert();
          return;
        }
        set({
          dialog: {
            kind: 'confirm',
            title: fixedMoveQuestion(event.title),
            body: FIXED_MOVE_BODY,
            confirmLabel: 'Move',
            cancelLabel: 'Keep it',
            onConfirm: () => {
              void moveOrRevert();
            },
            onCancel: revert,
          },
        });
      },

      // PRE:  id is any string
      // POST: deletes the event through runMutation (its task, if any, becomes unscheduled)
      deleteEvent(id) {
        const title = get().snapshot.events.find((event) => event.id === id)?.title ?? '';
        return runMutation(
          () => engine.deleteEvent(id),
          () => deletedText(title),
        );
      },

      // PRE:  range is the interval FullCalendar currently shows
      // POST: view.activeRange is range
      setActiveRange(range) {
        set({ view: { ...get().view, activeRange: range } });
      },

      // PRE:  type is the view FullCalendar shows; date is the start of the period it shows
      // POST: view.type is type and view.date is date
      setView(type, date) {
        set({ view: { ...get().view, type, date } });
      },

      // PRE:  priority is a priority
      // POST: the calendar's priority filter (FR6) shows priority if it was hidden, and hides it if
      //       it was shown; the filter keeps the order high, medium, low
      toggleEventPriority(priority) {
        const shown = get().eventPriorityFilter;
        set({
          eventPriorityFilter: ALL_PRIORITIES.filter((candidate) =>
            candidate === priority ? !shown.includes(candidate) : shown.includes(candidate),
          ),
        });
      },

      // PRE:  input comes from the task dialog (validated by the engine)
      // POST: creates the task through runMutation
      createTask(input) {
        return runMutation(
          () => engine.createTask(input),
          (value) => taskCreatedText(value.snapshot.tasks.at(-1)?.name ?? input.name),
        );
      },

      // PRE:  input comes from the task dialog (validated by the engine)
      // POST: saves the task (and its event, if scheduled) through runMutation
      updateTask(id, input) {
        return runMutation(
          () => engine.updateTask(id, input),
          (value) => taskSavedText(taskNameIn(value, id)),
        );
      },

      // PRE:  id is any string
      // POST: deletes the task (and its event, if scheduled) through runMutation
      deleteTask(id) {
        const name = get().snapshot.tasks.find((task) => task.id === id)?.name ?? '';
        return runMutation(
          () => engine.deleteTask(id),
          () => taskDeletedText(name),
        );
      },

      // PRE:  id is any string
      // POST: unschedules the task through runMutation; no toast when it was not scheduled
      unscheduleTask(id) {
        return runMutation(
          () => engine.unscheduleTask(id),
          (value) => (value.label === '' ? null : unscheduledText(taskNameIn(value, id))),
        );
      },

      // PRE:  change holds any subset of the task panel state
      // POST: the task panel state has change applied
      setTaskPanel(change) {
        set({ taskPanel: { ...get().taskPanel, ...change } });
      },

      // PRE:  id is a task id
      // POST: adds id to the panel's selection, or removes it when it was selected
      toggleTaskSelection(id) {
        const { taskPanel } = get();
        const selectedIds = taskPanel.selectedIds.includes(id)
          ? taskPanel.selectedIds.filter((selected) => selected !== id)
          : [...taskPanel.selectedIds, id];
        set({ taskPanel: { ...taskPanel, selectedIds } });
      },

      // PRE:  taskIds are the tasks to schedule, in any order
      // POST: queues the unscheduled ones in BR-11 order (an info toast names any left out) and
      //       opens the task picker on the first, with the settings' criterion and buffer; closes
      //       any dialog; does nothing more when no task is left to schedule
      openTaskPicker(taskIds) {
        const queue = engine.orderForScheduling(taskIds);
        const dropped = new Set(taskIds).size - queue.length;
        if (dropped > 0) {
          pushToast({ tone: 'info', text: droppedFromQueueText(dropped) });
        }
        const first = queue[0];
        if (first === undefined) {
          return;
        }
        const { defaultCriterion, bufferMin } = get().snapshot.settings;
        set({
          dialog: null,
          picker: {
            mode: 'task',
            queue,
            index: 0,
            criterion: defaultCriterion,
            bufferMin,
            result: engine.findSlots({ taskId: first, criterion: defaultCriterion, bufferMin }),
            selected: 0,
            scheduled: 0,
            skipped: 0,
          },
        });
      },

      // PRE:  conflict is one of the snapshot's conflicts
      // POST: opens the alternatives picker for the event BR-10 suggests moving, with the other
      //       event as the toggle and the settings buffer (FR7)
      openAlternatives(conflict) {
        const otherEventId = conflict.targetId === conflict.aId ? conflict.bId : conflict.aId;
        openAlternativePicker(conflict.targetId, otherEventId);
      },

      // PRE:  eventId names a snapshot event requiring alternatives (barred overlap or Replan diagnostic)
      // POST: searches that event through the existing alternatives picker, with no target toggle
      openEventAlternatives(eventId) {
        openAlternativePicker(eventId, null);
      },

      // PRE:  range and bufferMin come from the replan dialog (validated by the engine)
      // POST: returns both replan plans for range (FR10); the engine keeps them for applyReplan
      computeReplan(range, bufferMin) {
        return engine.planReplan({ range, bufferMin });
      },

      // PRE:  baseVersion and planId come from the plans computeReplan returned
      // POST: moves the plan's events through runMutation (one undo step); the toast reads
      //       "Plan applied: N events moved"
      applyReplan(baseVersion, planId) {
        return runMutation(
          () => engine.applyReplan({ baseVersion, planId }),
          (value) => planAppliedText(value.changedEventIds.length),
        );
      },

      // PRE:  index is an option index
      // POST: that option is selected
      pickerSelect(index) {
        const { picker } = get();
        if (picker !== null) {
          set({ picker: { ...picker, selected: index } });
        }
      },

      // PRE:  criterion is a user criterion
      // POST: the task picker ranks by criterion (its search re-runs)
      pickerSetCriterion(criterion) {
        const { picker } = get();
        if (picker?.mode === 'task') {
          refresh({ ...picker, criterion });
        }
      },

      // PRE:  bufferMin comes from the picker's buffer field (validated by the engine)
      // POST: the picker searches with bufferMin (an invalid value shows as the search error)
      pickerSetBuffer(bufferMin) {
        const { picker } = get();
        if (picker !== null) {
          refresh({ ...picker, bufferMin });
        }
      },

      // PRE:  none
      // POST: an alternatives picker searches working hours only (true) or any time (false); its
      //       search re-runs. The choice is kept when the target is toggled
      pickerSetWorkingHours(useWorkingHours) {
        const { picker } = get();
        if (picker?.mode === 'alternatives') {
          refresh({ ...picker, useWorkingHours });
        }
      },

      // PRE:  none
      // POST: an alternatives picker with an other event swaps which of the two is moved
      pickerToggleTarget() {
        const { picker } = get();
        if (picker?.mode === 'alternatives' && picker.otherEventId !== null) {
          refresh({ ...picker, eventId: picker.otherEventId, otherEventId: picker.eventId });
        }
      },

      // PRE:  none
      // POST: applies the selected option through runMutation against the search's version: a task
      //       picker schedules and moves on; an alternatives picker moves the event and closes; on
      //       StaleResult (ER7) the search re-runs; other errors keep the picker as it is
      async pickerApply() {
        const picker = get().picker;
        if (picker === null || !picker.result.ok) {
          return;
        }
        const option = picker.result.value.options[picker.selected];
        if (option === undefined) {
          return;
        }
        const baseVersion = picker.result.value.baseVersion;
        const result =
          picker.mode === 'task'
            ? await runMutation(
                () =>
                  engine.scheduleTask({
                    taskId: picker.queue[picker.index] ?? '',
                    slot: option.slot,
                    baseVersion,
                  }),
                () => scheduledText(option.slot),
              )
            : await runMutation(
                () =>
                  engine.applyAlternative({
                    eventId: picker.eventId,
                    slot: option.slot,
                    baseVersion,
                  }),
                (value) => alternativeAppliedText(option.slot, value.resolvedConflicts.length > 0),
              );
        const current = get().picker;
        if (current === null) {
          return;
        }
        if (!result.ok) {
          if (result.error.code === 'StaleResult') {
            refresh(current);
          }
          return;
        }
        if (current.mode === 'task') {
          advance({ ...current, scheduled: current.scheduled + 1 });
        } else {
          set({ picker: null });
        }
      },

      // PRE:  none
      // POST: a task picker counts the current task as skipped and moves on
      pickerSkip() {
        const { picker } = get();
        if (picker?.mode === 'task') {
          advance({ ...picker, skipped: picker.skipped + 1 });
        }
      },

      // PRE:  none
      // POST: closes the picker; a task picker first shows its summary toast
      pickerStop() {
        const { picker } = get();
        set({ picker: null });
        if (picker?.mode === 'task') {
          pushToast({
            tone: 'success',
            text: queueSummaryText(picker.scheduled, picker.queue.length, picker.skipped),
          });
        }
      },

      // PRE:  none
      // POST: undoes the newest change through runMutation; the toast reads "Undid: <label>" (B1)
      undo() {
        return runMutation(
          () => engine.undo(),
          (value) => historyText('Undid', value.label),
        );
      },

      // PRE:  none
      // POST: redoes the newest undone change; the toast reads "Redid: <label>"
      redo() {
        return runMutation(
          () => engine.redo(),
          (value) => historyText('Redid', value.label),
        );
      },

      // PRE:  slot is an option of the current alternatives picker
      // POST: moves eventId to slot through runMutation, against the current version
      applyAlternative(eventId, slot) {
        return runMutation(
          () => engine.applyAlternative({ eventId, slot, baseVersion: get().snapshot.version }),
          (value) => alternativeAppliedText(slot, value.resolvedConflicts.length > 0),
        );
      },

      // PRE:  id names a sample
      // POST: replaces all data with that sample built for the current week; shows a toast
      loadSample(id) {
        const sample = SAMPLES[id];
        return replaceAll(
          () => JSON.stringify(sample.build(startOfLocalWeek(options.now()))),
          () => sampleLoadedText(sample.label),
          'Loading sample calendar…',
        );
      },

      // PRE:  settings come from the settings dialog (validated by the engine)
      // POST: saves them (not undoable, FR11); on ok adopts the snapshot and toasts "Settings
      //       saved." plus info/View for newly introduced barred warnings; on err handles the
      //       error (handleError) and keeps the old settings
      async updateSettings(settings) {
        const previous = get().snapshot.barredOverlaps;
        const result = await engine.updateSettings(settings);
        if (!result.ok) {
          await handleError(result.error, () => {
            void actions.updateSettings(settings);
          });
          return result;
        }
        set({ snapshot: result.value });
        pushToast({ tone: 'success', text: SETTINGS_SAVED_TEXT });
        const count = newlyWarnedEventCount(previous, result.value.barredOverlaps);
        if (count > 0) {
          pushToast({
            tone: 'info',
            text: barredOverlapToastText(count),
            actions: [{ label: 'View', run: actions.viewBarredOverlaps }],
          });
        }
        return result;
      },

      // PRE:  none
      // POST: returns the export JSON and its file name, calendar-export-YYYY-MM-DD.json (local
      //       date of now, B2)
      exportFile() {
        return {
          fileName: `calendar-export-${toDateInput(options.now())}.json`,
          json: engine.exportData(),
        };
      },

      // PRE:  json is the text of a chosen file (untrusted)
      // POST: returns whether it is a valid export (ER6); when it is not, shows the ER6 toast
      checkImport(json) {
        const parsed = parseExportFile(json);
        if (!parsed.ok) {
          showError(parsed.error, () => undefined);
        }
        return parsed.ok;
      },

      // PRE:  json is the text of a chosen file (validated by the engine)
      // POST: replaces all data with it through replaceAll; the toast says how many events and
      //       tasks came in
      importData(json) {
        const parsed = parseExportFile(json);
        const count = parsed.ok ? parsed.value.events.length + parsed.value.tasks.length : 0;
        return replaceAll(
          () => json,
          (snapshot) => importedText(snapshot.events.length, snapshot.tasks.length),
          count > IMPORT_SPINNER_THRESHOLD ? 'Importing calendar…' : null,
        );
      },

      // PRE:  none
      // POST: replaces all data with an empty calendar and the default settings through
      //       replaceAll (it clears the undo history, like any import)
      clearAllData() {
        const empty: ExportFile = {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt: fromMinute(options.now()).toISOString(),
          events: [],
          tasks: [],
          settings: DEFAULT_SETTINGS,
        };
        return replaceAll(
          () => JSON.stringify(empty),
          () => DATA_CLEARED_TEXT,
        );
      },

      // PRE:  none
      // POST: runs engine.init() again; ready with its snapshot on success, fatal otherwise
      async retryInit() {
        set({ status: 'loading' });
        const init = await engine.init();
        set(
          init.ok
            ? { status: 'ready', fatalError: null, snapshot: init.value }
            : { status: 'fatal', fatalError: init.error },
        );
      },

      // PRE:  none
      // POST: empties the repository and retries init; a failure leaves the fatal screen up
      async resetLocalData() {
        try {
          await options.resetStorage();
        } catch {
          set({ status: 'fatal' });
          return;
        }
        await actions.retryInit();
      },

      // PRE:  another tab stored a change (TAB_CHANNEL_NAME message)
      // POST: adopts the stored data through reloadStored, with the info toast "Calendar updated in
      //       another tab."; open pickers and plans are now stale (ER7) and undo / redo are empty
      reloadFromOtherTab() {
        return reloadStored({ tone: 'info', text: OTHER_TAB_UPDATED_TEXT });
      },
    };

    const now = options.now();
    return {
      status: options.init.ok ? 'ready' : 'fatal',
      fatalError: options.init.ok ? null : options.init.error,
      storageWarning: options.storageWarning,
      busy: null,
      snapshot: options.init.ok ? options.init.value : engine.snapshot(),
      view: { type: options.initialView ?? 'timeGridWeek', date: now, activeRange: null },
      eventPriorityFilter: [...ALL_PRIORITIES],
      taskPanel: {
        sort: 'priority',
        priorities: [...ALL_PRIORITIES],
        status: 'unscheduled',
        selectedIds: [],
      },
      dialog: null,
      picker: null,
      emphasisIds: [],
      panelsOpen: false,
      barredViewRequest: 0,
      toasts: [],
      actions,
    };
  });
}

const StoreContext = createContext<AppStore | null>(null);

// PRE:  store comes from createAppStore; children are React nodes
// POST: makes store available to useAppStore in children
export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children);
}

// PRE:  called in a React component
// POST: returns the provided store API without subscribing; throws if StoreProvider is missing
export function useAppStoreApi(): AppStore {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useAppStore must be used inside StoreProvider');
  }
  return store;
}

// PRE:  called in a component under StoreProvider; selector reads part of AppState
// POST: returns selector(state) and re-renders the component when that part changes
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(useAppStoreApi(), selector);
}
