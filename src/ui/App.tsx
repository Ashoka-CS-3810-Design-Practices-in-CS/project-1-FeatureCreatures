import { CalendarView } from './components/CalendarView/CalendarView';
import { ConfirmDialog } from './components/ConfirmDialog/ConfirmDialog';
import { EmptyState } from './components/EmptyState/EmptyState';
import { EventDialog } from './components/EventDialog/EventDialog';
import { TaskDialog } from './components/TaskDialog/TaskDialog';
import { TaskPanel } from './components/TaskPanel/TaskPanel';
import { Toasts } from './components/Toasts/Toasts';
import { errorMessage } from './format/errors';
import { useAppStore } from './store/appStore';

// PRE:  count ≥ 0; noun is singular
// POST: returns "1 event" / "3 events"
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// PRE:  rendered under StoreProvider; reads fatalError, uses actions.retryInit / resetLocalData
// POST: explains that the saved data could not be opened and offers Retry and Reset local data
function FatalScreen() {
  const fatalError = useAppStore((state) => state.fatalError);
  const { retryInit, resetLocalData } = useAppStore((state) => state.actions);

  return (
    <main>
      <h1>The calendar could not start</h1>
      <p>{fatalError === null ? 'Something went wrong.' : errorMessage(fatalError)}</p>
      <p>Retry, or reset the data saved in this browser and start empty.</p>
      <button type="button" onClick={() => void retryInit()}>
        Retry
      </button>
      <button type="button" onClick={() => void resetLocalData()}>
        Reset local data
      </button>
    </main>
  );
}

// PRE:  rendered under StoreProvider; reads status, storageWarning and snapshot
//       + additional props from: EmptyState, CalendarView, TaskPanel, EventDialog, TaskDialog,
//       ConfirmDialog, Toasts, FatalScreen
// POST: shows the loading line, the fatal screen, or the app: the degraded-mode banner when
//       storage is unavailable, the empty state on a blank calendar, the status line, the
//       calendar, the task panel, the open dialog and the toasts
export function App() {
  const status = useAppStore((state) => state.status);
  const storageWarning = useAppStore((state) => state.storageWarning);
  const snapshot = useAppStore((state) => state.snapshot);

  if (status === 'loading') {
    return <p role="status">Loading your calendar…</p>;
  }
  if (status === 'fatal') {
    return <FatalScreen />;
  }

  const isEmpty = snapshot.events.length === 0 && snapshot.tasks.length === 0;
  return (
    <div className="app">
      {storageWarning && (
        <p role="alert" className="banner">
          Storage unavailable: changes will be lost when you close this tab.
        </p>
      )}
      <header>
        <h1>Interactive Calendar</h1>
      </header>
      <main>
        {isEmpty && <EmptyState />}
        {/* Status line; the conflict panel (WI-21) will list the conflicts themselves. */}
        <p className="status-line">
          {countOf(snapshot.events.length, 'event')} · {countOf(snapshot.tasks.length, 'task')} ·{' '}
          {countOf(snapshot.conflicts.length, 'conflict')}
        </p>
        <CalendarView />
      </main>
      <aside>
        <TaskPanel />
      </aside>
      <EventDialog />
      <TaskDialog />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
