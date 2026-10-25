// The UI's single store (TECH_SPEC §11.1, zustand). It holds the engine's latest Snapshot (the only
// copy of domain data in the UI) plus view state, and turns engine results into toasts.

import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { SAMPLES, type SampleId } from '@/data/samples';
import type { Engine } from '@/engine';
import { EMPHASIS_MS } from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import type { Result } from '@/shared/result';
import { startOfLocalWeek } from '@/shared/time';
import type {
  Conflict,
  EventInput,
  Interval,
  Minute,
  MutationResult,
  Priority,
  Snapshot,
} from '@/shared/types';
import { errorMessage } from '../format/errors';
import { fmtDuration, fmtRange, fmtTime } from '../format/time';
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
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; onConfirm: () => void };

export interface AppActions {
  dismissToast(id: string): void;
  pushToast(toast: Omit<Toast, 'id'>): string;
  openDialog(dialog: Exclude<Dialog, null>): void;
  closeDialog(): void;
  undo(): Promise<Result<MutationResult>>;
  redo(): Promise<Result<MutationResult>>;
  applyAlternative(eventId: string, slot: Interval): Promise<Result<MutationResult>>;
  loadSample(id: SampleId): Promise<Result<Snapshot>>;
  retryInit(): Promise<void>;
  resetLocalData(): Promise<void>;
}

export interface AppState {
  status: 'loading' | 'ready' | 'fatal';
  fatalError: EngineError | null;
  storageWarning: boolean;
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
  toasts: Toast[];
  actions: AppActions;
}

export interface AppStoreOptions {
  storageWarning: boolean; // the repository fell back to memory (degraded mode)
  init: Result<Snapshot>; // the result of engine.init() at bootstrap
  now: () => Minute;
  resetStorage: () => Promise<void>; // empties the repository, for the fatal screen's Reset
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
    // POST: shows its toast; a StorageError toast is sticky and offers Retry (ER5)
    function showError(error: EngineError, retry: () => void): void {
      const isStorage = error.code === 'StorageError';
      pushToast({
        tone: 'error',
        text: errorMessage(error),
        sticky: isStorage,
        actions: isStorage ? [{ label: 'Retry', run: retry }] : undefined,
      });
    }

    // PRE:  value is a successful mutation with at least one introduced conflict
    // POST: shows the ER4 warning toast, with Move to … when there is a suggestion
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
                label: `Move to ${fmtRange(suggestion.slot)}`,
                run: () => {
                  void actions.applyAlternative(subjectId, suggestion.slot);
                },
              },
            ];
      pushToast({
        tone: 'warning',
        text: `Saved with a conflict: overlaps "${other?.title ?? otherId}" ${fmtTime(overlap.start)}–${fmtTime(overlap.end)} (${fmtDuration(minutes)}).`,
        actions: [
          ...moveAction,
          { label: 'View conflict', run: () => emphasise([subjectId, otherId]) },
        ],
      });
    }

    // PRE:  command calls one engine mutation; describe gives its success text (null = no toast)
    // POST: runs command; on ok adopts the snapshot, emphasises the changed events and shows the
    //       success (or ER4) toast; on err shows the error toast; returns the result either way
    async function runMutation(
      command: () => Promise<Result<MutationResult>>,
      describe: (value: MutationResult) => string | null,
    ): Promise<Result<MutationResult>> {
      const result = await command();
      if (!result.ok) {
        showError(result.error, () => {
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

    // PRE:  verb is 'Undid' or 'Redid'; idle is the info text when there was nothing to do
    // POST: returns the describe function for an undo / redo result
    function historyText(verb: string, idle: string): (value: MutationResult) => string {
      return (value) => (value.label === '' ? idle : `${verb}: ${value.label}`);
    }

    const actions: AppActions = {
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

      // PRE:  none
      // POST: undoes the newest change through runMutation; the toast reads "Undid: <label>" (B1)
      undo() {
        return runMutation(() => engine.undo(), historyText('Undid', 'Nothing to undo.'));
      },

      // PRE:  none
      // POST: redoes the newest undone change; the toast reads "Redid: <label>"
      redo() {
        return runMutation(() => engine.redo(), historyText('Redid', 'Nothing to redo.'));
      },

      // PRE:  slot is an option of the current alternatives (or the ER4 suggestion)
      // POST: moves eventId to slot through runMutation, against the current version
      applyAlternative(eventId, slot) {
        return runMutation(
          () => engine.applyAlternative({ eventId, slot, baseVersion: get().snapshot.version }),
          (value) =>
            `Moved to ${fmtRange(slot)}${value.resolvedConflicts.length > 0 ? ' — conflict resolved' : ''}.`,
        );
      },

      // PRE:  id names a sample
      // POST: replaces all data with that sample built for the current week; shows a toast
      async loadSample(id) {
        const sample = SAMPLES[id];
        const result = await engine.importData(
          JSON.stringify(sample.build(startOfLocalWeek(options.now()))),
        );
        if (!result.ok) {
          pushToast({ tone: 'error', text: errorMessage(result.error) });
          return result;
        }
        set({ snapshot: result.value });
        pushToast({ tone: 'success', text: `Loaded sample: ${sample.label}.` });
        return result;
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
    };

    const now = options.now();
    return {
      status: options.init.ok ? 'ready' : 'fatal',
      fatalError: options.init.ok ? null : options.init.error,
      storageWarning: options.storageWarning,
      snapshot: options.init.ok ? options.init.value : engine.snapshot(),
      view: { type: 'timeGridWeek', date: now, activeRange: null },
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

// PRE:  called in a component under StoreProvider; selector reads part of AppState
// POST: returns selector(state) and re-renders the component when that part changes
export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useAppStore must be used inside StoreProvider');
  }
  return useStore(store, selector);
}
