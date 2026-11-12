import type { Engine } from '@/engine';
import { DEFAULT_CATEGORIES, MINUTES_PER_HOUR } from '@/shared/constants';
import type { Result } from '@/shared/result';
import type { Category, MutationResult } from '@/shared/types';
import { ev, task } from '../helpers/builders';
import { capture, makeEngine, type EngineOptions } from '../helpers/engine';
import { FailingRepository } from '../helpers/failingRepository';
import { BASE_MONDAY, t } from '../helpers/time';

type CategoryInput = Pick<Category, 'name' | 'colour'>;
interface CategoryCommands {
  // PRE:  input contains user-entered name and colour strings, not yet validated
  // POST: creates a valid unique category as one atomic undoable mutation, or returns an error
  createCategory(input: CategoryInput): Promise<Result<MutationResult>>;
  // PRE:  id is any category id; input contains unvalidated name and colour strings
  // POST: updates that category as one undoable mutation, or returns a validation/NotFound error
  updateCategory(id: string, input: CategoryInput): Promise<Result<MutationResult>>;
  // PRE:  id is any category id
  // POST: deletes an unused category as one undoable mutation, or returns CategoryInUse/NotFound
  deleteCategory(id: string): Promise<Result<MutationResult>>;
}

const RESEARCH: Category = {
  id: 'research',
  name: 'Research',
  colour: '#577d35',
  createdAt: BASE_MONDAY,
};
const READING: Category = {
  id: 'reading',
  name: 'Reading',
  colour: '#7e6ac0',
  createdAt: BASE_MONDAY,
};
const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE:  options supplies consistent stored records, as makeEngine requires
// POST: returns the fixture with the planned WI-49 command signatures for test-first execution
//       before the facade implements them; remove this local interface/cast when it does
async function categoryEngine(options: EngineOptions = {}) {
  const fixture = await makeEngine(options);
  return { ...fixture, engine: fixture.engine as Engine & CategoryCommands };
}

