// A ready-to-use engine over a seeded repository (TEST_PLAN §2), plus the unchanged-state check.

import { MemoryRepository } from '@/data/memoryRepository';
import type { Repository, StoredData } from '@/data/repository';
import { createEngine, type Engine } from '@/engine';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { CalendarEvent, Settings, Snapshot, Task } from '@/shared/types';
import { t } from './time';

export interface EngineOptions {
  events?: CalendarEvent[];
  tasks?: Task[];
  settings?: Settings;
  now?: string; // a t() spec; default 'Mon 00:00'
  repo?: Repository;
}

// PRE:  options holds valid records and a valid t() spec for now
// POST: seeds the repository (a new MemoryRepository unless given) via replaceAll, then returns an
//       initialised engine whose clock is fixed at t(now) and whose newId yields 'id-1', 'id-2', …;
//       throws if init fails, so a broken seed fails the test at once
export async function makeEngine(
  options: EngineOptions = {},
): Promise<{ engine: Engine; repo: Repository }> {
  const repo = options.repo ?? new MemoryRepository();
  await repo.replaceAll({
    events: options.events ?? [],
    tasks: options.tasks ?? [],
    settings: options.settings ?? DEFAULT_SETTINGS,
  });
  const now = t(options.now ?? 'Mon 00:00');
  let idCount = 0;
  const engine = createEngine({
    repo,
    now: () => now,
    newId: () => {
      idCount += 1;
      return `id-${idCount}`;
    },
  });
  const init = await engine.init();
  if (!init.ok) {
    throw new Error(`makeEngine: init failed with ${init.error.code}`);
  }
  return { engine, repo };
}

export interface EngineCapture {
  snapshot: Snapshot;
  stored: StoredData;
}

// PRE:  engine and repo belong together
// POST: returns a deep copy of the engine snapshot and the repository contents, for the
//       unchanged-state check (TEST_PLAN §4)
export async function capture(engine: Engine, repo: Repository): Promise<EngineCapture> {
  return structuredClone({ snapshot: engine.snapshot(), stored: await repo.load() });
}
