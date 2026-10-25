import { MemoryRepository } from '@/data/memoryRepository';
import type { Repository } from '@/data/repository';
import { createEngine } from '@/engine';
import { DEFAULT_SETTINGS, MINUTES_PER_HOUR } from '@/shared/constants';
import type { EventInput } from '@/shared/types';
import { ev, flexEv, iv, settings, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { FailingRepository } from '../helpers/failingRepository';
import { t } from '../helpers/time';

const WEEK: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE:  overrides holds any subset of EventInput fields (possibly invalid ones)
// POST: returns a valid fixed medium meeting 'A' over Mon 10:00–11:00, with overrides applied
function input(overrides: Partial<EventInput> = {}): EventInput {
  return {
    title: 'A',
    description: '',
    category: 'meeting',
    priority: 'medium',
    start: t('Mon 10:00'),
    end: t('Mon 11:00'),
    flexible: false,
    flexWindow: null,
    ...overrides,
  };
}

describe('createEvent validation (T5, facade level, ER1)', () => {
  it.each([
    [
      '(a) end before start',
      { end: t('Mon 09:00') },
      'InvalidTime',
      'end',
      'End time must be after the start time.',
    ],
    ['(b) start = end', { end: t('Mon 10:00') }, 'InvalidTime', 'end', undefined],
    [
      '(c) a 25 h event',
      { end: t('Tue 11:00') },
      'InvalidTime',
      'end',
      'Events can be at most 24 hours long.',
    ],
    ['(d) a blank title', { title: '   ' }, 'InvalidInput', 'title', undefined],
    ['(e) flexible without a window', { flexible: true }, 'InvalidInput', 'flexWindow', undefined],
    [
      '(f) a 30 min window for a 60 min event',
      { flexible: true, flexWindow: iv('Mon 10:00', 'Mon 10:30') },
      'InvalidTime',
      'flexWindow',
      undefined,
    ],
  ])('%s fails and changes nothing', async (_case, overrides, code, path, message) => {
    const { engine, repo } = await makeEngine({ events: [ev('X', 'Mon 14:00', 'Mon 15:00')] });
    const before = await capture(engine, repo);

    const result = await engine.createEvent(input(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(code);
    expect(result.error).toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ path })]),
    });
    if (message !== undefined) {
      expect(result.error).toMatchObject({
        issues: expect.arrayContaining([{ path, message }]),
      });
    }
    expect(await capture(engine, repo)).toEqual(before);
  });
});

