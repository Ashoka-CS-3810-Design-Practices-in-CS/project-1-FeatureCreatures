// In-memory Repository (TECH_SPEC §9.3): used by engine and integration tests and by degraded mode.
// Every value crossing the boundary is deep-copied so callers can never alias the stored rows.

import { DEFAULT_CATEGORIES, INITIAL_REVISION } from '@/shared/constants';
import type { CalendarEvent, Category, Settings, Task } from '@/shared/types';
import { requireRevision, type ChangeSet, type Repository, type StoredData } from './repository';

// PRE:  rows maps each row's id to that row; deleteIds and puts are already deep copies
// POST: every id in deleteIds is absent from rows, then every row of puts is stored under its id
//       (deletes before puts, matching DexieRepository.apply)
function applyToMap<T extends { id: string }>(
  rows: Map<string, T>,
  deleteIds: readonly string[],
  puts: readonly T[],
): void {
  // INVARIANT: every id of deleteIds visited so far is absent from rows
  for (const id of deleteIds) {
    rows.delete(id);
  }
  // POST: no id of deleteIds is in rows

  // INVARIANT: every row of puts visited so far is stored in rows under its id
  for (const row of puts) {
    rows.set(row.id, row);
  }
  // POST: every row of puts is stored in rows under its id
}

// PRE:  rows is an array of records with an id
// POST: returns a new Map from each row's id to that row
function mapById<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export class MemoryRepository implements Repository {
  private categories = mapById(structuredClone([...DEFAULT_CATEGORIES]));
  private events = new Map<string, CalendarEvent>();
  private tasks = new Map<string, Task>();
  private settings: Settings | null = null;
  private revision = INITIAL_REVISION;

  // PRE:  none
  // POST: resolves to deep copies of every stored event, task and the settings (null if never
  //       saved), with the stored revision
  async load(): Promise<StoredData> {
    return structuredClone({
      categories: [...this.categories.values()],
      events: [...this.events.values()],
      tasks: [...this.tasks.values()],
      settings: this.settings,
      revision: this.revision,
    });
  }

  // PRE:  changes holds well-formed rows (the engine validated them)
  // POST: when expectedRevision is the stored revision, the deletes and then the puts of a deep
  //       copy of changes are stored and the revision grows by 1; otherwise rejects with
  //       ConcurrentModificationError and stores nothing. Cannot fail midway, so it is atomic
  async apply(changes: ChangeSet, expectedRevision: number): Promise<void> {
    requireRevision(this.revision, expectedRevision);
    const copy = structuredClone(changes);
    applyToMap(this.events, copy.deleteEventIds, copy.putEvents);
    applyToMap(this.tasks, copy.deleteTaskIds, copy.putTasks);
    this.revision += 1;
  }

  // PRE:  settings satisfies settingsSchema
  // POST: when expectedRevision is the stored revision, a deep copy of settings is stored and the
  //       revision grows by 1; otherwise rejects with ConcurrentModificationError, storing nothing
  async saveSettings(settings: Settings, expectedRevision: number): Promise<void> {
    requireRevision(this.revision, expectedRevision);
    this.settings = structuredClone(settings);
    this.revision += 1;
  }

  // PRE:  data holds well-formed rows and settings
  // POST: when expectedRevision is the stored revision, the stored events, tasks and settings are
  //       exactly a deep copy of data and the revision grows by 1; otherwise rejects with
  //       ConcurrentModificationError, storing nothing
  async replaceAll(
    data: { events: CalendarEvent[]; tasks: Task[]; settings: Settings; categories: Category[] },
    expectedRevision: number,
  ): Promise<void> {
    requireRevision(this.revision, expectedRevision);
    const copy = structuredClone(data);
    this.categories = mapById(copy.categories);
    this.events = mapById(copy.events);
    this.tasks = mapById(copy.tasks);
    this.settings = copy.settings;
    this.revision += 1;
  }
}
