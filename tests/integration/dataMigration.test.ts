import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { DexieRepository } from '@/data/dexieRepository';
import { ConcurrentModificationError } from '@/data/repository';
import { createEngine } from '@/engine';
import { EXPORT_VERSION } from '@/shared/constants';
import { parseExportFile } from '@/shared/schemas';
import type { CalendarEvent, Settings, Task } from '@/shared/types';
import { makeEngine } from '../helpers/engine';
import { BASE_MONDAY } from '../helpers/time';

type LegacyEvent = Omit<CalendarEvent, 'category' | 'categoryId' | 'keptInBarred'> & {
  category: string;
};
type LegacyTask = Omit<Task, 'category' | 'categoryId' | 'doneAt'> & { category: string };
interface LegacyFixture {
  events: LegacyEvent[];
  tasks: LegacyTask[];
  settings: Omit<Settings, 'useWorkingHours'>;
}

const V1_JSON = readFileSync(new URL('../fixtures/export-v1.json', import.meta.url), 'utf8');
const V1 = JSON.parse(V1_JSON) as LegacyFixture;
const LEGACY_REVISION = 7;
const OVERLAP_OFFSET_MIN = 30;
const CATEGORY_ROWS = [
  { id: 'meeting', name: 'Meeting' },
  { id: 'class', name: 'Class' },
  { id: 'appointment', name: 'Appointment' },
  { id: 'assignment', name: 'Assignment' },
  { id: 'personal', name: 'Personal' },
];
const EXPECTED_CATEGORIES = expect.arrayContaining(
  CATEGORY_ROWS.map((category) =>
    expect.objectContaining({
      ...category,
      colour: expect.stringMatching(/^#[\da-f]{6}$/i),
      createdAt: expect.any(Number),
    }),
  ),
);
const NO_CHANGES = { putEvents: [], deleteEventIds: [], putTasks: [], deleteTaskIds: [] };

// PRE:  V1 is the checked-in v1 sample, with events, tasks and a Lunch barred slot
// POST: returns legacy records covering every enum category, linked and unscheduled tasks,
//       and overlapping plus duplicate barred slots, without changing the fixture
function legacyData(): LegacyFixture {
  const eventTemplate = V1.events[0] as LegacyEvent;
  const taskTemplate = V1.tasks[0] as LegacyTask;
  const linkedTask = { ...taskTemplate, status: 'scheduled' as const, scheduledEventId: 'linked' };
  const linkedEvent = {
    ...eventTemplate,
    id: 'linked',
    title: linkedTask.name,
    priority: linkedTask.priority,
    end: eventTemplate.start + linkedTask.durationMin,
    flexible: true,
    flexWindow: linkedTask.window,
    taskId: linkedTask.id,
  };
  const lunch = V1.settings.barredSlots[0] as Settings['barredSlots'][number];
  return {
    events: [
      ...CATEGORY_ROWS.map((category) => ({
        ...eventTemplate,
        id: category.id,
        category: category.id,
      })),
      linkedEvent,
    ],
    tasks: [linkedTask, ...V1.tasks.slice(1)],
    settings: {
      ...V1.settings,
      barredSlots: [
        lunch,
        { ...lunch, id: 'overlap', label: 'TT', startMin: lunch.startMin + OVERLAP_OFFSET_MIN },
        { ...lunch, id: 'duplicate', label: 'Same time' },
      ],
    },
  };
}

// PRE:  data holds valid legacy records; category is one of the original five enum values
// POST: returns the expected v3 event/task/settings rows, preserving every other field
function migratedRows(data: LegacyFixture) {
  return {
    events: data.events
      .map(({ category, ...event }) => ({ ...event, categoryId: category, keptInBarred: [] }))
      .toSorted((first, second) => first.id.localeCompare(second.id)),
    tasks: data.tasks
      .map(({ category, ...task }) => ({ ...task, categoryId: category, doneAt: null }))
      .toSorted((first, second) => first.id.localeCompare(second.id)),
    settings: { ...data.settings, useWorkingHours: true },
  };
}

describe('T48: data model v3 and export v2 (D-17)', () => {
  it('upgrades a populated v2 database without losing rows, overlaps, links or its revision', async () => {
    const name = 'round-2-v2-upgrade';
    const source = legacyData();
    const legacy = new Dexie(name);
    legacy.version(1).stores({ events: 'id, start, taskId', tasks: 'id, status', settings: 'key' });
    legacy.version(2).stores({ meta: 'key' });
    await legacy.open();
    await legacy.table('events').bulkPut(source.events);
    await legacy.table('tasks').bulkPut(source.tasks);
    await legacy.table('settings').put({ key: 'app', value: source.settings });
    await legacy.table('meta').put({ key: 'revision', value: LEGACY_REVISION });
    legacy.close();

    const upgraded = await DexieRepository.open(name);
    try {
      const loaded = await upgraded.load();
      expect(loaded).toEqual({
        ...migratedRows(source),
        categories: EXPECTED_CATEGORIES,
        revision: LEGACY_REVISION,
      });
      const engine = createEngine({
        repo: upgraded,
        now: () => BASE_MONDAY,
        newId: () => 'unused',
      });
      expect((await engine.init()).ok).toBe(true);
      expect(engine.snapshot()).toMatchObject({ categories: EXPECTED_CATEGORIES });
      await upgraded.apply(NO_CHANGES, LEGACY_REVISION);
      await expect(upgraded.apply(NO_CHANGES, LEGACY_REVISION)).rejects.toThrow(
        ConcurrentModificationError,
      );
      expect(await upgraded.load()).toEqual({ ...loaded, revision: LEGACY_REVISION + 1 });
    } finally {
      upgraded.close();
    }
  });

  it('imports the retained v1 fixture and re-exports it as v2 with seeded categories', async () => {
    const { engine } = await makeEngine();
    expect((await engine.importData(V1_JSON)).ok).toBe(true);
    const exported = JSON.parse(engine.exportData());
    expect(EXPORT_VERSION).toBe(2);
    expect(exported).toMatchObject({
      version: 2,
      categories: EXPECTED_CATEGORIES,
      settings: { useWorkingHours: true },
      events: V1.events.map(({ category, ...event }) => ({
        ...event,
        categoryId: category,
        keptInBarred: [],
      })),
      tasks: V1.tasks.map(({ category, ...task }) => ({
        ...task,
        categoryId: category,
        doneAt: null,
      })),
    });
  });

  it('keeps older overlapping slots on v1 import, including exact duplicates', () => {
    const source = legacyData();
    const parsed = parseExportFile(JSON.stringify({ ...JSON.parse(V1_JSON), ...source }));
    expect(parsed).toMatchObject({
      ok: true,
      value: { settings: { barredSlots: source.settings.barredSlots, useWorkingHours: true } },
    });
  });

  it('imports and persists v2 custom categories, done tasks, kept ids and the working-hours switch', async () => {
    const { engine, repo } = await makeEngine();
    const firstEvent = V1.events[0] as LegacyEvent;
    const firstTask = V1.tasks[0] as LegacyTask;
    const category = { id: 'custom', name: 'Research', colour: '#467b70', createdAt: BASE_MONDAY };
    const { category: eventCategory, ...event } = firstEvent;
    const { category: taskCategory, ...task } = firstTask;
    expect(eventCategory).toBeTruthy();
    expect(taskCategory).toBeTruthy();
    const file = {
      ...JSON.parse(V1_JSON),
      version: 2,
      categories: [category],
      events: [{ ...event, categoryId: category.id, keptInBarred: ['sparse-lunch'] }],
      tasks: [{ ...task, categoryId: category.id, status: 'done', doneAt: BASE_MONDAY }],
      settings: { ...V1.settings, useWorkingHours: false },
    };
    expect((await engine.importData(JSON.stringify(file))).ok).toBe(true);
    expect(await repo.load()).toMatchObject({
      categories: file.categories,
      events: file.events,
      tasks: file.tasks,
      settings: file.settings,
    });
    expect(JSON.parse(engine.exportData())).toMatchObject(file);
    const invalid = { ...file, events: [{ ...file.events[0], categoryId: 'missing' }] };
    expect(parseExportFile(JSON.stringify(invalid))).toMatchObject({
      ok: false,
      error: { code: 'InvalidImport', issues: [{ path: 'events.0.categoryId' }] },
    });
  });
});
