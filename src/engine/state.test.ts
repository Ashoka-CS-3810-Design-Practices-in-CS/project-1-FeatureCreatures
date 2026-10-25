import { MemoryRepository } from '@/data/memoryRepository';
import { HISTORY_LIMIT } from '@/shared/constants';
import type { CalendarEvent, Task } from '@/shared/types';
import { ev, settings, task } from '../../tests/helpers/builders';
import { FailingRepository } from '../../tests/helpers/failingRepository';
import { applyChange, commit, createState, type Change, type EngineState } from './state';

const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE:  label is non-empty; each image pair describes one record (null = absent)
// POST: returns a Change touching the given events and tasks
function change(
  label: string,
  events: [CalendarEvent | null, CalendarEvent | null][],
  tasks: [Task | null, Task | null][] = [],
): Change {
  const recordOf = <T extends { id: string }>([before, after]: [T | null, T | null]) => ({
    id: (before ?? after)?.id ?? '',
    before,
    after,
  });
  return { label, events: events.map(recordOf), tasks: tasks.map(recordOf) };
}

// PRE:  repo holds exactly the given events and tasks
// POST: returns a fresh state over those records with default settings
async function seeded(
  repo: MemoryRepository | FailingRepository,
  events: CalendarEvent[],
  tasks: Task[] = [],
): Promise<EngineState> {
  await repo.replaceAll({ events, tasks, settings: settings() });
  return createState({ events, tasks, settings: settings() });
}

describe('createState', () => {
  it('sorts the events, detects conflicts and starts at version 0 with empty history', () => {
    const state = createState({
      events: [ev('B', 'Mon 11:00', 'Mon 12:00'), ev('A', 'Mon 10:00', 'Mon 11:30')],
      tasks: [],
      settings: settings(),
    });

    expect(state.events.map((event) => event.id)).toEqual(['A', 'B']);
    expect(state.conflicts.map((conflict) => conflict.key)).toEqual(['A|B']);
    expect(state).toMatchObject({ version: 0, undo: [], redo: [] });
  });
});

describe('applyChange', () => {
  const a = ev('A', 'Mon 10:00', 'Mon 11:00');
  const b = ev('B', 'Mon 12:00', 'Mon 13:00');
  const t1 = task('T1', 60, WINDOW);
  const base = createState({ events: [a, b], tasks: [t1], settings: settings() });

  it('writes after-images forward and before-images backward, keeping events sorted', () => {
    const movedA = { ...a, start: b.end, end: b.end + 60 };
    const created = ev('C', 'Mon 09:00', 'Mon 09:30');
    const renamed = { ...t1, name: 'Renamed' };
    const added = task('T2', 30, WINDOW);
    const edit = change(
      'edit',
      [
        [a, movedA],
        [null, created],
        [b, null],
      ],
      [
        [t1, renamed],
        [null, added],
      ],
    );

    const forward = applyChange(base, edit, 'forward');
    expect(forward.events).toEqual([created, movedA]);
    expect(forward.tasks).toEqual([renamed, added]);

    const backward = applyChange({ ...base, ...forward }, edit, 'backward');
    expect(backward.events).toEqual([a, b]);
    expect(backward.tasks).toEqual([t1]);
  });

  it('does not mutate the state it is given', () => {
    const before = structuredClone(base);

    applyChange(base, change('delete', [[a, null]], [[t1, null]]), 'forward');
    expect(base).toEqual(before);
  });
});

