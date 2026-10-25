// IndexedDB Repository via Dexie (TECH_SPEC §9.2). Multi-table writes run in one 'rw' transaction,
// so a failure anywhere rolls back everything (the atomicity Repository requires).

import Dexie, { type Table } from 'dexie';
import type { CalendarEvent, Settings, Task } from '@/shared/types';
import type { ChangeSet, Repository, StoredData } from './repository';

const SETTINGS_KEY = 'app';

interface SettingsRow {
  key: typeof SETTINGS_KEY;
  value: Settings;
}

class CalendarDb extends Dexie {
  // `declare` instead of `!`: a class field would be re-initialised to undefined after super(),
  // wiping the tables Dexie attaches in version().stores().
  declare events: Table<CalendarEvent, string>;
  declare tasks: Table<Task, string>;
  declare settings: Table<SettingsRow, string>;

  // PRE:  name is a non-empty database name
  // POST: creates (but does not open) the database with schema version 1
  constructor(name: string) {
    super(name);
    // Schema changes need this.version(2).stores(...).upgrade(...); never edit version 1 in place.
    this.version(1).stores({ events: 'id, start, taskId', tasks: 'id, status', settings: 'key' });
  }
}

export class DexieRepository implements Repository {
  private readonly db: CalendarDb;

  // PRE:  db is open
  // POST: wraps db; use DexieRepository.open to construct
  private constructor(db: CalendarDb) {
    this.db = db;
  }

  // PRE:  name is a non-empty database name
  // POST: resolves to a repository on the opened database; rejects if IndexedDB is unavailable
  //       (the composition root then falls back to MemoryRepository — degraded mode)
  static async open(name: string): Promise<DexieRepository> {
    const db = new CalendarDb(name);
    await db.open();
    return new DexieRepository(db);
  }

  // PRE:  none
  // POST: closes the database connection; the repository must not be used afterwards
  close(): void {
    this.db.close();
  }

  // PRE:  the database is open
  // POST: resolves to every stored event and task, and the settings (null if never saved), read
  //       in one consistent transaction
  async load(): Promise<StoredData> {
    const { events, tasks, settings } = this.db;
    return this.db.transaction('r', events, tasks, settings, async () => {
      const [storedEvents, storedTasks, settingsRow] = await Promise.all([
        events.toArray(),
        tasks.toArray(),
        settings.get(SETTINGS_KEY),
      ]);
      return { events: storedEvents, tasks: storedTasks, settings: settingsRow?.value ?? null };
    });
  }

  // PRE:  the database is open; changes holds well-formed rows
  // POST: all deletes and then all puts of changes are stored, or none are and the promise rejects
  async apply(changes: ChangeSet): Promise<void> {
    const { events, tasks } = this.db;
    await this.db.transaction('rw', events, tasks, async () => {
      await events.bulkDelete(changes.deleteEventIds);
      await tasks.bulkDelete(changes.deleteTaskIds);
      await events.bulkPut(changes.putEvents);
      await tasks.bulkPut(changes.putTasks);
    });
  }

  // PRE:  the database is open; settings satisfies settingsSchema
  // POST: settings is stored as the single settings row
  async saveSettings(settings: Settings): Promise<void> {
    await this.db.settings.put({ key: SETTINGS_KEY, value: settings });
  }

  // PRE:  the database is open; data holds well-formed rows and settings
  // POST: the three tables hold exactly data, or nothing changed and the promise rejects
  async replaceAll(data: {
    events: CalendarEvent[];
    tasks: Task[];
    settings: Settings;
  }): Promise<void> {
    const { events, tasks, settings } = this.db;
    await this.db.transaction('rw', events, tasks, settings, async () => {
      await Promise.all([events.clear(), tasks.clear(), settings.clear()]);
      await events.bulkPut(data.events);
      await tasks.bulkPut(data.tasks);
      await settings.put({ key: SETTINGS_KEY, value: data.settings });
    });
  }
}
