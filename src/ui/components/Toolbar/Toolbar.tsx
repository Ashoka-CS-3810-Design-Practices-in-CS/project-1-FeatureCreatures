import type FullCalendar from '@fullcalendar/react';
import type { RefObject } from 'react';
import type { Priority } from '@/shared/types';
import { fmtViewTitle } from '../../format/time';
import type { ThemeChoice } from '../../hooks/useTheme';
import { useAppStore, type ViewType } from '../../store/appStore';

const VIEWS: { type: ViewType; label: string }[] = [
  { type: 'timeGridDay', label: 'Day' },
  { type: 'timeGridWeek', label: 'Week' },
  { type: 'dayGridMonth', label: 'Month' },
  { type: 'listWeek', label: 'List' },
];
// The chips show the [H]/[M]/[L] tags of BR-13; the tooltip spells the priority out.
const PRIORITY_CHIPS: { priority: Priority; tag: string; title: string }[] = [
  { priority: 'high', tag: 'H', title: 'Show high-priority events' },
  { priority: 'medium', tag: 'M', title: 'Show medium-priority events' },
  { priority: 'low', tag: 'L', title: 'Show low-priority events' },
];
const THEME_NAME: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

// PRE:  verb is 'Undo' or 'Redo'; label is the change it would undo / redo (null when none)
// POST: returns the button's tooltip, e.g. 'Undo: Delete "Gym"', or 'Nothing to undo'
function historyTooltip(verb: 'Undo' | 'Redo', label: string | null): string {
  return label === null ? `Nothing to ${verb.toLowerCase()}` : `${verb}: ${label}`;
}

// PRE:  rendered under StoreProvider; reads view, eventPriorityFilter and snapshot's undo / redo
//       state; uses openDialog, toggleEventPriority, undo and redo; calendarRef points at the
//       FullCalendar that CalendarView renders; theme is the current theme choice and onCycleTheme
//       moves to the next one
//       onOpenPanels, when supplied, opens the narrow-screen drawer; panelsOpen is its state
// POST: shows the toolbar of Figure 1: previous / Today / next, the period title, the view switch,
//       the priority filter chips, + Event, + Task, Replan, Undo / Redo (disabled when there is
//       nothing to do, tooltip = the change), the theme toggle and Settings
export function Toolbar({
  calendarRef,
  theme,
  onCycleTheme,
  onOpenPanels,
  panelsOpen = false,
}: {
  calendarRef: RefObject<FullCalendar | null>;
  theme: ThemeChoice;
  onCycleTheme: () => void;
  onOpenPanels?: () => void;
  panelsOpen?: boolean;
}) {
  const view = useAppStore((state) => state.view);
  const filter = useAppStore((state) => state.eventPriorityFilter);
  const canUndo = useAppStore((state) => state.snapshot.canUndo);
  const canRedo = useAppStore((state) => state.snapshot.canRedo);
  const undoLabel = useAppStore((state) => state.snapshot.undoLabel);
  const redoLabel = useAppStore((state) => state.snapshot.redoLabel);
  const actions = useAppStore((state) => state.actions);
  const calendar = () => calendarRef.current?.getApi();

  return (
    <div className="toolbar">
      {onOpenPanels !== undefined && (
        <button
          type="button"
          aria-controls="side-panels"
          aria-expanded={panelsOpen}
          onClick={onOpenPanels}
        >
          Tasks and conflicts
        </button>
      )}
      <div role="group" aria-label="Navigation">
        <button type="button" aria-label="Previous period" onClick={() => calendar()?.prev()}>
          ◀
        </button>
        <button type="button" onClick={() => calendar()?.today()}>
          Today
        </button>
        <button type="button" aria-label="Next period" onClick={() => calendar()?.next()}>
          ▶
        </button>
      </div>
      <h2 className="toolbar-title">{fmtViewTitle(view.type, view.date)}</h2>
      <div role="group" aria-label="View">
        {VIEWS.map((option) => (
          <button
            key={option.type}
            type="button"
            aria-pressed={view.type === option.type}
            onClick={() => calendar()?.changeView(option.type)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Priority filter">
        {PRIORITY_CHIPS.map((chip) => (
          <button
            key={chip.priority}
            type="button"
            className={`chip prio-${chip.priority}`}
            title={chip.title}
            aria-pressed={filter.includes(chip.priority)}
            onClick={() => actions.toggleEventPriority(chip.priority)}
          >
            {chip.tag}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => actions.openDialog({ kind: 'event', mode: 'create', defaults: {} })}
      >
        + Event
      </button>
      <button type="button" onClick={() => actions.openDialog({ kind: 'task', mode: 'create' })}>
        + Task
      </button>
      <button type="button" onClick={() => actions.openDialog({ kind: 'replan' })}>
        Replan
      </button>
      <button
        type="button"
        aria-label="Undo"
        title={historyTooltip('Undo', undoLabel)}
        disabled={!canUndo}
        onClick={() => void actions.undo()}
      >
        ↶
      </button>
      <button
        type="button"
        aria-label="Redo"
        title={historyTooltip('Redo', redoLabel)}
        disabled={!canRedo}
        onClick={() => void actions.redo()}
      >
        ↷
      </button>
      <button
        type="button"
        aria-label={`Theme: ${THEME_NAME[theme]}`}
        title="Switch theme (System → Light → Dark)"
        onClick={onCycleTheme}
      >
        ◐
      </button>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => actions.openDialog({ kind: 'settings' })}
      >
        ⚙
      </button>
    </div>
  );
}
