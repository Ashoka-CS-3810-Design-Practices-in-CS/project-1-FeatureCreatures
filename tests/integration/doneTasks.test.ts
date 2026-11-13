import type { Result } from '@/shared/result';
import { createEngine } from '@/engine';
import { flexEv, iv, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { FailingRepository } from '../helpers/failingRepository';
import { t } from '../helpers/time';

const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE: result is any Result
// POST: returns its value or throws with its error so the failing command is identifiable
function expectOk<Value>(result: Result<Value>): Value {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

// PRE: none
// POST: returns two linked scheduled tasks, two unscheduled tasks and one done task
function seed() {
  return {
    now: 'Mon 08:00',
    tasks: [
      task('scheduled-boundary', 60, WINDOW, { status: 'scheduled', scheduledEventId: 'E1' }),
      task('scheduled-later', 60, WINDOW, { status: 'scheduled', scheduledEventId: 'E2' }),
      task('window-boundary', 30, ['Mon 09:00', 'Mon 11:00']),
      task('window-later', 30, ['Mon 09:00', 'Mon 11:01']),
      task('already-done', 30, WINDOW, { status: 'done', doneAt: t('Mon 07:00') }),
    ],
    events: [
      flexEv('E1', 'Mon 10:00', 'Mon 11:00', WINDOW, {
        title: 'scheduled-boundary',
        taskId: 'scheduled-boundary',
        categoryId: 'assignment',
      }),
      flexEv('E2', 'Mon 10:01', 'Mon 11:01', WINDOW, {
        title: 'scheduled-later',
        taskId: 'scheduled-later',
        categoryId: 'assignment',
      }),
    ],
  };
}

describe('T54: done task lifecycle (D-07)', () => {
  it('rejects another tab’s newer revision without partially completing any task', async () => {
    const { engine, repo } = await makeEngine(seed());
    const other = createEngine({ repo, now: () => t('Mon 08:01'), newId: () => 'other-id' });
    expectOk(await other.init());
    const preview = expectOk(engine.previewDoneBefore(t('Mon 11:00')));
    expectOk(await other.markTaskDone('window-later'));
    const before = await capture(engine, repo);
    expect(await engine.applyDoneBefore(preview)).toMatchObject({
      ok: false,
      error: { code: 'ConcurrentModification' },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('atomically frees scheduled time, timestamps completion, persists, and undoes/redoes once', async () => {
    const { engine, repo } = await makeEngine(seed());
    const before = engine.snapshot();
    const result = expectOk(await engine.markTaskDone('scheduled-boundary'));
    expect(result.snapshot.version).toBe(before.version + 1);
    expect(result.snapshot.tasks[0]).toMatchObject({
      status: 'done',
      doneAt: t('Mon 08:00'),
      updatedAt: t('Mon 08:00'),
      scheduledEventId: null,
    });
    expect(result.snapshot.events.map((event) => event.id)).toEqual(['E2']);
    expect(result.snapshot.conflicts).toEqual([]);
    expect((await repo.load()).tasks).toEqual(result.snapshot.tasks);
    expect((await repo.load()).events).toEqual(result.snapshot.events);
    expectOk(await engine.undo());
    expect(engine.snapshot().tasks).toEqual(before.tasks);
    expect(engine.snapshot().events).toEqual(before.events);
    expect(engine.snapshot().undoLabel).toBeNull();
    expectOk(await engine.redo());
    expect(engine.snapshot().tasks[0]?.status).toBe('done');
    expect(engine.snapshot().events.map((event) => event.id)).toEqual(['E2']);
  });

  it('marks an unscheduled task done without time, and repeated completion is a no-op', async () => {
    const { engine, repo } = await makeEngine(seed());
    expectOk(await engine.markTaskDone('window-boundary'));
    const before = await capture(engine, repo);
    expectOk(await engine.markTaskDone('window-boundary'));
    expect(await capture(engine, repo)).toEqual(before);
    expect(engine.snapshot().events).toEqual(seed().events);
  });

  it('reopens to unscheduled without restoring an event, can freshly schedule, and undoes both steps', async () => {
    const { engine } = await makeEngine(seed());
    expectOk(await engine.markTaskDone('scheduled-boundary'));
    expectOk(await engine.reopenTask('scheduled-boundary'));
    expect(engine.snapshot().tasks[0]).toMatchObject({
      status: 'unscheduled',
      doneAt: null,
      scheduledEventId: null,
    });
    expect(engine.snapshot().events.map((event) => event.id)).toEqual(['E2']);
    const found = expectOk(engine.findSlots({ taskId: 'scheduled-boundary' }));
    expectOk(
      await engine.scheduleTask({
        taskId: 'scheduled-boundary',
        slot: iv('Tue 09:00', 'Tue 10:00'),
        baseVersion: found.baseVersion,
      }),
    );
    expect(engine.snapshot().tasks[0]?.status).toBe('scheduled');
    expectOk(await engine.undo());
    expect(engine.snapshot().tasks[0]?.status).toBe('unscheduled');
    expectOk(await engine.undo());
    expect(engine.snapshot().tasks[0]).toMatchObject({
      status: 'done',
      doneAt: t('Mon 08:00'),
      scheduledEventId: null,
    });
  });

  it('requires Reopen before searching/scheduling done tasks, and unschedule/reopen cannot corrupt other statuses', async () => {
    const { engine, repo } = await makeEngine(seed());
    const before = await capture(engine, repo);
    expect(engine.findSlots({ taskId: 'already-done' })).toMatchObject({
      ok: false,
      error: { code: 'InvalidInput' },
    });
    expect(engine.explainWindow({ taskId: 'already-done' })).toMatchObject({
      ok: false,
      error: { code: 'InvalidInput' },
    });
    expect(
      await engine.scheduleTask({
        taskId: 'already-done',
        slot: iv('Tue 09:00', 'Tue 09:30'),
        baseVersion: engine.snapshot().version,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidInput' } });
    expectOk(await engine.unscheduleTask('already-done'));
    expectOk(await engine.reopenTask('window-boundary'));
    expectOk(await engine.reopenTask('scheduled-boundary'));
    expect(engine.orderForScheduling(['already-done', 'window-boundary'])).toEqual([
      'window-boundary',
    ]);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('previews inclusive event/window end boundaries in stored order without writing', async () => {
    const { engine, repo } = await makeEngine(seed());
    const before = await capture(engine, repo);
    const preview = expectOk(engine.previewDoneBefore(t('Mon 11:00')));
    expect(preview).toMatchObject({
      before: t('Mon 11:00'),
      baseVersion: engine.snapshot().version,
    });
    expect(preview.tasks.map((task) => task.id)).toEqual(['scheduled-boundary', 'window-boundary']);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('applies all previewed tasks at one completion time in one atomic undo step', async () => {
    const { engine, repo, setNow } = await makeEngine(seed());
    const before = engine.snapshot();
    const preview = expectOk(engine.previewDoneBefore(t('Mon 11:00')));
    setNow('Mon 08:05');
    const result = expectOk(await engine.applyDoneBefore(preview));
    expect(result.snapshot.version).toBe(before.version + 1);
    expect(
      result.snapshot.tasks.filter((task) => task.doneAt === t('Mon 08:05')).map((task) => task.id),
    ).toEqual(['scheduled-boundary', 'window-boundary']);
    expect(result.snapshot.tasks[1]).toEqual(before.tasks[1]);
    expect(result.snapshot.tasks[3]).toEqual(before.tasks[3]);
    expect(result.snapshot.tasks[4]).toEqual(before.tasks[4]);
    expect((await repo.load()).events.map((event) => event.id)).toEqual(['E2']);
    expectOk(await engine.undo());
    expect(engine.snapshot().tasks).toEqual(before.tasks);
    expect(engine.snapshot().events).toEqual(before.events);
    expect(engine.snapshot().undoLabel).toBeNull();
    expectOk(await engine.redo());
    expect(engine.snapshot().tasks.filter((task) => task.status === 'done')).toHaveLength(3);
  });

  it('rejects stale previews without writes, even if the eligible set is unchanged', async () => {
    const { engine, repo } = await makeEngine(seed());
    const preview = expectOk(engine.previewDoneBefore(t('Mon 11:00')));
    expectOk(await engine.markTaskDone('window-later'));
    const before = await capture(engine, repo);
    expect(await engine.applyDoneBefore(preview)).toMatchObject({
      ok: false,
      error: { code: 'StaleResult' },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('empty bulk apply and missing task ids preserve storage/history', async () => {
    const { engine, repo } = await makeEngine(seed());
    const before = await capture(engine, repo);
    expectOk(await engine.applyDoneBefore(expectOk(engine.previewDoneBefore(t('Mon 00:00')))));
    expect(await engine.markTaskDone('missing')).toEqual({
      ok: false,
      error: { code: 'NotFound', entity: 'task', id: 'missing' },
    });
    expect(await engine.reopenTask('missing')).toEqual({
      ok: false,
      error: { code: 'NotFound', entity: 'task', id: 'missing' },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('validates cutoff and version before changing state', async () => {
    const { engine, repo } = await makeEngine(seed());
    const before = await capture(engine, repo);
    expect(engine.previewDoneBefore(Number.NaN)).toMatchObject({
      ok: false,
      error: { code: 'InvalidInput' },
    });
    expect(engine.previewDoneBefore(-1)).toMatchObject({
      ok: false,
      error: { code: 'InvalidTime' },
    });
    expect(await engine.applyDoneBefore({ before: t('Mon 11:00'), baseVersion: -1 })).toMatchObject(
      { ok: false, error: { code: 'InvalidInput' } },
    );
    expect(await capture(engine, repo)).toEqual(before);
  });

  it.each(['single', 'bulk', 'reopen'] as const)(
    'rolls back a failed %s apply without losing event/task/history state',
    async (operation) => {
      const repo = new FailingRepository();
      const { engine } = await makeEngine({ ...seed(), repo });
      const before = await capture(engine, repo);
      repo.failNextApply();
      const result =
        operation === 'single'
          ? await engine.markTaskDone('scheduled-boundary')
          : operation === 'reopen'
            ? await engine.reopenTask('already-done')
            : await engine.applyDoneBefore(expectOk(engine.previewDoneBefore(t('Mon 11:00'))));
      expect(result).toMatchObject({ ok: false, error: { code: 'StorageError' } });
      expect(await capture(engine, repo)).toEqual(before);
    },
  );
});
