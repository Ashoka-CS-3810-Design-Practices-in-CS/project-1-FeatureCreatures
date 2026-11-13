import { useMemo } from 'react';
import { PRIORITY_TAGS } from '@/shared/constants';
import type { CalendarEvent, Task } from '@/shared/types';
import { fmtDay, fmtDuration, fmtRange, fmtTime } from '../../format/time';
import { useAppStore, type AppActions, type AppState } from '../../store/appStore';
import { visibleTasks } from '../../store/selectors';
import { CategoryTag } from '../Categories/CategoryTag';

type PanelState = AppState['taskPanel'];

// PRE:  task is a task; event is its scheduled event, if any; selected says whether it is ticked;
//       actions are the store's actions; reads snapshot.categories under StoreProvider
//       + additional props from: CategoryTag
// POST: renders one task row: a selection box (unscheduled tasks only), name, priority tag,
//       category tag, duration, deadline, status and applicable scheduling/completion/edit/delete actions
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
  const category = useAppStore((state) =>
    state.snapshot.categories.find((candidate) => candidate.id === task.categoryId),
  );
  const isUnscheduled = task.status === 'unscheduled';
  const isDone = task.status === 'done';
  return (
    <li className={`task-row prio-${task.priority}${isDone ? ' task-done' : ''}`}>
      <label className="task-selection">
        <input
          type="checkbox"
          aria-label={`Select ${task.name}`}
          checked={selected}
          disabled={!isUnscheduled}
          onChange={() => actions.toggleTaskSelection(task.id)}
        />
      </label>{' '}
      <span className="task-heading">
        <strong>{task.name}</strong> <span className="tag">{PRIORITY_TAGS[task.priority]}</span>
        {category !== undefined && <CategoryTag category={category} />}
      </span>{' '}
      <span className="task-meta">
        <span>{fmtDuration(task.durationMin)}</span>{' '}
        <span>
          due {fmtDay(task.window.end)} {fmtTime(task.window.end)}
        </span>{' '}
        <span className={`task-status${isDone ? ' tag' : ''}`}>
          {isDone ? '✓ Done' : event === undefined ? 'Unscheduled' : `Scheduled ${fmtRange(event)}`}
        </span>
      </span>{' '}
      <span className="task-actions">
        {isDone ? (
          <button
            type="button"
            aria-label={`Reopen ${task.name}`}
            onClick={() => void actions.reopenTask(task.id)}
          >
            Reopen
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Mark ${task.name} done`}
            onClick={() => void actions.markTaskDone(task.id)}
          >
            <span aria-hidden="true">✓</span> Mark done
          </button>
        )}
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
        {isDone && (
          <button
            type="button"
            aria-label={`Delete ${task.name}`}
            onClick={() => actions.confirmDeleteTask(task.id)}
          >
            Delete
          </button>
        )}
      </span>
    </li>
  );
}

// PRE:  rendered under StoreProvider; reads snapshot.tasks, snapshot.events and taskPanel; uses
//       setTaskPanel, toggleTaskSelection, openTaskPicker and openDialog
//       + additional props from: TaskRow
// POST: shows the counted Tasks region, status/sort/menu row, one + Task action and visible tasks;
//       Find time (N) exists only for selected unscheduled tasks; controls never change stored data
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
  // Built once per render so each row's lookup is O(1), not a scan (AUDIT R01).
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const selectedIds = new Set(selected);

  return (
    <section aria-labelledby="task-panel-title" className="task-panel">
      <div className="panel-heading">
        <h2 id="task-panel-title">Tasks ({tasks.length})</h2>

        <button
          type="button"
          className="primary"
          onClick={() => actions.openDialog({ kind: 'task', mode: 'create' })}
        >
          + Task
        </button>
      </div>

      <div className="task-filters">
        <label>
          Show{' '}
          <select
            value={panel.status}
            onChange={(event) =>
              actions.setTaskPanel({ status: event.target.value as PanelState['status'] })
            }
          >
            <option value="open">Open</option>
            <option value="unscheduled">Unscheduled</option>
            <option value="scheduled">Scheduled</option>
            <option value="done">Done</option>
            <option value="all">All</option>
          </select>
        </label>
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
        <details
          className="task-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.removeAttribute('open');
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}
        >
          <summary role="button" aria-label="Tasks menu">
            ⋯
          </summary>
          <div role="menu" aria-label="Tasks">
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                actions.openDialog({ kind: 'doneBefore' });
              }}
            >
              Mark done before…
            </button>
          </div>
        </details>
      </div>

      {shown.length === 0 ? (
        <p>No tasks to show.</p>
      ) : (
        <ul aria-label="Task list">
          {shown.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              event={
                task.scheduledEventId === null ? undefined : eventsById.get(task.scheduledEventId)
              }
              selected={selectedIds.has(task.id)}
              actions={actions}
            />
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <button type="button" onClick={() => actions.openTaskPicker(selected)}>
          Find time ({selected.length})
        </button>
      )}
    </section>
  );
}
