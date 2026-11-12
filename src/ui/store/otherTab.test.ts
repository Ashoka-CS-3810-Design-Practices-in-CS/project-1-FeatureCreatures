// T41 (store): what a tab shows when another tab changed the stored data (WI-40, report #14).

import type { Repository } from '@/data/repository';
import { createEngine, type Engine } from '@/engine';
import { ev, iv, settings } from '../../../tests/helpers/builders';
import { makeEngine } from '../../../tests/helpers/engine';
import { t } from '../../../tests/helpers/time';
import { createAppStore, type AppStore } from './appStore';

const ER8_TEXT =
  'This changed in another tab — your view has been refreshed. Nothing was overwritten.';

// PRE:  engine is initialised
// POST: returns a ready store over engine at 'Mon 08:00' with no storage warning
function storeFor(engine: Engine): AppStore {
  return createAppStore(engine, {
    storageWarning: false,
    init: { ok: true, value: engine.snapshot() },
    now: () => t('Mon 08:00'),
    resetStorage: async () => undefined,
  });
}

// PRE:  repo already holds valid data
// POST: returns a second initialised engine on repo, as a second tab would have
async function secondTab(repo: Repository): Promise<Engine> {
  const engine = createEngine({ repo, now: () => t('Mon 08:00'), newId: () => 'tab-b-id' });
  await engine.init();
  return engine;
}

// PRE:  none
// POST: returns tab A's engine and tab B's store over one repository holding Seminar and Gym
async function twoTabs(): Promise<{ tabA: Engine; storeB: AppStore; repo: Repository }> {
  const { engine: tabA, repo } = await makeEngine({
    events: [ev('Seminar', 'Mon 10:00', 'Mon 11:00'), ev('Gym', 'Tue 18:00', 'Tue 19:00')],
  });
  return { tabA, storeB: storeFor(await secondTab(repo)), repo };
}

const titles = (store: AppStore) => store.getState().snapshot.events.map((event) => event.title);

describe('another tab changed the data', () => {
  it('a command rejected with ER8 reloads, says nothing was overwritten and offers no Retry', async () => {
    const { tabA, storeB, repo } = await twoTabs();
    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);
    const stored = await repo.load();

    const result = await storeB
      .getState()
      .actions.moveEvent('Seminar', iv('Mon 12:00', 'Mon 13:00'));

    expect(result).toEqual({ ok: false, error: { code: 'ConcurrentModification' } });
    expect(await repo.load()).toEqual(stored);
    expect(titles(storeB)).toEqual(['Gym']);
    const toasts = storeB.getState().toasts;
    expect(toasts).toEqual([expect.objectContaining({ tone: 'warning', text: ER8_TEXT })]);
    expect(toasts[0]?.actions).toBeUndefined();
  });

  it('settings saved from an out-of-date tab are refused and the view refreshed', async () => {
    const { tabA, storeB } = await twoTabs();
    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);

    await storeB.getState().actions.updateSettings(settings({ bufferMin: 15 }));

    expect(storeB.getState().snapshot.settings.bufferMin).toBe(0);
    expect(titles(storeB)).toEqual(['Gym']);
    expect(storeB.getState().toasts.map((toast) => toast.text)).toEqual([ER8_TEXT]);
  });

  it('reloadFromOtherTab adopts the stored data, clears undo and says so', async () => {
    const { tabA, storeB } = await twoTabs();
    await storeB.getState().actions.createEvent({
      title: 'Read',
      description: '',
      category: 'personal',
      priority: 'low',
      start: t('Wed 09:00'),
      end: t('Wed 10:00'),
      flexible: false,
      flexWindow: null,
    });
    expect(storeB.getState().snapshot.canUndo).toBe(true);
    await tabA.reload();
    expect((await tabA.deleteEvent('Gym')).ok).toBe(true);
    const versionBefore = storeB.getState().snapshot.version;

    await storeB.getState().actions.reloadFromOtherTab();

    expect(titles(storeB)).toEqual(['Seminar', 'Read']);
    expect(storeB.getState().snapshot).toMatchObject({ canUndo: false, canRedo: false });
    expect(storeB.getState().snapshot.version).toBe(versionBefore + 1);
    expect(storeB.getState().toasts.at(-1)).toMatchObject({
      tone: 'info',
      text: 'Calendar updated in another tab.',
    });
  });

  it('closes an edit dialog whose event or task another tab deleted, and keeps any other', async () => {
    const { tabA, storeB } = await twoTabs();
    const { actions } = storeB.getState();
    actions.openDialog({ kind: 'event', mode: 'edit', id: 'Seminar' });
    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);
    await actions.reloadFromOtherTab();
    expect(storeB.getState().dialog).toBeNull();

    actions.openDialog({ kind: 'event', mode: 'edit', id: 'Gym' });
    await actions.reloadFromOtherTab();
    expect(storeB.getState().dialog).toEqual({ kind: 'event', mode: 'edit', id: 'Gym' });

    actions.openDialog({ kind: 'task', mode: 'edit', id: 'gone' });
    await actions.reloadFromOtherTab();
    expect(storeB.getState().dialog).toBeNull();
  });

  it('a failed reload shows the storage error with Retry', async () => {
    const { tabA, repo } = await twoTabs();
    let failLoad = true;
    const flaky: Repository = {
      load: async () => {
        if (failLoad) throw new Error('blocked');
        return repo.load();
      },
      apply: (changes, revision) => repo.apply(changes, revision),
      saveSettings: (value, revision) => repo.saveSettings(value, revision),
      replaceAll: (data, revision) => repo.replaceAll(data, revision),
    };
    const engine = createEngine({ repo: flaky, now: () => 0, newId: () => 'x' });
    const store = storeFor(engine);
    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);

    await store.getState().actions.reloadFromOtherTab();
    const [toast] = store.getState().toasts;
    expect(toast).toMatchObject({ tone: 'error', sticky: true });
    failLoad = false;
    toast?.actions?.[0]?.run();
    await vi.waitFor(() => expect(titles(store)).toEqual(['Gym']));
  });
});