describe('commit', () => {
  const a = ev('A', 'Mon 10:00', 'Mon 11:00');
  const b = ev('B', 'Mon 12:00', 'Mon 13:00');

  it('do: persists, recomputes conflicts, reports the diff, pushes undo and bumps the version', async () => {
    const repo = new MemoryRepository();
    const state = await seeded(repo, [a, b]);
    const movedB = { ...b, start: a.start + 30, end: a.end + 30 };

    const result = await commit(state, change('Move "B"', [[b, movedB]]), 'do', repo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state: next, introducedConflicts, resolvedConflicts, changedEventIds } = result.value;
    expect(next.version).toBe(1);
    expect(next.events).toEqual([a, movedB]);
    expect(next.conflicts.map((conflict) => conflict.key)).toEqual(['A|B']);
    expect(introducedConflicts.map((conflict) => conflict.key)).toEqual(['A|B']);
    expect(resolvedConflicts).toEqual([]);
    expect(changedEventIds).toEqual(['B']);
    expect(result.value.label).toBe('Move "B"');
    expect(next.undo.map((entry) => entry.label)).toEqual(['Move "B"']);
    expect((await repo.load()).events).toEqual(expect.arrayContaining([a, movedB]));
  });

  it('undo then redo replays the change both ways and moves it between the stacks', async () => {
    const repo = new MemoryRepository();
    const created = ev('C', 'Mon 10:30', 'Mon 11:30');
    const create = change('Create "C"', [[null, created]]);
    const state = await seeded(repo, [a]);

    const done = await commit(state, create, 'do', repo);
    if (!done.ok) throw new Error('do failed');
    const undone = await commit(done.value.state, create, 'undo', repo);
    if (!undone.ok) throw new Error('undo failed');

    expect(undone.value.state.events).toEqual([a]);
    expect(undone.value.resolvedConflicts.map((conflict) => conflict.key)).toEqual(['A|C']);
    expect(undone.value.changedEventIds).toEqual([]); // the backward image of C is a delete
    expect(undone.value.state).toMatchObject({ version: 2, undo: [], redo: [create] });
    expect((await repo.load()).events).toEqual([a]);

    const redone = await commit(undone.value.state, create, 'redo', repo);
    if (!redone.ok) throw new Error('redo failed');
    expect(redone.value.state.events).toEqual([a, created]);
    expect(redone.value.changedEventIds).toEqual(['C']);
    expect(redone.value.state).toMatchObject({ version: 3, undo: [create], redo: [] });
  });

  it('do clears the redo stack', async () => {
    const repo = new MemoryRepository();
    const first = change('first', [[null, ev('C', 'Mon 14:00', 'Mon 15:00')]]);
    const second = change('second', [[null, ev('D', 'Mon 16:00', 'Mon 17:00')]]);
    const state = await seeded(repo, []);

    const done = await commit(state, first, 'do', repo);
    if (!done.ok) throw new Error('do failed');
    const undone = await commit(done.value.state, first, 'undo', repo);
    if (!undone.ok) throw new Error('undo failed');
    const again = await commit(undone.value.state, second, 'do', repo);
    if (!again.ok) throw new Error('second do failed');

    expect(again.value.state.redo).toEqual([]);
    expect(again.value.state.undo).toEqual([second]);
  });

  it(`keeps at most HISTORY_LIMIT (${HISTORY_LIMIT}) undo steps, dropping the oldest`, async () => {
    const repo = new MemoryRepository();
    let state = await seeded(repo, [a]);

    // INVARIANT: state.undo holds the labels of the last min(step, HISTORY_LIMIT) commits
    for (let step = 0; step <= HISTORY_LIMIT; step += 1) {
      const current = state.events[0] as CalendarEvent;
      const result = await commit(
        state,
        change(`step ${step}`, [[current, { ...current, title: `v${step}` }]]),
        'do',
        repo,
      );
      if (!result.ok) throw new Error('commit failed');
      state = result.value.state;
    }
    // POST: HISTORY_LIMIT + 1 commits happened

    expect(state.undo).toHaveLength(HISTORY_LIMIT);
    expect(state.undo[0]?.label).toBe('step 1');
    expect(state.undo.at(-1)?.label).toBe(`step ${HISTORY_LIMIT}`);
  });

  it('returns StorageError and leaves state and repository untouched when apply rejects', async () => {
    const repo = new FailingRepository();
    const state = await seeded(repo, [a, b]);
    const before = structuredClone(state);
    const stored = await repo.load();
    repo.failNextApply();

    const result = await commit(state, change('Delete "A"', [[a, null]]), 'do', repo);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('StorageError');
    expect(state).toEqual(before);
    expect(await repo.load()).toEqual(stored);
  });
});
