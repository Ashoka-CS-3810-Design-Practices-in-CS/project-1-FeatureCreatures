import { MemoryRepository } from '@/data/memoryRepository';
import type { Repository } from '@/data/repository';
import { createEngine, type Engine } from '@/engine';
import { EMPHASIS_MS } from '@/shared/constants';
import { ev, iv, task } from '../../../tests/helpers/builders';
import { makeEngine } from '../../../tests/helpers/engine';
import { FailingRepository } from '../../../tests/helpers/failingRepository';
import { t } from '../../../tests/helpers/time';
import { createAppStore, type AppStore } from './appStore';

// PRE:  engine is initialised
// POST: returns a ready store over engine at 'Mon 08:00' with no storage warning
function storeFor(engine: Engine, resetStorage = async () => undefined): AppStore {
  return createAppStore(engine, {
    storageWarning: false,
    init: { ok: true, value: engine.snapshot() },
    now: () => t('Mon 08:00'),
    resetStorage,
  });
}

const texts = (store: AppStore) => store.getState().toasts.map((toast) => toast.text);

describe('createAppStore', () => {
  it('starts ready with the engine snapshot, or fatal with the init error', async () => {
    const { engine } = await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] });

    const ready = storeFor(engine);
    const fatal = createAppStore(engine, {
      storageWarning: true,
      init: { ok: false, error: { code: 'StorageError', message: 'blocked' } },
      now: () => 0,
      resetStorage: async () => undefined,
    });

    expect(ready.getState()).toMatchObject({
      status: 'ready',
      fatalError: null,
      storageWarning: false,
    });
    expect(ready.getState().snapshot.events).toHaveLength(1);
    expect(ready.getState().view).toMatchObject({ type: 'timeGridWeek', date: t('Mon 08:00') });
    expect(fatal.getState()).toMatchObject({
      status: 'fatal',
      storageWarning: true,
      fatalError: { code: 'StorageError' },
    });
  });

  it('loadSample replaces the data with the sample for the current week', async () => {
    const { engine } = await makeEngine();
    const store = storeFor(engine);

    const result = await store.getState().actions.loadSample('sparseWeek');

    expect(result.ok).toBe(true);
    expect(store.getState().snapshot.conflicts).toHaveLength(1);
    expect(store.getState().snapshot.events[0]?.start).toBe(t('Mon 09:00'));
    expect(texts(store)).toEqual(['Loaded sample: Sparse week.']);
  });

  it('undo and redo report what they did, or that there was nothing to do', async () => {
    const { engine } = await makeEngine();
    const store = storeFor(engine);
    const { actions } = store.getState();

    await actions.undo();
    await engine.createEvent({
      title: 'Gym',
      description: '',
      category: 'personal',
      priority: 'low',
      start: t('Mon 10:00'),
      end: t('Mon 11:00'),
      flexible: false,
      flexWindow: null,
    });
    await actions.undo();
    await actions.redo();

    expect(texts(store)).toEqual([
      'Nothing to undo.',
      'Undid: Create "Gym"',
      'Redid: Create "Gym"',
    ]);
    expect(store.getState().snapshot.events).toHaveLength(1);
  });

  it('a change that introduces a conflict shows the ER4 warning instead of success', async () => {
    const { engine } = await makeEngine({
      events: [ev('Lecture', 'Mon 10:00', 'Mon 12:00'), ev('Gym', 'Mon 11:00', 'Mon 12:00')],
    });
    await engine.deleteEvent('Gym');
    const store = storeFor(engine);

    await store.getState().actions.undo();

    const [toast] = store.getState().toasts;
    expect(toast).toMatchObject({
      tone: 'warning',
      text: 'Saved with a conflict: overlaps "Lecture" 11:00–12:00 (1 h).',
    });
    expect(toast?.actions?.map((action) => action.label)).toEqual(['View conflict']);
    expect(store.getState().emphasisIds).toEqual(['Gym']);
  });

  it('the ER4 toast offers Move to the suggestion, which resolves the conflict', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Lecture', 'Mon 10:00', 'Mon 12:00'),
        ev('Meeting', 'Mon 14:00', 'Mon 15:00', {
          flexible: true,
          flexWindow: iv('Mon 09:00', 'Mon 18:00'),
        }),
      ],
    });
    const store = storeFor(engine);

    await store.getState().actions.applyAlternative('Meeting', iv('Mon 11:00', 'Mon 12:00'));

    const [warning] = store.getState().toasts;
    expect(warning?.tone).toBe('warning');
    expect(warning?.actions?.map((action) => action.label)).toEqual([
      'Move to Mon 2 Nov 12:00–13:00',
      'View conflict',
    ]);
    warning?.actions?.[0]?.run();
    await vi.waitFor(() => expect(store.getState().snapshot.conflicts).toEqual([]));
    expect(texts(store).at(-1)).toBe('Moved to Mon 2 Nov 12:00–13:00 — conflict resolved.');
    warning?.actions?.[1]?.run();
    expect(store.getState().emphasisIds).toEqual(['Meeting', 'Lecture']);
  });

  it('a storage failure shows a sticky error toast whose Retry runs the command again', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({ repo });
    await engine.createEvent({
      title: 'A',
      description: '',
      category: 'meeting',
      priority: 'medium',
      start: t('Mon 10:00'),
      end: t('Mon 11:00'),
      flexible: false,
      flexWindow: null,
    });
    const store = storeFor(engine);
    repo.failNextApply();

    const failed = await store.getState().actions.undo();

    expect(failed.ok).toBe(false);
    const [toast] = store.getState().toasts;
    expect(toast).toMatchObject({
      tone: 'error',
      sticky: true,
      text: "Couldn't save your change. Nothing was changed.",
    });
    expect(store.getState().snapshot.events).toHaveLength(1);
    toast?.actions?.[0]?.run();
    await vi.waitFor(() => expect(store.getState().snapshot.events).toHaveLength(0));
    store.getState().actions.dismissToast(toast?.id ?? '');
    expect(store.getState().toasts.map((entry) => entry.tone)).toEqual(['success']);
  });

  it('clears the emphasis after EMPHASIS_MS', async () => {
    vi.useFakeTimers();
    try {
      const { engine } = await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] });
      await engine.deleteEvent('A');
      const store = storeFor(engine);

      await store.getState().actions.undo();
      expect(store.getState().emphasisIds).toEqual(['A']);
      vi.advanceTimersByTime(EMPHASIS_MS);
      expect(store.getState().emphasisIds).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens and closes dialogs', async () => {
    const { engine } = await makeEngine();
    const store = storeFor(engine);

    store.getState().actions.openDialog({ kind: 'settings' });
    expect(store.getState().dialog).toEqual({ kind: 'settings' });
    store.getState().actions.closeDialog();
    expect(store.getState().dialog).toBeNull();
  });

  it('retryInit recovers from a failed start, and resetLocalData empties storage first', async () => {
    let failLoad = true;
    const inner = new MemoryRepository();
    await inner.replaceAll({
      events: [ev('A', 'Mon 10:00', 'Mon 11:00')],
      tasks: [],
      settings: (await makeEngine()).engine.snapshot().settings,
    });
    const repo: Repository = {
      load: async () => {
        if (failLoad) throw new Error('blocked');
        return inner.load();
      },
      apply: (changes) => inner.apply(changes),
      saveSettings: (settings) => inner.saveSettings(settings),
      replaceAll: (data) => inner.replaceAll(data),
    };
    const engine = createEngine({ repo, now: () => 0, newId: () => 'x' });
    const init = await engine.init();
    const reset = vi.fn(async () => {
      const settings = (await inner.load()).settings;
      if (settings !== null) await inner.replaceAll({ events: [], tasks: [], settings });
    });
    const store = createAppStore(engine, {
      storageWarning: false,
      init,
      now: () => 0,
      resetStorage: reset,
    });
    expect(store.getState().status).toBe('fatal');

    await store.getState().actions.retryInit();
    expect(store.getState().status).toBe('fatal');

    failLoad = false;
    await store.getState().actions.resetLocalData();
    expect(reset).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({ status: 'ready', fatalError: null });
    expect(store.getState().snapshot.events).toEqual([]);
  });

  it('resetLocalData stays fatal when emptying storage fails', async () => {
    const { engine } = await makeEngine();
    const store = createAppStore(engine, {
      storageWarning: false,
      init: { ok: false, error: { code: 'StorageError', message: 'x' } },
      now: () => 0,
      resetStorage: async () => {
        throw new Error('locked');
      },
    });

    await store.getState().actions.resetLocalData();

    expect(store.getState().status).toBe('fatal');
  });

  describe('task actions', () => {
    const WEEK: [string, string] = ['Mon 09:00', 'Fri 18:00'];
    const input = {
      name: 'Read',
      description: '',
      category: 'assignment' as const,
      priority: 'medium' as const,
      durationMin: 45,
      window: iv(...WEEK),
      useWorkingHours: true,
    };

    it('create, edit, unschedule and delete tasks with their toasts', async () => {
      const { engine } = await makeEngine({
        events: [
          ev('E', 'Mon 10:00', 'Mon 11:00', {
            taskId: 'S',
            flexible: true,
            flexWindow: iv(...WEEK),
          }),
        ],
        tasks: [task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' })],
      });
      const store = storeFor(engine);
      const { actions } = store.getState();

      await actions.createTask(input);
      await actions.updateTask('id-1', { ...input, name: 'Read more' });
      await actions.unscheduleTask('S');
      await actions.unscheduleTask('S');
      await actions.deleteTask('id-1');

      expect(texts(store)).toEqual([
        'Task created: "Read".',
        'Saved task "Read more".',
        'Unscheduled "S"; it is back in the task list.',
        'Deleted task "Read more".',
      ]);
      expect(store.getState().snapshot.tasks.map((entry) => entry.id)).toEqual(['S']);
    });

    it('changes the panel state and toggles the selection', async () => {
      const store = storeFor((await makeEngine()).engine);
      const { actions } = store.getState();

      actions.setTaskPanel({ sort: 'windowEnd', status: 'all' });
      actions.toggleTaskSelection('A');
      actions.toggleTaskSelection('B');
      actions.toggleTaskSelection('A');

      expect(store.getState().taskPanel).toMatchObject({
        sort: 'windowEnd',
        status: 'all',
        selectedIds: ['B'],
      });
    });

    it('openTaskPicker queues in BR-11 order, leaves out scheduled tasks and searches the first', async () => {
      const window: [string, string] = ['Mon 09:00', 'Mon 12:00'];
      const { engine } = await makeEngine({
        events: [
          ev('E', 'Mon 13:00', 'Mon 14:00', {
            taskId: 'S',
            flexible: true,
            flexWindow: iv(...WEEK),
          }),
        ],
        tasks: [
          task('L1', 60, window, { priority: 'low' }),
          task('H1', 60, window, { priority: 'high' }),
          task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' }),
        ],
      });
      const store = storeFor(engine);
      store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'H1' });

      store.getState().actions.openTaskPicker(['L1', 'H1', 'S']);

      const { picker, dialog } = store.getState();
      expect(dialog).toBeNull();
      expect(picker).toMatchObject({
        mode: 'task',
        queue: ['H1', 'L1'],
        index: 0,
        criterion: 'earliest',
        bufferMin: 0,
      });
      expect(picker?.result.ok && picker.result.value.options[0]?.slot).toEqual(
        iv('Mon 09:00', 'Mon 10:00'),
      );
      expect(texts(store)).toEqual(['1 selected task is already scheduled, so it was left out.']);
    });

    it('openTaskPicker does nothing more when every task was left out', async () => {
      const { engine } = await makeEngine({
        events: [
          ev('E', 'Mon 13:00', 'Mon 14:00', {
            taskId: 'S',
            flexible: true,
            flexWindow: iv(...WEEK),
          }),
        ],
        tasks: [task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' })],
      });
      const store = storeFor(engine);

      store.getState().actions.openTaskPicker(['S', 'missing']);

      expect(store.getState().picker).toBeNull();
      expect(texts(store)).toEqual([
        '2 selected tasks are already scheduled, so they were left out.',
      ]);
    });
  });
});
