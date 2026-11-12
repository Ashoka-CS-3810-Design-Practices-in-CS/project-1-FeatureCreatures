// Self-tests for the helpers: the property tests are only as trustworthy as these oracles.

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '@/shared/constants';
import { ev, flexEv, iv, settings, task } from './builders';
import { FailingRepository } from './failingRepository';
import { bitmapGaps, bruteForceConflicts } from './oracle';
import { BASE_MONDAY, t } from './time';

const MS_PER_MINUTE = 60_000;
const HOUR = 60;

describe('t()', () => {
  it('maps base-week specs and explicit dates to minutes', () => {
    expect(BASE_MONDAY).toBe(Date.UTC(2026, 10, 2) / MS_PER_MINUTE);
    expect(t('Mon 10:30')).toBe(BASE_MONDAY + 10.5 * HOUR);
    expect(t('Sun 23:30')).toBe(BASE_MONDAY + 6 * 24 * HOUR + 23.5 * HOUR);
    expect(t('2026-11-01 09:00')).toBe(BASE_MONDAY - 15 * HOUR);
  });

  it('throws on a malformed spec', () => {
    expect(() => t('Monday 10:00')).toThrow('unrecognised');
  });
});

describe('builders', () => {
  it('apply the TEST_PLAN §2 defaults and overrides', () => {
    expect(ev('A', 'Mon 10:00', 'Mon 11:00', { priority: 'high' })).toMatchObject({
      title: 'A',
      categoryId: 'meeting',
      priority: 'high',
      flexible: false,
      start: t('Mon 10:00'),
    });
    expect(flexEv('S', 'Mon 11:00', 'Mon 12:00', ['Mon 09:00', 'Fri 18:00']).flexWindow).toEqual(
      iv('Mon 09:00', 'Fri 18:00'),
    );
    expect(task('R', 90, ['Mon 09:00', 'Fri 18:00'])).toMatchObject({
      name: 'R',
      categoryId: 'assignment',
      status: 'unscheduled',
      useWorkingHours: true,
    });
    expect(settings({ bufferMin: 15 })).toEqual({ ...DEFAULT_SETTINGS, bufferMin: 15 });
  });
});

describe('bruteForceConflicts', () => {
  it('finds T1 and ignores touching events (T2)', () => {
    expect(
      bruteForceConflicts([ev('A', 'Mon 10:00', 'Mon 11:30'), ev('B', 'Mon 11:00', 'Mon 12:00')]),
    ).toEqual([{ key: 'A|B', overlap: iv('Mon 11:00', 'Mon 11:30'), minutes: 30 }]);
    expect(
      bruteForceConflicts([ev('A', 'Mon 10:00', 'Mon 11:00'), ev('B', 'Mon 11:00', 'Mon 12:00')]),
    ).toEqual([]);
  });

  it('lists T3 in (overlap start, key) order', () => {
    const conflicts = bruteForceConflicts([
      ev('C', 'Mon 10:30', 'Mon 11:30'),
      ev('A', 'Mon 09:00', 'Mon 12:00'),
      ev('B', 'Mon 10:00', 'Mon 11:00'),
    ]);

    expect(conflicts.map((conflict) => [conflict.key, conflict.minutes])).toEqual([
      ['A|B', 60],
      ['A|C', 60],
      ['B|C', 30],
    ]);
  });
});

describe('bitmapGaps', () => {
  it('finds T6 free gaps', () => {
    const busy = [
      iv('Mon 09:00', 'Mon 10:00'),
      iv('Mon 10:30', 'Mon 12:00'),
      iv('Mon 13:00', 'Mon 14:00'),
    ];

    expect(bitmapGaps([iv('Mon 09:00', 'Mon 18:00')], busy, 0)).toEqual([
      iv('Mon 10:00', 'Mon 10:30'),
      iv('Mon 12:00', 'Mon 13:00'),
      iv('Mon 14:00', 'Mon 18:00'),
    ]);
  });

  it('applies the buffer around events only (T11 ii)', () => {
    expect(bitmapGaps([iv('Mon 09:00', 'Mon 12:00')], [iv('Mon 10:00', 'Mon 11:00')], 15)).toEqual([
      iv('Mon 09:00', 'Mon 09:45'),
      iv('Mon 11:15', 'Mon 12:00'),
    ]);
  });

  it('keeps gaps of separate segments apart and handles fully busy segments', () => {
    const segments = [iv('Mon 09:00', 'Mon 10:00'), iv('Mon 11:00', 'Mon 12:00')];

    expect(bitmapGaps(segments, [], 0)).toEqual(segments);
    expect(bitmapGaps(segments, [iv('Mon 08:00', 'Mon 13:00')], 0)).toEqual([]);
  });
});

describe('FailingRepository', () => {
  it('fails only the next apply and the next saveSettings', async () => {
    const repository = new FailingRepository();
    const changes = {
      putEvents: [ev('A', 'Mon 10:00', 'Mon 11:00')],
      deleteEventIds: [],
      putTasks: [],
      deleteTaskIds: [],
    };
    repository.failNextApply();
    repository.failNextSaveSettings();

    await expect(repository.apply(changes, 0)).rejects.toThrow('Simulated');
    await expect(repository.saveSettings(DEFAULT_SETTINGS, 0)).rejects.toThrow('Simulated');
    expect(await repository.load()).toEqual({
      categories: [...DEFAULT_CATEGORIES],
      events: [],
      tasks: [],
      settings: null,
      revision: 0,
    });

    await repository.apply(changes, 0);
    await repository.saveSettings(DEFAULT_SETTINGS, 1);
    await repository.replaceAll(
      { categories: [...DEFAULT_CATEGORIES], events: [], tasks: [], settings: DEFAULT_SETTINGS },
      2,
    );
    expect(await repository.load()).toEqual({
      categories: [...DEFAULT_CATEGORIES],
      events: [],
      tasks: [],
      settings: DEFAULT_SETTINGS,
      revision: 3,
    });
  });
});
