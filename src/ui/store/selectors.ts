// Derived views of the snapshot for the panels (FR6). They never change the snapshot itself.

import { PRIORITY_RANK } from '@/shared/constants';
import type { Task } from '@/shared/types';
import type { AppState } from './appStore';

type TaskPanelState = AppState['taskPanel'];

// PRE:  first and second are tasks
// POST: returns < 0 when first has the higher priority, > 0 when second does, else 0
function byPriority(first: Task, second: Task): number {
  return PRIORITY_RANK[second.priority] - PRIORITY_RANK[first.priority];
}

// PRE:  first and second are tasks
// POST: returns their order by window end, earliest first
function byWindowEnd(first: Task, second: Task): number {
  return first.window.end - second.window.end;
}

// PRE:  first and second are tasks
// POST: returns their order by name (locale-aware)
function byName(first: Task, second: Task): number {
  return first.name.localeCompare(second.name);
}

// PRE:  sort names the panel's sort
// POST: returns the FR6 comparator: by priority (then window end, then name), or by window end
//       (then priority, then name)
function comparatorFor(sort: TaskPanelState['sort']): (first: Task, second: Task) => number {
  const keys =
    sort === 'priority' ? [byPriority, byWindowEnd, byName] : [byWindowEnd, byPriority, byName];
  return (first, second) => {
    // INVARIANT: every key before keyIndex ranks first and second equal
    for (const key of keys) {
      const order = key(first, second);
      if (order !== 0) {
        return order;
      }
    }
    // POST: all keys rank them equal
    return 0;
  };
}

// PRE:  tasks are the snapshot's tasks; panel is the task panel's state
// POST: returns a new array of the tasks the panel shows: priority in panel.priorities, status
//       matching panel.status ('all' matches both), in panel.sort order; tasks is not changed
export function visibleTasks(tasks: readonly Task[], panel: TaskPanelState): Task[] {
  return tasks
    .filter(
      (task) =>
        panel.priorities.includes(task.priority) &&
        (panel.status === 'all' || task.status === panel.status),
    )
    .toSorted(comparatorFor(panel.sort));
}
