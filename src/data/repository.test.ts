import { DEFAULT_CATEGORIES } from '@/shared/constants';
// fake-indexeddb must be installed before Dexie is first imported.
import 'fake-indexeddb/auto';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { CalendarEvent, Settings, Task } from '@/shared/types';
import { DexieRepository } from './dexieRepository';
import { MemoryRepository } from './memoryRepository';
import type { ChangeSet, Repository, StoredData } from './repository';

// PRE:  id is non-empty; start < end are integer minutes
// POST: returns a fixed medium-priority meeting [start, end) with that id (WI-07 adds shared builders)
function event(id: string, start: number, end: number): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    categoryId: 'meeting',
    priority: 'medium',
    start,
    end,
    flexible: false,
    flexWindow: null,
    taskId: null,
    keptInBarred: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

// PRE:  id is non-empty
// POST: returns an unscheduled 60-minute task with that id and a window of [0, 600)
function task(id: string): Task {
  return {
    id,
    name: id,
    description: '',
    categoryId: 'assignment',
    priority: 'medium',
    durationMin: 60,
    window: { start: 0, end: 600 },
    useWorkingHours: true,
    status: 'unscheduled',
    doneAt: null,
    scheduledEventId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

// PRE:  overrides holds any subset of ChangeSet's fields
// POST: returns a ChangeSet with those fields and empty arrays elsewhere
function changeSet(overrides: Partial<ChangeSet>): ChangeSet {
  return { putEvents: [], deleteEventIds: [], putTasks: [], deleteTaskIds: [], ...overrides };
}

// PRE:  first and second have distinct ids
// POST: returns < 0 if first.id sorts before second.id, otherwise > 0
function compareById(first: { id: string }, second: { id: string }): number {
  return first.id < second.id ? -1 : 1;
}

// PRE:  data was returned by Repository.load
// POST: returns data with events and tasks sorted by id, so adapters with different row orders compare equal
function byId(data: StoredData): StoredData {
  return {
    categories: data.categories.toSorted(compareById),
    events: data.events.toSorted(compareById),
    tasks: data.tasks.toSorted(compareById),
    settings: data.settings,
    revision: data.revision,
  };
}

let databaseCounter = 0;

// PRE:  none
// POST: opens a DexieRepository on a database name no other test uses
async function openFreshDexie(): Promise<DexieRepository> {
  databaseCounter += 1;
  return DexieRepository.open(`calendar-test-${databaseCounter}`);
}

const adapters: [string, () => Promise<Repository>][] = [
  ['MemoryRepository', async () => new MemoryRepository()],
  ['DexieRepository', openFreshDexie],
];

describe.each(adapters)('%s (Repository contract)', (_name, openRepository) => {
  const lectureA = event('a', 600, 660);
  const meetingB = event('b', 720, 780);
  const lunch: Settings = {
    ...DEFAULT_SETTINGS,
    barredSlots: [{ id: 'l', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
  };

  it('T53: settings and automatically cleared event metadata share one revision-checked write', async () => {
    const repository = await openRepository();
    const kept = { ...lectureA, keptInBarred: ['l'] };
    await repository.apply(changeSet({ putEvents: [kept, meetingB] }), 0);
    await repository.saveSettings(lunch, 1, [{ ...kept, keptInBarred: [] }]);
    const stored = await repository.load();
    expect(stored.revision).toBe(2);
    expect(stored.settings).toEqual(lunch);
    expect(stored.events).toEqual(
      expect.arrayContaining([{ ...kept, keptInBarred: [] }, meetingB]),
    );
    await expect(repository.saveSettings(DEFAULT_SETTINGS, 1, [kept])).rejects.toThrow();
    expect(await repository.load()).toEqual(stored);
  });

  it('starts empty, with no settings', async () => {
    const repository = await openRepository();

    expect(await repository.load()).toEqual({
      categories: [...DEFAULT_CATEGORIES],
      events: [],
      tasks: [],
      settings: null,
      revision: 0,
    });
  });

  it('round-trips puts, updates and deletes from apply', async () => {
    const repository = await openRepository();
    await repository.apply(
      changeSet({ putEvents: [lectureA, meetingB], putTasks: [task('t')] }),
      0,
    );
    const movedA = { ...lectureA, start: 630, end: 690 };
    await repository.apply(changeSet({ putEvents: [movedA], deleteEventIds: ['b'] }), 1);

    expect(byId(await repository.load())).toEqual({
      categories: [...DEFAULT_CATEGORIES],
      events: [movedA],
      tasks: [task('t')],
      settings: null,
      revision: 2,
    });
  });

  it('deletes tasks and ignores deleting a missing id', async () => {
    const repository = await openRepository();
    await repository.apply(changeSet({ putTasks: [task('t1'), task('t2')] }), 0);
    await repository.apply(changeSet({ deleteTaskIds: ['t1', 'missing'] }), 1);

    expect((await repository.load()).tasks).toEqual([task('t2')]);
  });

  it('saves and reloads settings', async () => {
    const repository = await openRepository();
    await repository.saveSettings(lunch, 0);

    expect((await repository.load()).settings).toEqual(lunch);
  });

  it('replaceAll swaps every table for the new data', async () => {
    const repository = await openRepository();
    await repository.apply(changeSet({ putEvents: [lectureA], putTasks: [task('old')] }), 0);
    await repository.saveSettings(DEFAULT_SETTINGS, 1);
    await repository.replaceAll(
      {
        categories: [...DEFAULT_CATEGORIES],
        events: [meetingB],
        tasks: [task('new')],
        settings: lunch,
      },
      2,
    );

    expect(byId(await repository.load())).toEqual({
      categories: [...DEFAULT_CATEGORIES],
      events: [meetingB],
      tasks: [task('new')],
      settings: lunch,
      revision: 3,
    });
  });

  it('does not alias caller data on apply or load', async () => {
    const repository = await openRepository();
    const changes = changeSet({ putEvents: [{ ...lectureA }] });
    await repository.apply(changes, 0);
    (changes.putEvents[0] as { title: string }).title = 'mutated after apply';
    const loaded = await repository.load();
    (loaded.events[0] as { title: string }).title = 'mutated after load';

    expect((await repository.load()).events[0]?.title).toBe('a');
  });

  it('T49: category puts/deletes share the record transaction and reject stale revisions', async () => {
    const repository = await openRepository();
    const category = { id: 'research', name: 'Research', colour: '#577d35', createdAt: 0 };
    await repository.apply(
      changeSet({
        putCategories: [category],
        putEvents: [{ ...lectureA, categoryId: category.id }],
      }),
      0,
    );
    expect((await repository.load()).categories).toContainEqual(category);
    const before = await repository.load();
    await expect(
      repository.apply(
        changeSet({ deleteCategoryIds: [category.id], deleteEventIds: [lectureA.id] }),
        0,
      ),
    ).rejects.toThrow();
    expect(await repository.load()).toEqual(before);
    await repository.apply(
      changeSet({ deleteCategoryIds: [category.id], deleteEventIds: [lectureA.id] }),
      1,
    );
    expect((await repository.load()).categories).toEqual(DEFAULT_CATEGORIES);
    expect((await repository.load()).events).toEqual([]);
  });
});

describe('DexieRepository (IndexedDB specifics)', () => {
  // A row without its primary key makes bulkPut throw inside the transaction.
  const keyless = { ...event('x', 0, 1), id: undefined } as unknown as CalendarEvent;

  it('T53: a failing automatic keep-clear rolls back settings and the claimed revision', async () => {
    const repository = await openFreshDexie();
    await repository.saveSettings(DEFAULT_SETTINGS, 0);
    const before = await repository.load();
    await expect(
      repository.saveSettings({ ...DEFAULT_SETTINGS, bufferMin: 10 }, 1, [keyless]),
    ).rejects.toThrow();
    expect(await repository.load()).toEqual(before);
  });

  it('apply is atomic: a failing put rolls back the deletes before it', async () => {
    const repository = await openFreshDexie();
    await repository.apply(changeSet({ putEvents: [event('a', 0, 60)] }), 0);

    await expect(
      repository.apply(changeSet({ deleteEventIds: ['a'], putEvents: [keyless] }), 1),
    ).rejects.toThrow();
    expect((await repository.load()).events.map((row) => row.id)).toEqual(['a']);
  });

  it('T49: a later event failure rolls back category edits and the revision too', async () => {
    const repository = await openFreshDexie();
    const before = await repository.load();
    await expect(
      repository.apply(
        changeSet({
          deleteCategoryIds: ['meeting'],
          putCategories: [{ id: 'research', name: 'Research', colour: '#577d35', createdAt: 0 }],
          putEvents: [keyless],
        }),
        0,
      ),
    ).rejects.toThrow();
    expect(await repository.load()).toEqual(before);
  });

  it('replaceAll is atomic: a failing put keeps the old data', async () => {
    const repository = await openFreshDexie();
    await repository.apply(changeSet({ putEvents: [event('a', 0, 60)] }), 0);

    await expect(
      repository.replaceAll(
        {
          categories: [...DEFAULT_CATEGORIES],
          events: [keyless],
          tasks: [],
          settings: DEFAULT_SETTINGS,
        },
        1,
      ),
    ).rejects.toThrow();
    expect(await repository.load()).toEqual({
      categories: [...DEFAULT_CATEGORIES],
      events: [event('a', 0, 60)],
      tasks: [],
      settings: null,
      revision: 1,
    });
  });

  it('persists across close and reopen of the same database', async () => {
    const name = 'calendar-test-reopen';
    const first = await DexieRepository.open(name);
    await first.apply(changeSet({ putEvents: [event('a', 0, 60)] }), 0);
    await first.saveSettings(DEFAULT_SETTINGS, 1);
    first.close();
    const reopened = await DexieRepository.open(name);

    expect(await reopened.load()).toEqual({
      categories: [...DEFAULT_CATEGORIES],
      events: [event('a', 0, 60)],
      tasks: [],
      settings: DEFAULT_SETTINGS,
      revision: 2,
    });
  });
});
