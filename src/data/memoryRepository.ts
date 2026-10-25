// In-memory Repository (TECH_SPEC §9.3): used by engine and integration tests and by degraded mode.
// Every value crossing the boundary is deep-copied so callers can never alias the stored rows.

import type { CalendarEvent, Settings, Task } from '@/shared/types';
import type { ChangeSet, Repository, StoredData } from './repository';

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
  private events = new Map<string, CalendarEvent>();
  private tasks = new Map<string, Task>();
  private settings: Settings | null = null;

  // PRE:  none
  // POST: resolves to deep copies of every stored event, task and the settings (null if never saved)
  async load(): Promise<StoredData> {
    return structuredClone({
      events: [...this.events.values()],
      tasks: [...this.tasks.values()],
      settings: this.settings,
    });
  }

  // PRE:  changes holds well-formed rows (the engine validated them)
  // POST: the deletes and then the puts of a deep copy of changes are stored; cannot fail midway,
  //       so it is trivially atomic
  async apply(changes: ChangeSet): Promise<void> {
    const copy = structuredClone(changes);
    applyToMap(this.events, copy.deleteEventIds, copy.putEvents);
    applyToMap(this.tasks, copy.deleteTaskIds, copy.putTasks);
  }

  // PRE:  settings satisfies settingsSchema
  // POST: a deep copy of settings is stored
  async saveSettings(settings: Settings): Promise<void> {
    this.settings = structuredClone(settings);
  }

  // PRE:  data holds well-formed rows and settings
  // POST: the stored events, tasks and settings are exactly a deep copy of data
  async replaceAll(data: {
    events: CalendarEvent[];
    tasks: Task[];
    settings: Settings;
  }): Promise<void> {
    const copy = structuredClone(data);
    this.events = mapById(copy.events);
    this.tasks = mapById(copy.tasks);
    this.settings = copy.settings;
  }
}
