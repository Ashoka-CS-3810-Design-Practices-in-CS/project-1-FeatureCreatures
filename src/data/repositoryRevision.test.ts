// fake-indexeddb must be installed before Dexie is first imported.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { CalendarEvent, Settings, Task } from '@/shared/types';
import { DexieRepository } from './dexieRepository';
import { MemoryRepository } from './memoryRepository';
import { ConcurrentModificationError, type ChangeSet, type Repository } from './repository';

// The stored revision of the multi-tab check (WI-40, TECH_SPEC §9.1).

const NO_CHANGES: ChangeSet = { putEvents: [], deleteEventIds: [], putTasks: [], deleteTaskIds: [] };

// PRE:  id is non-empty; start < end are integer minutes
// POST: returns a fixed medium-priority meeting [start, end) with that id
function event(id: string, start: number, end: number): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    category: 'meeting',
    priority: 'medium',
    start,
    end,
    flexible: false,
    flexWindow: null,
    taskId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const seminarTask: Task = {
  id: 't',
  name: 'Report',
  description: '',
  category: 'assignment',
  priority: 'high',
  durationMin: 60,
  window: { start: 0, end: 600 },
  useWorkingHours: true,
  status: 'unscheduled',
  scheduledEventId: null,
  createdAt: 0,
  updatedAt: 0,
};

const lunch: Settings = {
  ...DEFAULT_SETTINGS,
  barredSlots: [{ id: 'l', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
};

let databaseCounter = 0;

// PRE:  none
// POST: returns a database name no other test uses
function freshName(): string {
  databaseCounter += 1;
  return `calendar-revision-test-${databaseCounter}`;
}

const adapters: [string, () => Promise<Repository>][] = [
  ['MemoryRepository', async () => new MemoryRepository()],
  ['DexieRepository', () => DexieRepository.open(freshName())],
];

describe.each(adapters)('%s (stored revision)', (_name, openRepository) => {
  it('starts at revision 0 and every write adds one', async () => {
    const repository = await openRepository();
    expect((await repository.load()).revision).toBe(0);

    await repository.apply({ ...NO_CHANGES, putEvents: [event('a', 0, 60)] }, 0);
    await repository.saveSettings(lunch, 1);
    await repository.replaceAll({ events: [], tasks: [], settings: DEFAULT_SETTINGS }, 2);

    expect((await repository.load()).revision).toBe(3);
  });

  it('rejects each write with ConcurrentModificationError when the revision differs, storing nothing', async () => {
    const repository = await openRepository();
    await repository.apply({ ...NO_CHANGES, putEvents: [event('a', 0, 60)] }, 0);
    const stored = await repository.load();

    await expect(repository.apply({ ...NO_CHANGES, deleteEventIds: ['a'] }, 0)).rejects.toThrow(
      ConcurrentModificationError,
    );
    await expect(repository.saveSettings(lunch, 0)).rejects.toThrow(ConcurrentModificationError);
    await expect(
      repository.replaceAll({ events: [], tasks: [], settings: lunch }, 2),
    ).rejects.toThrow(ConcurrentModificationError);
    expect(await repository.load()).toEqual(stored);
  });
});

describe('DexieRepository revision across connections (two tabs)', () => {
  it('a second connection with an old revision cannot overwrite the first one’s write', async () => {
    const name = freshName();
    const tabA = await DexieRepository.open(name);
    const tabB = await DexieRepository.open(name);
    await tabA.apply({ ...NO_CHANGES, putEvents: [event('Seminar', 0, 60)] }, 0);
    const seenByB = (await tabB.load()).revision;
    await tabA.apply({ ...NO_CHANGES, deleteEventIds: ['Seminar'] }, seenByB);

    await expect(
      tabB.apply({ ...NO_CHANGES, putEvents: [event('Seminar', 120, 180)] }, seenByB),
    ).rejects.toThrow(ConcurrentModificationError);
    expect(await tabA.load()).toEqual({ events: [], tasks: [], settings: null, revision: 2 });
    tabA.close();
    tabB.close();
  });
});

describe('DexieRepository upgrade from schema version 1', () => {
  it('keeps the events, tasks and settings of a version-1 database and starts at revision 0', async () => {
    const name = freshName();
    // The exact version-1 schema that shipped before WI-40.
    const legacy = new Dexie(name);
    legacy.version(1).stores({ events: 'id, start, taskId', tasks: 'id, status', settings: 'key' });
    await legacy.open();
    await legacy.table('events').bulkPut([event('Seminar', 600, 660), event('Gym', 720, 780)]);
    await legacy.table('tasks').put(seminarTask);
    await legacy.table('settings').put({ key: 'app', value: lunch });
    legacy.close();

    const upgraded = await DexieRepository.open(name);
    const loaded = await upgraded.load();

    expect(loaded.events.map((row) => row.id).toSorted()).toEqual(['Gym', 'Seminar']);
    expect(loaded.events.find((row) => row.id === 'Seminar')).toEqual(event('Seminar', 600, 660));
    expect(loaded.tasks).toEqual([seminarTask]);
    expect(loaded.settings).toEqual(lunch);
    expect(loaded.revision).toBe(0);
    await upgraded.apply({ ...NO_CHANGES, deleteEventIds: ['Gym'] }, 0);
    expect((await upgraded.load()).revision).toBe(1);
    upgraded.close();
  });
});
