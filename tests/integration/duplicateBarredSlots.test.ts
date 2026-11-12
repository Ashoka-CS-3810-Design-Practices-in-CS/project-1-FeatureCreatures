// T44 — two barred slots with the same days and times are rejected (peer report #6, WI-43).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLES, type SampleId } from '@/data/samples';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from '@/shared/constants';
import { parseExportFile, parseInput, settingsSchema } from '@/shared/schemas';
import type { BarredSlot, Settings } from '@/shared/types';
import { BASE_MONDAY } from '../helpers/time';

const HOUR = 60;
const SAMPLE_FOLDER = join(process.cwd(), 'docs', 'samples');

// PRE:  id and label are non-empty; days are weekdays
// POST: returns a 13:00–14:00 barred slot with those fields
function lunch(id: string, label: string, days: BarredSlot['days']): BarredSlot {
  return { id, label, startMin: 13 * HOUR, endMin: 14 * HOUR, days };
}

// PRE:  barredSlots are barred slots
// POST: returns the default settings with them
function withSlots(barredSlots: BarredSlot[]): Settings {
  return { ...DEFAULT_SETTINGS, barredSlots };
}

describe('T44: duplicate barred slots', () => {
  it('rejects a slot with the same days, start and end as an earlier one, whatever its label', () => {
    const result = parseInput(
      settingsSchema,
      withSlots([lunch('a', 'Lunch', [1, 2, 3]), lunch('b', 'Break', [3, 1, 2])]),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'InvalidInput',
        issues: [{ path: 'barredSlots.1.days', message: 'Duplicate of barred slot 1.' }],
      },
    });
  });

  it('names the first copy for every later copy, and accepts slots that differ', () => {
    const copies = parseInput(
      settingsSchema,
      withSlots([
        lunch('a', 'Lunch', [1]),
        { ...lunch('b', 'Gym', [1]), endMin: 15 * HOUR },
        lunch('c', 'Lunch', [1]),
        lunch('d', 'Lunch', [1]),
      ]),
    );
    const differing = parseInput(
      settingsSchema,
      withSlots([
        lunch('a', 'Lunch', [1]),
        lunch('b', 'Lunch', [2]),
        { ...lunch('c', 'Lunch', [1]), startMin: 12 * HOUR },
      ]),
    );

    expect(copies.ok ? [] : copies.error).toMatchObject({
      issues: [
        { path: 'barredSlots.2.days', message: 'Duplicate of barred slot 1.' },
        { path: 'barredSlots.3.days', message: 'Duplicate of barred slot 1.' },
      ],
    });
    expect(differing.ok).toBe(true);
  });

  it('an import with duplicate slots is ER6 at that slot', () => {
    const file = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      categories: DEFAULT_CATEGORIES,
      exportedAt: '2026-11-02T08:00:00.000Z',
      events: [],
      tasks: [],
      settings: withSlots([lunch('a', 'Lunch', [1]), lunch('b', 'Lunch', [1])]),
    };

    expect(parseExportFile(JSON.stringify(file))).toEqual({
      ok: false,
      error: {
        code: 'InvalidImport',
        issues: [{ path: 'settings.barredSlots.1.days', message: 'Duplicate of barred slot 1.' }],
      },
    });
  });

  it('all six sample files in docs/samples and every built sample still import', () => {
    const files = readdirSync(SAMPLE_FOLDER).filter((name) => name.endsWith('.json'));
    expect(files).toHaveLength(6);

    // INVARIANT: every visited sample file parses as a valid export
    for (const name of files) {
      expect(parseExportFile(readFileSync(join(SAMPLE_FOLDER, name), 'utf8')).ok).toBe(true);
    }
    // POST: all six committed sample files still import

    // INVARIANT: every visited built sample parses as a valid export
    for (const id of Object.keys(SAMPLES) as SampleId[]) {
      const built = SAMPLES[id].build(BASE_MONDAY);
      expect(parseExportFile(JSON.stringify(built)).ok).toBe(true);
    }
    // POST: every sample the app can load still imports
  });
});
