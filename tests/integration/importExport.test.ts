import { MemoryRepository } from '@/data/memoryRepository';
import type { Repository } from '@/data/repository';
import { SAMPLES } from '@/data/samples';
import { createEngine } from '@/engine';
import type { Result } from '@/shared/result';
import type { CalendarEvent, ExportFile, Task } from '@/shared/types';
import { ev, flexEv, iv, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { BASE_MONDAY, t } from '../helpers/time';

const WEEK: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE:  result is any Result
// POST: returns its value; throws with the error otherwise, so the failing step is obvious
function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

// PRE:  result is any Result
// POST: returns the issue paths of an error that carries issues, otherwise []
function issuePaths(result: Result<unknown>): string[] {
  if (result.ok || !('issues' in result.error)) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path);
}

// PRE:  none
// POST: returns a valid export of four plain events and nothing else
function fourEvents(): ExportFile {
  return {
    ...SAMPLES.backToBack.build(BASE_MONDAY),
    events: [
      ev('A', 'Mon 09:00', 'Mon 10:00'),
      ev('B', 'Mon 10:00', 'Mon 11:00'),
      ev('C', 'Mon 11:00', 'Mon 12:00'),
      ev('D', 'Mon 12:00', 'Mon 13:00'),
    ],
  };
}

// PRE:  overrides change the linked event and/or task of a consistent scheduled pair
// POST: returns an export of task "Report" (60 min, window WEEK) scheduled as event E Mon 14:00,
//       with every BR-9 mirrored field equal unless overridden
function scheduledPair(
  eventOverrides: Partial<CalendarEvent> = {},
  taskOverrides: Partial<Task> = {},
): string {
  return JSON.stringify({
    ...fourEvents(),
    events: [
      flexEv('E', 'Mon 14:00', 'Mon 15:00', WEEK, {
        title: 'Report',
        taskId: 'T',
        ...eventOverrides,
      }),
    ],
    tasks: [
      task('T', 60, WEEK, {
        name: 'Report',
        status: 'scheduled',
        scheduledEventId: 'E',
        ...taskOverrides,
      }),
    ],
  });
}

