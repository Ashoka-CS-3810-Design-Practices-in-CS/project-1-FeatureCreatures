import { detectConflicts } from '@/engine/algorithms/sweep';
import { compareEvents } from '@/engine/algorithms/sortedArray';
import { parseExportFile } from '@/shared/schemas';
import type { ExportFile } from '@/shared/types';
import { iv } from '../../../tests/helpers/builders';
import { BASE_MONDAY, t } from '../../../tests/helpers/time';
import { at } from './build';
import { SAMPLES, type SampleId } from './index';
import { mulberry32, nextInt } from './prng';
import { buildStress, STRESS_WEEKS } from './stress';

const STRESS_EVENT_COUNT = 5000;
const RANDOM_DRAWS = 1000;

// PRE:  file is an ExportFile
// POST: returns its conflict keys, as the engine would detect them
function conflictKeys(file: ExportFile): string[] {
  return detectConflicts(file.events.toSorted(compareEvents)).map((conflict) => conflict.key);
}

const build = (id: SampleId) => SAMPLES[id].build(BASE_MONDAY);

describe('samples (TECH_SPEC §9.5)', () => {
  it.each(Object.keys(SAMPLES) as SampleId[])('%s is a valid export file', (id) => {
    expect(parseExportFile(JSON.stringify(build(id))).ok).toBe(true);
  });

  it('sparseWeek: 8 events, one conflict (Tue Lecture ↔ Meeting), lunch barred, 4 tasks', () => {
    const file = build('sparseWeek');

    expect(file.events).toHaveLength(8);
    expect(conflictKeys(file)).toEqual(['sparse-lecture|sparse-meeting']);
    expect(file.events.find((event) => event.id === 'sparse-lecture')).toMatchObject({
      ...iv('Tue 10:00', 'Tue 11:30'),
      flexible: false,
      priority: 'high',
    });
    expect(file.events.filter((event) => event.flexible).map((event) => event.title)).toEqual([
      'Meeting',
      'Study',
    ]);
    expect(file.settings.barredSlots).toEqual([
      expect.objectContaining({
        label: 'Lunch',
        startMin: 780,
        endMin: 840,
        days: [1, 2, 3, 4, 5],
      }),
    ]);
    expect(
      file.tasks.map(({ name, durationMin, priority }) => ({ name, durationMin, priority })),
    ).toEqual([
      { name: 'Write report', durationMin: 90, priority: 'high' },
      { name: 'Read chapter 4', durationMin: 45, priority: 'medium' },
      { name: 'Gym', durationMin: 60, priority: 'low' },
      { name: 'Thesis draft', durationMin: 600, priority: 'medium' },
    ]);
  });

  it('backToBack: 8 touching hours Mon 09:00–17:00 and no conflicts', () => {
    const file = build('backToBack');

    expect(file.events).toHaveLength(8);
    expect(file.events[0]).toMatchObject({ start: t('Mon 09:00') });
    expect(file.events.at(-1)).toMatchObject({ end: t('Mon 17:00') });
    expect(conflictKeys(file)).toEqual([]);
  });

  it('overlapCluster: 6 events on Wednesday giving 15 conflicts', () => {
    const file = build('overlapCluster');

    expect(file.events).toHaveLength(6);
    expect(conflictKeys(file)).toHaveLength(15);
  });

  it('fullyBooked: Thursday is free only at 12:00–12:15, with a 30 min task', () => {
    const file = build('fullyBooked');

    expect(file.events.map(({ start, end }) => ({ start, end }))).toEqual([
      iv('Thu 09:00', 'Thu 10:30'),
      iv('Thu 10:30', 'Thu 12:00'),
      iv('Thu 12:15', 'Thu 14:00'),
      iv('Thu 14:00', 'Thu 18:00'),
    ]);
    expect(file.tasks).toEqual([
      expect.objectContaining({ durationMin: 30, window: iv('Thu 09:00', 'Thu 18:00') }),
    ]);
  });

  it('midnight: the T4 pair, conflicting after midnight', () => {
    const file = build('midnight');

    expect(file.events.map(({ start, end }) => ({ start, end }))).toEqual([
      iv('Mon 23:00', 'Tue 01:00'),
      iv('Tue 00:30', 'Tue 01:30'),
    ]);
    expect(conflictKeys(file)).toHaveLength(1);
  });

  it(`stress: ${STRESS_EVENT_COUNT} events over ${STRESS_WEEKS} weeks, the same every run, few conflicts`, () => {
    const first = build('stress');
    const second = build('stress');

    expect(first.events).toHaveLength(STRESS_EVENT_COUNT);
    expect(second.events).toEqual(first.events);
    expect(new Set(first.events.map((event) => event.id)).size).toBe(STRESS_EVENT_COUNT);
    expect(conflictKeys(first).length).toBeLessThan(STRESS_EVENT_COUNT / 10);
  });

  it('at() rejects a malformed time', () => {
    expect(() => at(BASE_MONDAY, 0, '9:00')).toThrow('Bad sample time');
  });

  it('reuses the stress generator with T15 seed 7 without changing the default sample', () => {
    const benchmark = buildStress(BASE_MONDAY, 7);
    expect(benchmark.events).toHaveLength(STRESS_EVENT_COUNT);
    expect(benchmark.events).toEqual(buildStress(BASE_MONDAY, 7).events);
    expect(benchmark.events).not.toEqual(build('stress').events);
  });
});

describe('mulberry32', () => {
  it('repeats its sequence for a seed and stays in [0, 1); nextInt stays in bounds', () => {
    const first = mulberry32(7);
    const second = mulberry32(7);
    const draws: number[] = [];

    // INVARIANT: draws holds the first drawIndex values of the seed-7 sequence, each matched twice
    for (let drawIndex = 0; drawIndex < RANDOM_DRAWS; drawIndex += 1) {
      const value = first();
      expect(second()).toBe(value);
      draws.push(value);
    }
    // POST: both generators produced the same RANDOM_DRAWS values

    expect(draws.every((value) => value >= 0 && value < 1)).toBe(true);
    const ints = draws.map(() => nextInt(first, 20, 60));
    expect(Math.min(...ints)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...ints)).toBeLessThanOrEqual(60);
  });
});
