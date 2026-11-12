import type { Engine } from '@/engine';
import type { Repository } from '@/data/repository';
import { HISTORY_LIMIT } from '@/shared/constants';
import type { Result } from '@/shared/result';
import type { EventInput } from '@/shared/types';
import { ev, flexEv, iv, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { FailingRepository } from '../helpers/failingRepository';
import { t } from '../helpers/time';

const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];
const EXTRA_CREATES = 5;
const CHANGE_COUNT = 3; // create, move, delete

// PRE:  result is any Result
// POST: returns its value; throws with the error otherwise, so the failing step is obvious
function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

// PRE:  title is non-empty; from and to are valid t() specs with from < to
// POST: returns a fixed medium meeting input over [t(from), t(to))
function input(title: string, from: string, to: string): EventInput {
  return {
    title,
    description: '',
    categoryId: 'meeting',
    priority: 'medium',
    start: t(from),
    end: t(to),
    flexible: false,
    flexWindow: null,
  };
}

// PRE:  engine and repo belong together
// POST: asserts that the repository holds exactly the snapshot's events and tasks
async function expectStoredMatchesSnapshot(engine: Engine, repo: Repository): Promise<void> {
  const stored = await repo.load();
  const snapshot = engine.snapshot();
  expect(stored.events.toSorted((first, second) => first.start - second.start)).toEqual([
    ...snapshot.events,
  ]);
  expect(stored.tasks).toEqual([...snapshot.tasks]);
}

describe('undo / redo (T24, B1)', () => {
  it('undoes and redoes create, move and delete, keeping the repository in step', async () => {
    const { engine, repo } = await makeEngine();

    expectOk(await engine.createEvent(input('A', 'Mon 10:00', 'Mon 11:00')));
    expectOk(await engine.moveEvent('id-1', iv('Mon 12:00', 'Mon 13:00')));
    expectOk(await engine.deleteEvent('id-1'));
    expect(engine.snapshot().undoLabel).toBe('Delete "A"');

    const labels: string[] = [];
    // INVARIANT: labels holds the labels of the undos so far, newest change first
    for (let undoIndex = 0; undoIndex < CHANGE_COUNT; undoIndex += 1) {
      labels.push(expectOk(await engine.undo()).label);
      await expectStoredMatchesSnapshot(engine, repo);
    }
    // POST: all three changes are undone
    expect(labels).toEqual(['Delete "A"', 'Move "A"', 'Create "A"']);
    expect(engine.snapshot()).toMatchObject({ events: [], canUndo: false, canRedo: true });

    expectOk(await engine.redo());
    const redone = expectOk(await engine.redo());
    expect(redone.label).toBe('Move "A"');
    expect(redone.snapshot.events[0]).toMatchObject(iv('Mon 12:00', 'Mon 13:00'));
    expect(redone.snapshot.redoLabel).toBe('Delete "A"');
    await expectStoredMatchesSnapshot(engine, repo);

    expectOk(await engine.createEvent(input('B', 'Mon 15:00', 'Mon 16:00')));
    expect(engine.snapshot().canRedo).toBe(false);
  });

  it(`keeps only the last ${HISTORY_LIMIT} steps`, async () => {
    const { engine } = await makeEngine();

    // INVARIANT: createIndex events have been created
    for (let createIndex = 0; createIndex < HISTORY_LIMIT + EXTRA_CREATES; createIndex += 1) {
      expectOk(await engine.createEvent(input(`E${createIndex}`, 'Mon 10:00', 'Mon 11:00')));
    }
    // POST: HISTORY_LIMIT + EXTRA_CREATES events exist

    let undone = 0;
    // INVARIANT: undone undos have succeeded
    while (engine.snapshot().canUndo) {
      expectOk(await engine.undo());
      undone += 1;
    }
    // POST: the undo stack is empty
    expect(undone).toBe(HISTORY_LIMIT);
    expect(engine.snapshot().events).toHaveLength(EXTRA_CREATES);
  });

  it('undoing scheduleTask removes the event and unschedules the task', async () => {
    const { engine, repo } = await makeEngine({ tasks: [task('T', 60, WINDOW)] });
    expectOk(
      await engine.scheduleTask({
        taskId: 'T',
        slot: iv('Mon 09:00', 'Mon 10:00'),
        baseVersion: engine.snapshot().version,
      }),
    );

    const undone = expectOk(await engine.undo());

    expect(undone.label).toBe('Schedule "T"');
    expect(undone.snapshot.events).toEqual([]);
    expect(undone.snapshot.tasks[0]).toMatchObject({
      status: 'unscheduled',
      scheduledEventId: null,
    });
    await expectStoredMatchesSnapshot(engine, repo);
  });

  it('T23 (b): one undo puts back every event a replan moved', async () => {
    const read = flexEv('Read', 'Mon 14:00', 'Mon 15:00', WINDOW, { priority: 'low' });
    const { engine } = await makeEngine({
      events: [ev('Lecture', 'Mon 10:00', 'Mon 12:00'), read],
    });
    const plan = expectOk(engine.planReplan({ range: iv('Mon 00:00', 'Sat 00:00') }));
    expectOk(await engine.applyReplan({ baseVersion: plan.baseVersion, planId: 'balanced' }));

    const undone = expectOk(await engine.undo());

    expect(undone.label).toBe('Replan: 1 event moved');
    expect(undone.snapshot.events.find((event) => event.id === 'Read')).toMatchObject(
      iv('Mon 14:00', 'Mon 15:00'),
    );
  });

  it('with nothing to undo or redo, returns ok with the same snapshot', async () => {
    const { engine } = await makeEngine();
    const before = engine.snapshot();

    expect(expectOk(await engine.undo())).toMatchObject({ label: '', snapshot: before });
    expect(expectOk(await engine.redo())).toMatchObject({ label: '', snapshot: before });
  });

  it('a failed undo changes nothing', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({ repo });
    expectOk(await engine.createEvent(input('A', 'Mon 10:00', 'Mon 11:00')));
    const before = await capture(engine, repo);
    repo.failNextApply();

    const failed = await engine.undo();

    expect(failed.ok ? null : failed.error.code).toBe('StorageError');
    expect(await capture(engine, repo)).toEqual(before);
  });
});
