// Six events that all overlap one another on Wednesday, so every pair conflicts: 6 · 5 / 2 = 15.

import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExportFile, Minute } from '@/shared/types';
import { exportFileOf, sampleEvent, span } from './build';

const WEDNESDAY = 2;

// Every span contains 11:00–11:05, so each pair overlaps.
const CLUSTER: [string, string][] = [
  ['10:00', '12:00'],
  ['10:15', '11:45'],
  ['10:30', '11:30'],
  ['10:45', '11:15'],
  ['11:00', '11:30'],
  ['10:00', '11:05'],
];

// PRE:  weekMonday is a local Monday midnight
// POST: returns the overlap-cluster sample: 6 mutually overlapping events on Wednesday (15 conflicts)
export function buildOverlapCluster(weekMonday: Minute): ExportFile {
  const events = CLUSTER.map(([from, to], index) =>
    sampleEvent(
      `cluster-${index + 1}`,
      `Overlap ${index + 1}`,
      span(weekMonday, WEDNESDAY, from, to),
      weekMonday,
    ),
  );
  return exportFileOf({ events, tasks: [], settings: DEFAULT_SETTINGS }, weekMonday);
}