describe('T49: category commands (D-11)', () => {
  it('creates a trimmed category with an engine id/time, persisted as one undo step', async () => {
    const { engine, repo } = await categoryEngine({ now: 'Mon 08:00' });
    const created = await engine.createCategory({ name: '  Research  ', colour: '#577D35' });

    expect(created).toMatchObject({
      ok: true,
      value: {
        label: 'Create category "Research"',
        changedEventIds: [],
        introducedConflicts: [],
        resolvedConflicts: [],
      },
    });
    const expected = { ...RESEARCH, id: 'id-1', createdAt: t('Mon 08:00') };
    expect(engine.snapshot().categories).toHaveLength(DEFAULT_CATEGORIES.length + 1);
    expect(engine.snapshot().categories).toContainEqual(expected);
    expect((await repo.load()).categories).toContainEqual(expected);
    expect(engine.snapshot()).toMatchObject({ canUndo: true, canRedo: false });

    expect((await engine.undo()).ok).toBe(true);
    expect(engine.snapshot().categories).toEqual(DEFAULT_CATEGORIES);
    expect((await repo.load()).categories).toEqual(DEFAULT_CATEGORIES);
    expect((await engine.redo()).ok).toBe(true);
    expect((await repo.load()).categories).toContainEqual(expected);
  });

  it('renames and recolours a used category by id without rewriting its events or tasks', async () => {
    const event = ev('E', 'Mon 09:00', 'Mon 10:00', { categoryId: RESEARCH.id });
    const todo = task('T', MINUTES_PER_HOUR, WINDOW, { categoryId: RESEARCH.id });
    const { engine, repo } = await categoryEngine({
      categories: [RESEARCH],
      events: [event],
      tasks: [todo],
    });
    expect(
      (await engine.updateCategory(RESEARCH.id, { name: 'Projects', colour: READING.colour })).ok,
    ).toBe(true);
    const updated = { ...RESEARCH, name: 'Projects', colour: READING.colour };
    expect(engine.snapshot().categories).toEqual([updated]);
    expect(engine.snapshot().events).toEqual([event]);
    expect(engine.snapshot().tasks).toEqual([todo]);
    expect((await repo.load()).categories).toEqual([updated]);
    expect((await engine.undo()).ok).toBe(true);
    expect(engine.snapshot().categories).toEqual([RESEARCH]);
    expect((await engine.redo()).ok).toBe(true);
    expect(engine.snapshot().categories).toEqual([updated]);
  });

  it('blocks deleting a used category, counting every event and open/done task without writing', async () => {
    const { engine, repo } = await categoryEngine({
      categories: [RESEARCH],
      events: [
        ev('E1', 'Mon 09:00', 'Mon 10:00', { categoryId: RESEARCH.id }),
        ev('E2', 'Tue 09:00', 'Tue 10:00', { categoryId: RESEARCH.id }),
      ],
      tasks: [
        task('T1', MINUTES_PER_HOUR, WINDOW, { categoryId: RESEARCH.id }),
        task('T2', MINUTES_PER_HOUR, WINDOW, {
          categoryId: RESEARCH.id,
          status: 'done',
          doneAt: BASE_MONDAY,
        }),
      ],
    });
    const before = await capture(engine, repo);
    expect(await engine.deleteCategory(RESEARCH.id)).toEqual({
      ok: false,
      error: { code: 'CategoryInUse', eventCount: 2, taskCount: 2 },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('allows deleting the last unused category and restores it on undo and redo', async () => {
    const { engine, repo } = await categoryEngine({ categories: [RESEARCH] });
    expect((await engine.deleteCategory(RESEARCH.id)).ok).toBe(true);
    expect(engine.snapshot().categories).toEqual([]);
    expect((await repo.load()).categories).toEqual([]);
    expect((await engine.undo()).ok).toBe(true);
    expect(engine.snapshot().categories).toEqual([RESEARCH]);
    expect((await repo.load()).categories).toEqual([RESEARCH]);
    expect((await engine.redo()).ok).toBe(true);
    expect((await repo.load()).categories).toEqual([]);
  });

  it('rejects names already used ignoring case on create and rename, without writing', async () => {
    const { engine, repo } = await categoryEngine({ categories: [RESEARCH, READING] });
    const before = await capture(engine, repo);
    const expected = {
      ok: false,
      error: {
        code: 'InvalidInput',
        issues: [{ path: 'name', message: 'A category with this name already exists.' }],
      },
    };
    expect(await engine.createCategory({ name: '  RESEARCH  ', colour: '#427e8c' })).toEqual(
      expected,
    );
    expect(
      await engine.updateCategory(READING.id, { name: 'research', colour: READING.colour }),
    ).toEqual(expected);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it.each(['#577D35', '#577d36'])(
    'rejects a duplicate or perceptually adjacent colour %s',
    async (colour) => {
      const { engine, repo } = await categoryEngine({ categories: [RESEARCH] });
      const before = await capture(engine, repo);
      expect(await engine.createCategory({ name: 'Reading', colour })).toMatchObject({
        ok: false,
        error: { code: 'InvalidInput', issues: [{ path: 'colour' }] },
      });
      expect(await capture(engine, repo)).toEqual(before);
    },
  );

  it('allows retaining the same category colour and frees a swatch after recolouring', async () => {
    const { engine } = await categoryEngine({ categories: [RESEARCH] });
    expect(
      (await engine.updateCategory(RESEARCH.id, { name: 'Projects', colour: RESEARCH.colour })).ok,
    ).toBe(true);
    expect(
      (await engine.updateCategory(RESEARCH.id, { name: 'Projects', colour: READING.colour })).ok,
    ).toBe(true);
    expect((await engine.createCategory({ name: 'Research', colour: RESEARCH.colour })).ok).toBe(
      true,
    );
    expect(
      engine
        .snapshot()
        .categories.map((category) => category.colour)
        .toSorted(),
    ).toEqual([RESEARCH.colour, READING.colour].toSorted());
  });

  it('returns NotFound for an absent category instead of writing a new record', async () => {
    const { engine, repo } = await categoryEngine();
    const before = await capture(engine, repo);
    const expected = { ok: false, error: { code: 'NotFound', entity: 'category', id: 'missing' } };
    expect(
      await engine.updateCategory('missing', { name: 'Research', colour: RESEARCH.colour }),
    ).toEqual(expected);
    expect(await engine.deleteCategory('missing')).toEqual(expected);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('rolls back a failed category write with no state or history change', async () => {
    const repo = new FailingRepository();
    const { engine } = await categoryEngine({ repo });
    const before = await capture(engine, repo);
    repo.failNextApply();
    expect(
      await engine.createCategory({ name: RESEARCH.name, colour: RESEARCH.colour }),
    ).toMatchObject({
      ok: false,
      error: { code: 'StorageError' },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });
});
