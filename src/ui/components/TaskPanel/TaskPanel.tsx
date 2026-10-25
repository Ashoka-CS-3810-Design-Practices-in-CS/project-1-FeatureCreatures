import { useMemo } from 'react';
import type { CalendarEvent, Priority, Task } from '@/shared/types';
import { fmtDay, fmtDuration, fmtRange, fmtTime } from '../../format/time';
import { useAppStore, type AppActions, type AppState } from '../../store/appStore';
import { visibleTasks } from '../../store/selectors';

const PRIORITY_OPTIONS: { value: Priority; label: string; tag: string }[] = [
  { value: 'high', label: 'High', tag: '[H]' },
  { value: 'medium', label: 'Medium', tag: '[M]' },
  { value: 'low', label: 'Low', tag: '[L]' },
];
const TAG_FOR: Record<Priority, string> = { high: '[H]', medium: '[M]', low: '[L]' };

type PanelState = AppState['taskPanel'];

// PRE:  task is a task; event is its scheduled event, if any; selected says whether it is ticked;
//       actions are the store's actions
// POST: renders one task row: a selection box (unscheduled tasks only), name, priority tag,
//       duration, deadline, status, and the Find time / Edit buttons
function TaskRow({
  task,
  event,
  selected,
  actions,
}: {
  task: Task;
  event: CalendarEvent | undefined;
  selected: boolean;
  actions: AppActions;
}) {
  const isUnscheduled = task.status === 'unscheduled';
  return (
    <li className={`task-row prio-${task.priority}`}>
      <input
        type="checkbox"
        aria-label={`Select ${task.name}`}
        checked={selected}
        disabled={!isUnscheduled}
        onChange={() => actions.toggleTaskSelection(task.id)}
      />{' '}
      <strong>{task.name}</strong> <span className="tag">{TAG_FOR[task.priority]}</span>{' '}
      <span>{fmtDuration(task.durationMin)}</span>{' '}
      <span>
        due {fmtDay(task.window.end)} {fmtTime(task.window.end)}
      </span>{' '}
      <span className="task-status">
        {event === undefined ? 'Unscheduled' : `Scheduled ${fmtRange(event)}`}
      </span>{' '}
      {isUnscheduled && (
        <button type="button" onClick={() => actions.openTaskPicker([task.id])}>
          Find time
        </button>
      )}
      <button
        type="button"
        aria-label={`Edit ${task.name}`}
        onClick={() => actions.openDialog({ kind: 'task', mode: 'edit', id: task.id })}
      >
        Edit
      </button>
    </li>
  );
}

// PRE:  panel is the task panel state; priority is one of the priorities
// POST: returns panel.priorities with priority added or removed
function togglePriority(panel: PanelState, priority: Priority): Priority[] {
  return panel.priorities.includes(priority)
    ? panel.priorities.filter((entry) => entry !== priority)
    : [...panel.priorities, priority];
}

// PRE:  rendered under StoreProvider; reads snapshot.tasks, snapshot.events and taskPanel; uses
//       setTaskPanel, toggleTaskSelection, openTaskPicker and openDialog
//       + additional props from: TaskRow
// POST: shows the task panel (FR6): sort and filter controls that never change stored data, the
//       visible tasks, "New task", and "Find time for N selected" for the ticked unscheduled tasks
export function TaskPanel() {
  const tasks = useAppStore((state) => state.snapshot.tasks);
  const events = useAppStore((state) => state.snapshot.events);
  const panel = useAppStore((state) => state.taskPanel);
  const actions = useAppStore((state) => state.actions);
  const shown = useMemo(() => visibleTasks(tasks, panel), [tasks, panel]);
  const unscheduledIds = new Set(
    tasks.filter((task) => task.status === 'unscheduled').map((task) => task.id),
  );
  const selected = panel.selectedIds.filter((id) => unscheduledIds.has(id));

  return (
    <section aria-labelledby="task-panel-title" className="task-panel">
      <h2 id="task-panel-title">Tasks</h2>
      <button type="button" onClick={() => actions.openDialog({ kind: 'task', mode: 'create' })}>
        New task
      </button>

      <label>
        Sort by{' '}
        <select
          value={panel.sort}
          onChange={(event) =>
            actions.setTaskPanel({ sort: event.target.value as PanelState['sort'] })
          }
        >
          <option value="priority">Priority</option>
          <option value="windowEnd">Window end</option>
        </select>
      </label>
      <fieldset>
        <legend>Priorities</legend>
        {PRIORITY_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={panel.priorities.includes(option.value)}
              onChange={() =>
                actions.setTaskPanel({ priorities: togglePriority(panel, option.value) })
              }
            />{' '}
            {option.label}
          </label>
        ))}
      </fieldset>
      <label>
        Show{' '}
        <select
          value={panel.status}
          onChange={(event) =>
            actions.setTaskPanel({ status: event.target.value as PanelState['status'] })
          }
        >
          <option value="unscheduled">Unscheduled</option>
          <option value="scheduled">Scheduled</option>
          <option value="all">All</option>
        </select>
      </label>

      {shown.length === 0 ? (
        <p>No tasks to show.</p>
      ) : (
        <ul aria-label="Task list">
          {shown.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              event={events.find((event) => event.id === task.scheduledEventId)}
              selected={selected.includes(task.id)}
              actions={actions}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => actions.openTaskPicker(selected)}
      >
        Find time for {selected.length} selected
      </button>
    </section>
  );
}