describe('export / import (T25, B2, ER6)', () => {
  it('(a) a sample survives export and import into a fresh engine', async () => {
    const source = await makeEngine();
    expectOk(await source.engine.importData(JSON.stringify(SAMPLES.sparseWeek.build(BASE_MONDAY))));
    expectOk(
      await source.engine.createEvent({
        title: 'Extra',
        description: '',
        category: 'meeting',
        priority: 'medium',
        start: t('Fri 15:00'),
        end: t('Fri 16:00'),
        flexible: false,
        flexWindow: null,
      }),
    );
    const exported = source.engine.exportData();
    const target = await makeEngine();
    const versionBefore = target.engine.snapshot().version;

    const imported = expectOk(await target.engine.importData(exported));

    const original = source.engine.snapshot();
    expect(imported.events).toEqual(original.events);
    expect(imported.tasks).toEqual(original.tasks);
    expect(imported.settings).toEqual(original.settings);
    expect(imported.conflicts).toEqual(original.conflicts);
    expect(imported.version).toBe(versionBefore + 1);
    expect(imported.canUndo).toBe(false);
    expect(await target.repo.load()).toMatchObject({
      tasks: original.tasks,
      settings: original.settings,
    });
  });

  it('export is pretty-printed ExportFile JSON stamped with now', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 08:30',
      events: [ev('A', 'Mon 09:00', 'Mon 10:00')],
    });

    const text = engine.exportData();

    expect(text).toContain('\n  "format": "feature-creatures-calendar"');
    expect(JSON.parse(text)).toMatchObject({
      format: 'feature-creatures-calendar',
      version: 1,
      exportedAt: '2026-11-02T08:30:00.000Z',
      events: [{ id: 'A' }],
    });
  });

  it.each([
    ['not JSON', () => 'not json', ''],
    ['the wrong format', () => JSON.stringify({ ...fourEvents(), format: 'other' }), 'format'],
    [
      'events[3] ending before it starts',
      () => {
        const file = fourEvents();
        return JSON.stringify({
          ...file,
          events: file.events.map((event, index) =>
            index === 3 ? { ...event, end: event.start - 30 } : event,
          ),
        });
      },
      'events.3.end',
    ],
    [
      // AUDIT A02: these dates passed import, then crashed rendering and stayed saved.
      'events[0] at minutes beyond the supported dates',
      () => {
        const file = fourEvents();
        const unsafe = { start: Number.MAX_SAFE_INTEGER - 60, end: Number.MAX_SAFE_INTEGER };
        return JSON.stringify({
          ...file,
          events: file.events.map((event, index) =>
            index === 0 ? { ...event, ...unsafe } : event,
          ),
        });
      },
      'events.0.start',
    ],
    [
      'two events with the same id',
      () => {
        const file = fourEvents();
        return JSON.stringify({
          ...file,
          events: [
            ...file.events,
            { ...file.events[0], start: t('Tue 09:00'), end: t('Tue 10:00') },
          ],
        });
      },
      'events',
    ],
    [
      'a scheduled task whose event is missing',
      () =>
        JSON.stringify({
          ...fourEvents(),
          tasks: [task('T', 60, WEEK, { status: 'scheduled', scheduledEventId: 'gone' })],
        }),
      'tasks.0.scheduledEventId',
    ],
    [
      'an event naming a task that is not scheduled as it',
      () =>
        JSON.stringify({
          ...fourEvents(),
          events: [flexEv('E', 'Mon 14:00', 'Mon 15:00', WEEK, { taskId: 'T' })],
          tasks: [task('T', 60, WEEK)],
        }),
      'events.0.taskId',
    ],
    // AUDIT A04: BR-9's mirrored fields, and a scheduled task's event staying flexible.
    [
      'a scheduled task whose event has another name',
      () => scheduledPair({ title: 'Original' }),
      'tasks.0.scheduledEventId',
    ],
    [
      'a scheduled task whose event has another priority',
      () => scheduledPair({ priority: 'high' }),
      'tasks.0.scheduledEventId',
    ],
    [
      'a scheduled task whose event has another length',
      () => scheduledPair({}, { durationMin: 120 }),
      'tasks.0.scheduledEventId',
    ],
    [
      'a scheduled task whose event has another window',
      () => scheduledPair({ flexWindow: iv('Mon 09:00', 'Tue 18:00') }),
      'tasks.0.scheduledEventId',
    ],
    [
      'a scheduled task whose event is fixed',
      () => scheduledPair({ flexible: false, flexWindow: null }),
      'tasks.0.scheduledEventId',
    ],
  ])('(b) %s is InvalidImport and changes nothing', async (_case, text, path) => {
    const { engine, repo } = await makeEngine({ events: [ev('Keep', 'Mon 09:00', 'Mon 10:00')] });
    expectOk(
      await engine.createEvent({
        title: 'History',
        description: '',
        category: 'meeting',
        priority: 'medium',
        start: t('Mon 11:00'),
        end: t('Mon 12:00'),
        flexible: false,
        flexWindow: null,
      }),
    );
    const before = await capture(engine, repo);

    const result = await engine.importData(text());

    expect(result.ok ? null : result.error.code).toBe('InvalidImport');
    expect(issuePaths(result)).toContain(path);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('accepts a scheduled task whose event mirrors it (BR-9)', async () => {
    const { engine } = await makeEngine();

    const snapshot = expectOk(await engine.importData(scheduledPair()));

    expect(snapshot.tasks.map((entry) => entry.status)).toEqual(['scheduled']);
  });

  it('import clears the history and the last replan plan', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Lecture', 'Mon 10:00', 'Mon 12:00'),
        flexEv('Study', 'Mon 11:00', 'Mon 12:00', WEEK),
      ],
    });
    const plan = expectOk(engine.planReplan({ range: iv('Mon 00:00', 'Sat 00:00') }));

    expectOk(await engine.importData(JSON.stringify(fourEvents())));

    expect(engine.snapshot()).toMatchObject({ canUndo: false, canRedo: false });
    expect(
      await engine.applyReplan({ baseVersion: engine.snapshot().version, planId: 'balanced' }),
    ).toEqual({
      ok: false,
      error: { code: 'StaleResult' },
    });
    expect(plan.movableCount).toBe(1);
  });

  it('a failing replaceAll is StorageError and changes nothing', async () => {
    const inner = new MemoryRepository();
    const repo: Repository = {
      load: () => inner.load(),
      apply: (changes, revision) => inner.apply(changes, revision),
      saveSettings: (settings, revision) => inner.saveSettings(settings, revision),
      replaceAll: async () => {
        throw new Error('disk full');
      },
    };
    const engine = createEngine({ repo, now: () => 0, newId: () => 'x' });
    expectOk(await engine.init());
    const before = await capture(engine, repo);

    const result = await engine.importData(JSON.stringify(fourEvents()));

    expect(result).toEqual({ ok: false, error: { code: 'StorageError', message: 'disk full' } });
    expect(await capture(engine, repo)).toEqual(before);
  });
});

describe('init and stored links', () => {
  it('reports StorageError when a stored event has dates beyond the supported range (A02)', async () => {
    const repo = new MemoryRepository();
    const keep = ev('Keep', 'Mon 09:00', 'Mon 10:00');
    await repo.replaceAll(
      {
        events: [{ ...keep, start: Number.MAX_SAFE_INTEGER - 60, end: Number.MAX_SAFE_INTEGER }],
        tasks: [],
        settings: SAMPLES.backToBack.build(BASE_MONDAY).settings,
      },
      0,
    );
    const engine = createEngine({ repo, now: () => 0, newId: () => 'x' });

    expect(await engine.init()).toEqual({
      ok: false,
      error: { code: 'StorageError', message: 'Saved data is damaged.' },
    });
  });

  it('reports StorageError when stored task ↔ event links are broken', async () => {
    const repo = new MemoryRepository();
    await repo.replaceAll(
      {
        events: [],
        tasks: [task('T', 60, WEEK, { status: 'scheduled', scheduledEventId: 'gone' })],
        settings: SAMPLES.backToBack.build(BASE_MONDAY).settings,
      },
      0,
    );
    const engine = createEngine({ repo, now: () => 0, newId: () => 'x' });

    expect(await engine.init()).toEqual({
      ok: false,
      error: { code: 'StorageError', message: 'Saved data is damaged.' },
    });
  });
});
