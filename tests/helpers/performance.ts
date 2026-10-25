import { buildStress } from '@/data/samples/stress';
import type { Engine } from '@/engine';
import { detectConflicts } from '@/engine/algorithms/sweep';
import type { Result } from '@/shared/result';
import type { CalendarEvent, SlotSearchResult } from '@/shared/types';
import { task } from './builders';
import { makeEngine } from './engine';
import { BASE_MONDAY } from './time';

const PERFORMANCE_SEED = 7;
const TASK_ID = 'performance-task';
const TASK_DURATION_MIN = 60;
const FIRST_FOUR_WEEKS: [string, string] = ['Mon 00:00', '2026-11-30 00:00'];

export interface PerformanceFixture {
  engine: Engine;
  events: readonly CalendarEvent[];
  taskId: string;
}

export interface PerformanceQueryResult {
  conflictCount: number;
  search: Result<SlotSearchResult>;
}

// PRE:  test process runs with TZ=UTC
// POST: returns T15's sorted 5,000-event seed-7 fixture and a 60-min task over the first four weeks;
//       generation, validation and engine initialization finish before timing begins
export async function createPerformanceFixture(): Promise<PerformanceFixture> {
  const sample = buildStress(BASE_MONDAY, PERFORMANCE_SEED);
  const { engine } = await makeEngine({
    events: [...sample.events],
    tasks: [task(TASK_ID, TASK_DURATION_MIN, FIRST_FOUR_WEEKS)],
  });
  return { engine, events: engine.snapshot().events, taskId: TASK_ID };
}

// PRE:  fixture comes from createPerformanceFixture and has not been mutated
// POST: runs one full conflict sweep and one facade slot search, returning k and the search result
export function runPerformanceQuery(fixture: PerformanceFixture): PerformanceQueryResult {
  const conflicts = detectConflicts(fixture.events);
  const search = fixture.engine.findSlots({ taskId: fixture.taskId });
  return { conflictCount: conflicts.length, search };
}
