import { createState } from '@/engine/state';
import type { Snapshot } from '@/shared/types';
import { ev, settings, task } from '../../../tests/helpers/builders';
import { toFullCalendar } from '../components/CalendarView/toFullCalendar';
import type { AppState } from './appStore';
import { visibleTasks } from './selectors';

const tasks = [
  task('A', 60, ['Mon 09:00', 'Fri 18:00'], { priority: 'low' }),
  task('B', 60, ['Mon 09:00', 'Thu 18:00'], { priority: 'high' }),
  task('C', 60, ['Mon 09:00', 'Wed 18:00'], { priority: 'medium' }),
  task('D', 60, ['Mon 09:00', 'Wed 18:00'], { priority: 'high' }),
];

// PRE:  overrides holds any subset of the task panel state
// POST: returns the panel state: all priorities, all statuses, sorted by priority, with overrides
function panel(overrides: Partial<AppState['taskPanel']> = {}): AppState['taskPanel'] {
  return {
    sort: 'priority',
    priorities: ['high', 'medium', 'low'],
    status: 'all',
    selectedIds: [],
    ...overrides,
  };
}

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('visibleTasks (T30, FR6)', () => {
  it('sorts by priority, then window end, then name', () => {
    expect(ids(visibleTasks(tasks, panel()))).toEqual(['D', 'B', 'C', 'A']);
  });

  it('sorts by window end, then priority, then name', () => {
    expect(ids(visibleTasks(tasks, panel({ sort: 'windowEnd' })))).toEqual(['D', 'C', 'B', 'A']);
  });

  it('filters by priority and by status, without changing the input', () => {
    const before = structuredClone(tasks);
    const scheduled = [
      ...tasks,
      task('S', 60, ['Mon 09:00', 'Fri 18:00'], { status: 'scheduled', scheduledEventId: 'E' }),
    ];

    expect(ids(visibleTasks(tasks, panel({ priorities: ['medium'] })))).toEqual(['C']);
    expect(ids(visibleTasks(scheduled, panel({ status: 'scheduled' })))).toEqual(['S']);
    expect(ids(visibleTasks(scheduled, panel({ status: 'unscheduled' })))).toHaveLength(4);
    expect(tasks).toEqual(before);
  });

  it('a High calendar filter keeps only High events and leaves the snapshot alone', () => {
    const state = createState({
      events: [
        ev('H', 'Mon 09:00', 'Mon 10:00', { priority: 'high' }),
        ev('L1', 'Mon 11:00', 'Mon 12:00', { priority: 'low' }),
        ev('L2', 'Mon 11:30', 'Mon 12:30', { priority: 'low' }),
      ],
      tasks: [],
      settings: settings(),
    });
    const snapshot: Snapshot = {
      ...state,
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
    };
    const events = snapshot.events;

    expect(ids(toFullCalendar(snapshot, ['high'], null, []) as { id: string }[])).toEqual(['H']);
    expect(snapshot.events).toBe(events);
    expect(snapshot.conflicts.map((conflict) => conflict.key)).toEqual(['L1|L2']);
  });
});
