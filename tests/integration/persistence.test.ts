// fake-indexeddb must be installed before Dexie is first imported.
import 'fake-indexeddb/auto';
import { DexieRepository } from '@/data/dexieRepository';
import { MemoryRepository } from '@/data/memoryRepository';
import type { Repository } from '@/data/repository';
import { createEngine, type Engine } from '@/engine';
import type { EventInput, MutationResult } from '@/shared/types';
import type { Result } from '@/shared/result';
import { iv } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';
import { t } from '../helpers/time';

let databaseCount = 0;

// PRE:  kind names an adapter
// POST: returns a fresh, empty repository of that kind
async function freshRepository(kind: 'memory' | 'dexie'): Promise<Repository> {
  databaseCount += 1;
  return kind === 'memory'
    ? new MemoryRepository()
    : DexieRepository.open(`calendar-persistence-${databaseCount}`);
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

// PRE:  result is a mutation result
// POST: returns its value; throws when it is an error, so the test stops at the failing step
function expectOk(result: Result<MutationResult>): MutationResult {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}`);
  }
  return result.value;
}

// PRE:  engine is initialised
// POST: returns the parts of its snapshot a reload must reproduce (history and version are not kept)
function reloadable(engine: Engine) {
  const { events, tasks, settings, conflicts } = engine.snapshot();
  return { events, tasks, settings, conflicts };
}

describe.each(['memory', 'dexie'] as const)('T13: Event CRUD with persistence (%s)', (kind) => {
  it('keeps the conflicts and the stored rows in step at every step, and reloads the same', async () => {
    const repo = await freshRepository(kind);
    const { engine } = await makeEngine({ repo });
    const rows = async () =>
      (await repo.load()).events.map(({ id, start, end }) => ({ id, start, end }));

    // (1) create A 10:00–11:00 and B 12:00–13:00
    expectOk(await engine.createEvent(input('A', 'Mon 10:00', 'Mon 11:00')));
    const created = expectOk(await engine.createEvent(input('B', 'Mon 12:00', 'Mon 13:00')));
    expect(created.snapshot.conflicts).toEqual([]);
    expect((await rows()).map((row) => row.id).toSorted()).toEqual(['id-1', 'id-2']);

    // (2) edit A's end to 11:30
    const edited = expectOk(await engine.updateEvent('id-1', input('A', 'Mon 10:00', 'Mon 11:30')));
    expect(edited.snapshot.conflicts).toEqual([]);
    expect((await rows()).find((row) => row.id === 'id-1')?.end).toBe(t('Mon 11:30'));

    // (3) move A to 12:30–13:30
    const moved = expectOk(await engine.moveEvent('id-1', iv('Mon 12:30', 'Mon 13:30')));
    expect(
      moved.snapshot.conflicts.map(({ key, overlap, minutes }) => ({ key, overlap, minutes })),
    ).toEqual([{ key: 'id-1|id-2', overlap: iv('Mon 12:30', 'Mon 13:00'), minutes: 30 }]);
    expect(moved.introducedConflicts).toHaveLength(1);

    // (4) delete B
    const deleted = expectOk(await engine.deleteEvent('id-2'));
    expect(deleted.snapshot.conflicts).toEqual([]);
    expect(deleted.resolvedConflicts).toHaveLength(1);
    expect(await rows()).toEqual([{ id: 'id-1', ...iv('Mon 12:30', 'Mon 13:30') }]);

    const reloaded = createEngine({ repo, now: () => t('Mon 00:00'), newId: () => 'unused' });
    expect((await reloaded.init()).ok).toBe(true);
    expect(reloadable(reloaded)).toEqual(reloadable(engine));
  });
});
