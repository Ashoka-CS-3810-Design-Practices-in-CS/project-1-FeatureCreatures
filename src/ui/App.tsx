import type FullCalendar from '@fullcalendar/react';
import { useRef } from 'react';
import { CalendarView } from './components/CalendarView/CalendarView';
import { ConfirmDialog } from './components/ConfirmDialog/ConfirmDialog';
import { BusyOverlay } from './components/BusyOverlay/BusyOverlay';
import { EmptyState } from './components/EmptyState/EmptyState';
import { EventDialog } from './components/EventDialog/EventDialog';
import { ReplanDialog } from './components/ReplanDialog/ReplanDialog';
import { SettingsDialog } from './components/SettingsDialog/SettingsDialog';
import { ShortcutHelp } from './components/ShortcutHelp/ShortcutHelp';
import { SlotPicker } from './components/SlotPicker/SlotPicker';
import { TaskDialog } from './components/TaskDialog/TaskDialog';
import { SidePanel } from './components/SidePanel/SidePanel';
import { Toasts } from './components/Toasts/Toasts';
import { Toolbar } from './components/Toolbar/Toolbar';
import { errorMessage } from './format/errors';
import { eventCountText } from './format/explain';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { useNarrowLayout } from './hooks/useNarrowLayout';
import { useAppStore } from './store/appStore';
import styles from './App.module.css';

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

// PRE:  rendered under StoreProvider; reads status, storageWarning, snapshot, eventPriorityFilter
//       and panelsOpen;
//       uses setPanelsOpen to control the responsive drawer
//       + additional props from: Toolbar, EmptyState, CalendarView, SidePanel, BusyOverlay,
//       EventDialog, TaskDialog, ReplanDialog, SettingsDialog, ShortcutHelp, ConfirmDialog,
//       SlotPicker, Toasts, FatalScreen
// POST: applies the theme and listens for shortcuts (B3, B4); shows the loading line, the fatal
//       screen, or the app: the degraded-mode banner when storage is unavailable, the toolbar, the
//       empty state on a blank calendar, the status line (events the priority filter shows, and
//       how many it hides; conflicts always count every event, FR6), the calendar, the task and conflict
//       panels, the open dialog, the picker and the toasts
export function App() {
  const calendarRef = useRef<FullCalendar>(null);
  const narrow = useNarrowLayout();
  const drawerOpen = useAppStore((state) => state.panelsOpen);
  const setPanelsOpen = useAppStore((state) => state.actions.setPanelsOpen);
  const { theme, cycleTheme } = useTheme();
  useShortcuts(calendarRef);
  const status = useAppStore((state) => state.status);
  const storageWarning = useAppStore((state) => state.storageWarning);
  const snapshot = useAppStore((state) => state.snapshot);
  const filter = useAppStore((state) => state.eventPriorityFilter);

  if (status === 'loading') {
    return <p role="status">Loading your calendar…</p>;
  }
  if (status === 'fatal') {
    return <FatalScreen />;
  }

  const isEmpty = snapshot.events.length === 0 && snapshot.tasks.length === 0;
  const visibleCount = snapshot.events.filter((event) => filter.includes(event.priority)).length;
  return (
    <div className={`app ${styles.app}`}>
      {storageWarning && (
        <p role="alert" className="banner">
          Storage unavailable: changes will be lost when you close this tab.
        </p>
      )}
      <header>
        <h1>Interactive Calendar</h1>
        <Toolbar
          calendarRef={calendarRef}
          theme={theme}
          onCycleTheme={cycleTheme}
          panelsOpen={narrow && drawerOpen}
          onOpenPanels={narrow ? () => setPanelsOpen(true) : undefined}
        />
      </header>
      <main>
        {isEmpty && <EmptyState />}
        <p className="status-line">
          {eventCountText(visibleCount, snapshot.events.length - visibleCount)} ·{' '}
          {countOf(snapshot.tasks.length, 'task')} ·{' '}
          {countOf(snapshot.conflicts.length, 'conflict')}
        </p>
        <CalendarView calendarRef={calendarRef} />
      </main>
      <SidePanel narrow={narrow} open={drawerOpen} onClose={() => setPanelsOpen(false)} />
      <EventDialog />
      <TaskDialog />
      <ReplanDialog />
      <SettingsDialog />
      <ShortcutHelp />
      <ConfirmDialog />
      <SlotPicker />
      <Toasts />
      <BusyOverlay />
    </div>
  );
}