describe('Event CRUD', () => {
  it('createEvent stores a new event with a fresh id, timestamps and an undo label', async () => {
    const { engine, repo } = await makeEngine({ now: 'Mon 08:00' });

    const result = await engine.createEvent(input({ title: '  Standup  ' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.value.snapshot.events[0];
    expect(created).toMatchObject({
      id: 'id-1',
      title: 'Standup',
      taskId: null,
      createdAt: t('Mon 08:00'),
      updatedAt: t('Mon 08:00'),
    });
    expect(result.value).toMatchObject({
      label: 'Create "Standup"',
      changedEventIds: ['id-1'],
      suggestion: null,
    });
    expect(result.value.snapshot).toMatchObject({
      version: 1,
      canUndo: true,
      undoLabel: 'Create "Standup"',
    });
    expect((await repo.load()).events).toEqual([created]);
  });

  it('T21: a move into a conflict succeeds and suggests the nearest free slot (ER4)', async () => {
    const lecture = ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' });
    const meeting = flexEv('Meeting', 'Mon 14:00', 'Mon 15:00', ['Mon 09:00', 'Mon 18:00']);
    const { engine } = await makeEngine({ events: [lecture, meeting] });

    const result = await engine.moveEvent('Meeting', iv('Mon 11:00', 'Mon 12:00'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot.events.find((event) => event.id === 'Meeting')).toMatchObject(
      iv('Mon 11:00', 'Mon 12:00'),
    );
    expect(result.value.label).toBe('Move "Meeting"');
    expect(
      result.value.introducedConflicts.map(({ key, overlap, minutes }) => ({
        key,
        overlap,
        minutes,
      })),
    ).toEqual([{ key: 'Lecture|Meeting', overlap: iv('Mon 11:00', 'Mon 12:00'), minutes: 60 }]);
    expect(result.value.suggestion?.slot).toEqual(iv('Mon 12:00', 'Mon 13:00'));
  });

  it('updateEvent and deleteEvent report NotFound for an unknown id and change nothing', async () => {
    const { engine, repo } = await makeEngine();
    const before = await capture(engine, repo);

    expect(await engine.updateEvent('nope', input())).toEqual({
      ok: false,
      error: { code: 'NotFound', entity: 'event', id: 'nope' },
    });
    expect((await engine.moveEvent('nope', iv('Mon 10:00', 'Mon 11:00'))).ok).toBe(false);
    expect((await engine.deleteEvent('nope')).ok).toBe(false);
    expect(await capture(engine, repo)).toEqual(before);
  });

  describe('a task-linked event (BR-9)', () => {
    const linkedTask = task('T', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' });
    const linkedEvent = flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { taskId: 'T' });

    it('editing it stays flexible and mirrors name, priority, duration and window into the task', async () => {
      const { engine, repo } = await makeEngine({ events: [linkedEvent], tasks: [linkedTask] });

      const result = await engine.updateEvent(
        'E',
        input({ title: 'Essay', priority: 'high', end: t('Mon 11:30'), flexible: false }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.snapshot.events[0]).toMatchObject({
        title: 'Essay',
        flexible: true,
        flexWindow: iv(...WEEK),
      });
      expect(result.value.snapshot.tasks[0]).toMatchObject({
        name: 'Essay',
        priority: 'high',
        durationMin: 90,
        window: iv(...WEEK),
        status: 'scheduled',
      });
      expect((await repo.load()).tasks[0]?.durationMin).toBe(90);
    });

    it('rejects an edit that would make the mirrored task invalid, changing nothing', async () => {
      const { engine, repo } = await makeEngine({ events: [linkedEvent], tasks: [linkedTask] });
      const before = await capture(engine, repo);

      const result = await engine.moveEvent('E', iv('Mon 10:00', 'Mon 10:03'));

      expect(result.ok ? null : result.error.code).toBe('InvalidInput');
      expect(await capture(engine, repo)).toEqual(before);
    });

    it('deleting it unschedules the task in the same change', async () => {
      const { engine, repo } = await makeEngine({ events: [linkedEvent], tasks: [linkedTask] });

      const result = await engine.deleteEvent('E');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({ label: 'Delete "E"', changedEventIds: [] });
      expect(result.value.snapshot.events).toEqual([]);
      expect(result.value.snapshot.tasks[0]).toMatchObject({
        status: 'unscheduled',
        scheduledEventId: null,
      });
      expect((await repo.load()).tasks[0]?.status).toBe('unscheduled');
    });
  });

  it('serialises mutations, so two quick moves apply in order', async () => {
    const { engine } = await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] });

    const [first, second] = await Promise.all([
      engine.moveEvent('A', iv('Mon 12:00', 'Mon 13:00')),
      engine.moveEvent('A', iv('Mon 14:00', 'Mon 15:00')),
    ]);

    expect(first.ok && first.value.snapshot.version).toBe(1);
    expect(second.ok && second.value.snapshot.version).toBe(2);
    expect(engine.snapshot().events[0]).toMatchObject(iv('Mon 14:00', 'Mon 15:00'));
  });
});

describe('storage failures (T26, ER5)', () => {
  it('a failed createEvent changes nothing, and the next one succeeds', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({ repo });
    const before = await capture(engine, repo);
    repo.failNextApply();

    const failed = await engine.createEvent(input());

    expect(failed.ok ? null : failed.error.code).toBe('StorageError');
    expect(await capture(engine, repo)).toEqual(before);
    expect((await engine.createEvent(input())).ok).toBe(true);
  });

  it('a failed updateSettings keeps the old settings', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({ repo });
    repo.failNextSaveSettings();

    const failed = await engine.updateSettings(settings({ bufferMin: 15 }));

    expect(failed.ok ? null : failed.error.code).toBe('StorageError');
    expect(engine.snapshot().settings).toEqual(DEFAULT_SETTINGS);
    expect((await repo.load()).settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('updateSettings', () => {
  it('saves valid settings and bumps the version without a history entry', async () => {
    const { engine, repo } = await makeEngine();
    const next = settings({ bufferMin: 15 });

    const result = await engine.updateSettings(next);

    expect(result.ok && result.value).toMatchObject({ version: 1, settings: next, canUndo: false });
    expect((await repo.load()).settings).toEqual(next);
  });

  it('rejects invalid settings and changes nothing', async () => {
    const { engine, repo } = await makeEngine();
    const before = await capture(engine, repo);

    const result = await engine.updateSettings(settings({ workEndMin: 8 * MINUTES_PER_HOUR }));

    expect(result.ok ? null : result.error.code).toBe('InvalidTime');
    expect(await capture(engine, repo)).toEqual(before);
  });
});

describe('init', () => {
  // PRE:  load is the repository's load behaviour
  // POST: returns a Repository whose writes succeed and do nothing
  function repoWith(load: Repository['load']): Repository {
    return {
      load,
      apply: async () => undefined,
      saveSettings: async () => undefined,
      replaceAll: async () => undefined,
    };
  }

  it('saves the default settings on first run', async () => {
    const repo = new MemoryRepository();
    const engine = createEngine({ repo, now: () => 0, newId: () => 'x' });

    const result = await engine.init();

    expect(result.ok && result.value.settings).toEqual(DEFAULT_SETTINGS);
    expect((await repo.load()).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('sorts loaded events and detects their conflicts', async () => {
    const { engine } = await makeEngine({
      events: [ev('B', 'Mon 11:00', 'Mon 12:00'), ev('A', 'Mon 10:00', 'Mon 11:30')],
    });

    expect(engine.snapshot().events.map((event) => event.id)).toEqual(['A', 'B']);
    expect(engine.snapshot().conflicts.map((conflict) => conflict.key)).toEqual(['A|B']);
  });

  it('reports StorageError when loading fails or the stored data is damaged', async () => {
    const blocked = createEngine({
      repo: repoWith(async () => {
        throw new Error('blocked');
      }),
      now: () => 0,
      newId: () => 'x',
    });
    const damaged = createEngine({
      repo: repoWith(async () => ({
        events: [ev('A', 'Mon 11:00', 'Mon 10:00')],
        tasks: [],
        settings: null,
      })),
      now: () => 0,
      newId: () => 'x',
    });

    expect(await blocked.init()).toEqual({
      ok: false,
      error: { code: 'StorageError', message: 'blocked' },
    });
    expect(await damaged.init()).toEqual({
      ok: false,
      error: { code: 'StorageError', message: 'Saved data is damaged.' },
    });
  });

  it('reports StorageError when saving the first-run settings fails', async () => {
    const engine = createEngine({
      repo: {
        ...repoWith(async () => ({ events: [], tasks: [], settings: null })),
        saveSettings: async () => {
          throw new Error('quota');
        },
      },
      now: () => 0,
      newId: () => 'x',
    });

    expect(await engine.init()).toEqual({
      ok: false,
      error: { code: 'StorageError', message: 'quota' },
    });
  });
});

describe('methods of later work items', () => {
  it('throw a clear error until they are built', async () => {
    const { engine } = await makeEngine();

    expect(() => engine.findSlots({ taskId: 'T' })).toThrow('Not implemented until WI-14');
  });
});
