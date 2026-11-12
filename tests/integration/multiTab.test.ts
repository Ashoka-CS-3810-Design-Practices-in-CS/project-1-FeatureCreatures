// T41 — two tabs on one repository (peer report #14, WI-40). Each tab is its own engine; the
// stored revision makes a write from a tab with an out-of-date view fail with ER8 instead of
// silently overwriting the other tab's change.

import type { Repository } from '@/data/repository';
import { createEngine, type Engine } from '@/engine';
import { err } from '@/shared/result';
import type { EventInput } from '@/shared/types';
import { ev, iv, settings } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';
import { t } from '../helpers/time';

const CONCURRENT_MODIFICATION = err({ code: 'ConcurrentModification' });

// PRE:  title is non-empty; from and to are valid t() specs with from < to
// POST: returns a fixed medium meeting input over [t(from), t(to))
function meeting(title: string, from: string, to: string): EventInput {
  const { description, category, priority, start, end, flexible, flexWindow } = ev(title, from, to);
  return { title, description, category, priority, start, end, flexible, flexWindow };
}

// PRE:  repo already holds valid data
// POST: returns a second initialised engine ("tab") on repo, whose onCommit calls count commits
async function openTab(
  repo: Repository,
  onCommit: () => void = () => undefined,
): Promise<Engine> {
  const engine = createEngine({
    repo,
    now: () => t('Mon 00:00'),
    newId: () => crypto.randomUUID(),
    onCommit,
  });
  const init = await engine.init();
  if (!init.ok) {
    throw new Error(`openTab: init failed with ${init.error.code}`);
  }
  return engine;
}

describe('T41: two tabs on one repository', () => {
  it('rejects a move of an event another tab deleted with ER8, writing nothing', async () => {
    const { engine: tabA, repo } = await makeEngine({ events: [ev('Seminar', 'Mon 10:00', 'Mon 11:00')] });
    const tabB = await openTab(repo);

    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);
    const afterDelete = await repo.load();
    const moved = await tabB.moveEvent('Seminar', iv('Mon 12:00', 'Mon 13:00'));

    expect(moved).toEqual(CONCURRENT_MODIFICATION);
    expect(await repo.load()).toEqual(afterDelete);
    expect(afterDelete.events).toEqual([]);
    expect(tabB.snapshot().events.map((event) => event.id)).toEqual(['Seminar']);
  });

  it('reload adopts the other tab’s data, clears history and bumps the version', async () => {
    const { engine: tabA, repo } = await makeEngine({ events: [ev('Seminar', 'Mon 10:00', 'Mon 11:00')] });
    const tabB = await openTab(repo);
    expect((await tabB.createEvent(meeting('x', 'Tue 09:00', 'Tue 10:00'))).ok).toBe(true);
    await tabA.reload();
    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);
    const versionBefore = tabB.snapshot().version;

    const reloaded = await tabB.reload();

    expect(reloaded.ok && reloaded.value.events.map((event) => event.title)).toEqual(['x']);
    expect(tabB.snapshot()).toMatchObject({ canUndo: false, canRedo: false });
    expect(tabB.snapshot().version).toBe(versionBefore + 1);
    const stored = await repo.load();
    const undo = await tabB.undo();
    expect(undo.ok && undo.value.label).toBe('');
    expect(await repo.load()).toEqual(stored);
  });

  it('after a reload the tab writes again, and the first tab is now the stale one', async () => {
    const { engine: tabA, repo } = await makeEngine({ events: [ev('Seminar', 'Mon 10:00', 'Mon 11:00')] });
    const tabB = await openTab(repo);
    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);
    expect(await tabB.moveEvent('Seminar', iv('Mon 12:00', 'Mon 13:00'))).toEqual(
      CONCURRENT_MODIFICATION,
    );

    await tabB.reload();
    const created = await tabB.createEvent(meeting('Gym', 'Tue 18:00', 'Tue 19:00'));

    expect(created.ok).toBe(true);
    expect(await tabA.undo()).toEqual(CONCURRENT_MODIFICATION);
    expect((await repo.load()).events.map((event) => event.title)).toEqual(['Gym']);
  });

  it('settings saves and imports from a stale tab are rejected with ER8 too', async () => {
    const { engine: tabA, repo } = await makeEngine({ events: [ev('Seminar', 'Mon 10:00', 'Mon 11:00')] });
    const tabB = await openTab(repo);
    const exported = tabB.exportData();
    expect((await tabA.deleteEvent('Seminar')).ok).toBe(true);
    const stored = await repo.load();

    expect(await tabB.updateSettings(settings({ bufferMin: 15 }))).toEqual(CONCURRENT_MODIFICATION);
    expect(await tabB.importData(exported)).toEqual(CONCURRENT_MODIFICATION);
    expect(await repo.load()).toEqual(stored);
  });

  it('calls onCommit once per stored change, never for a failed or empty command', async () => {
    const { repo } = await makeEngine({ events: [ev('Seminar', 'Mon 10:00', 'Mon 11:00')] });
    let commits = 0;
    const tab = await openTab(repo, () => {
      commits += 1;
    });

    await tab.undo();
    await tab.deleteEvent('missing');
    expect(commits).toBe(0);
    await tab.deleteEvent('Seminar');
    await tab.undo();
    await tab.updateSettings(settings({ bufferMin: 15 }));
    await tab.importData(tab.exportData());
    expect(commits).toBe(4);
    await tab.reload();
    expect(commits).toBe(4);
  });
});
