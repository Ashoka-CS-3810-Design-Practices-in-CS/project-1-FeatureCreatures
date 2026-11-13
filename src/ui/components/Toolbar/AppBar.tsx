import type { ThemeChoice } from '../../hooks/useTheme';
import type { ResolvedTheme } from '../../hooks/appearance';
import { Icon } from '../Icon/Icon';
import { useAppStore } from '../../store/appStore';
import { upcomingOverlaps } from '../../store/selectors';

const THEME_NAME: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

// PRE: verb is Undo or Redo; label names its change or null when unavailable
// POST: returns the history action's tooltip
function historyTooltip(verb: 'Undo' | 'Redo', label: string | null): string {
  return label === null ? `Nothing to ${verb.toLowerCase()}` : `${verb}: ${label}`;
}

// PRE: StoreProvider supplies snapshot history/tasks/conflicts, currentMinute and drawer actions;
//      theme is current choice, resolvedTheme is its active Light/Dark state; onCycleTheme toggles it;
//      narrow enables drawer triggers
// POST: renders the app name and one set of history/theme/help/settings controls; narrow adds
//       independent Tasks and Conflicts drawer triggers with their current counts
export function AppBar({
  theme,
  resolvedTheme,
  onCycleTheme,
  narrow,
}: {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  onCycleTheme: () => void;
  narrow: boolean;
}) {
  const snapshot = useAppStore((state) => state.snapshot);
  const now = useAppStore((state) => state.currentMinute);
  const tasksOpen = useAppStore((state) => state.tasksOpen);
  const panelsOpen = useAppStore((state) => state.panelsOpen);
  const actions = useAppStore((state) => state.actions);
  const conflictCount = upcomingOverlaps(snapshot.conflicts, now).length;
  return (
    <header className="app-bar">
      <h1>Interactive Calendar</h1>
      <div className="toolbar-utilities">
        {narrow && (
          <>
            <button
              type="button"
              aria-controls="task-drawer"
              aria-expanded={tasksOpen}
              onClick={() => actions.setTasksOpen(true)}
            >
              Tasks ({snapshot.tasks.length})
            </button>
            <button
              type="button"
              aria-controls="side-panels"
              aria-expanded={panelsOpen}
              onClick={() => actions.setPanelsOpen(true)}
            >
              Conflicts ({conflictCount})
            </button>
          </>
        )}
        <button
          type="button"
          aria-label="Undo"
          title={historyTooltip('Undo', snapshot.undoLabel)}
          disabled={!snapshot.canUndo}
          onClick={() => void actions.undo()}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo"
          title={historyTooltip('Redo', snapshot.redoLabel)}
          disabled={!snapshot.canRedo}
          onClick={() => void actions.redo()}
        >
          ↷
        </button>
        <button
          type="button"
          aria-label={`Theme: ${THEME_NAME[theme]}`}
          title={`Theme: ${THEME_NAME[theme]} (${THEME_NAME[resolvedTheme]}). Switch to ${resolvedTheme === 'light' ? 'Dark' : 'Light'}.`}
          onClick={onCycleTheme}
        >
          <Icon
            name={resolvedTheme === 'light' ? 'sun' : 'moon'}
            label={`${THEME_NAME[resolvedTheme]} theme`}
          />
        </button>
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => actions.openDialog({ kind: 'shortcuts' })}
        >
          ?
        </button>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => actions.openDialog({ kind: 'settings' })}
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
