// IndexedDB Repository via Dexie (TECH_SPEC §9.2). Multi-table writes run in one 'rw' transaction,
// so a failure anywhere rolls back everything (the atomicity Repository requires).

import Dexie, { type Table } from 'dexie';
import { DEFAULT_CATEGORIES, INITIAL_REVISION } from '@/shared/constants';
import { migrateLegacyData } from '@/shared/legacy';
import { legacyStoredDataSchema } from '@/shared/schemas';
import type { CalendarEvent, Category, Settings, Task } from '@/shared/types';
import { requireRevision, type ChangeSet, type Repository, type StoredData } from './repository';

const SETTINGS_KEY = 'app';
const REVISION_KEY = 'revision';

interface SettingsRow {
  key: typeof SETTINGS_KEY;
  value: Settings;
}

interface RevisionRow {
  key: typeof REVISION_KEY;
  value: number;
}

class CalendarDb extends Dexie {
  declare categories: Table<Category, string>;
  // `declare` instead of `!`: a class field would be re-initialised to undefined after super(),
  // wiping the tables Dexie attaches in version().stores().
  declare events: Table<CalendarEvent, string>;
  declare tasks: Table<Task, string>;
  declare settings: Table<SettingsRow, string>;
  declare meta: Table<RevisionRow, string>;

  // PRE:  name is a non-empty database name
  // POST: creates the v3 schema without opening it; older versions upgrade with every row kept,
  //       category references mapped and new fields initialised; the revision is unchanged
  constructor(name: string) {
    super(name);
    // Never edit a shipped version in place; add the next version with its upgrade instead.
    this.version(1).stores({ events: 'id, start, taskId', tasks: 'id, status', settings: 'key' });
    // Version 2 (WI-40) only adds the meta table; Dexie keeps the tables it does not name.
    this.version(2)
      .stores({ meta: 'key' })
      .upgrade((transaction) =>
        transaction.table('meta').put({ key: REVISION_KEY, value: INITIAL_REVISION }),
      );
    this.version(3)
      .stores({ categories: 'id' })
      .upgrade(async (transaction) => {
        const [events, tasks, settingsRow] = await Promise.all([
          transaction.table('events').toArray(),
          transaction.table('tasks').toArray(),
          transaction.table('settings').get(SETTINGS_KEY),
        ]);
        const data = migrateLegacyData(
          legacyStoredDataSchema.parse({ events, tasks, settings: settingsRow?.value ?? null }),
        );
        await transaction.table('events').bulkPut(data.events);
        await transaction.table('tasks').bulkPut(data.tasks);
        await transaction.table('categories').bulkPut(data.categories);
        if (data.settings !== null) {
          await transaction.table('settings').put({ key: SETTINGS_KEY, value: data.settings });
        }
      });
    this.on('populate', (transaction) =>
      transaction.table('categories').bulkPut(structuredClone([...DEFAULT_CATEGORIES])),
    );
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
  // POST: resolves to every stored category, event and task, the settings (null if never saved) and the
  //       revision, read in one consistent transaction
  async load(): Promise<StoredData> {
    const { events, tasks, settings, meta, categories } = this.db;
    return this.db.transaction('r', [events, tasks, settings, meta, categories], async () => {
      const [storedEvents, storedTasks, settingsRow, revision, storedCategories] =
        await Promise.all([
          events.toArray(),
          tasks.toArray(),
          settings.get(SETTINGS_KEY),
          this.storedRevision(),
          categories.toArray(),
        ]);
      return {
        categories: storedCategories,
        events: storedEvents,
        tasks: storedTasks,
        settings: settingsRow?.value ?? null,
        revision,
      };
    });
  }

  // PRE:  called inside a transaction that includes the meta table
  // POST: resolves to the stored revision (INITIAL_REVISION when the row was never written)
  private async storedRevision(): Promise<number> {
    return (await this.db.meta.get(REVISION_KEY))?.value ?? INITIAL_REVISION;
  }

  // PRE:  called inside a 'rw' transaction that includes the meta table, before its other writes
  // POST: when the stored revision is expectedRevision, stores expectedRevision + 1; otherwise
  //       throws ConcurrentModificationError, which aborts the whole transaction
  private async claimRevision(expectedRevision: number): Promise<void> {
    requireRevision(await this.storedRevision(), expectedRevision);
    await this.db.meta.put({ key: REVISION_KEY, value: expectedRevision + 1 });
  }

  // PRE:  the database is open; changes holds well-formed rows
  // POST: when expectedRevision is the stored revision, all deletes and then all puts of changes
  //       are stored and the revision grows by 1; otherwise nothing is and the promise rejects
  //       (ConcurrentModificationError for a stale revision)
  async apply(changes: ChangeSet, expectedRevision: number): Promise<void> {
    const { events, tasks, meta, categories } = this.db;
    await this.db.transaction('rw', [events, tasks, meta, categories], async () => {
      await this.claimRevision(expectedRevision);
      await categories.bulkDelete(changes.deleteCategoryIds ?? []);
      await categories.bulkPut(changes.putCategories ?? []);
      await events.bulkDelete(changes.deleteEventIds);
      await tasks.bulkDelete(changes.deleteTaskIds);
      await events.bulkPut(changes.putEvents);
      await tasks.bulkPut(changes.putTasks);
    });
  }

  // PRE:  the database is open; settings and clearedEvents are structurally valid
  // POST: atomically stores settings, passed event rows and one revision increment;
  //       any failing write or stale revision rolls back the entire transaction
  async saveSettings(
    settings: Settings,
    expectedRevision: number,
    clearedEvents: readonly CalendarEvent[] = [],
  ): Promise<void> {
    const { meta } = this.db;
    await this.db.transaction('rw', this.db.settings, this.db.events, meta, async () => {
      await this.claimRevision(expectedRevision);
      await this.db.settings.put({ key: SETTINGS_KEY, value: settings });
      await this.db.events.bulkPut([...clearedEvents]);
    });
  }

  // PRE:  the database is open; data holds well-formed rows and settings
  // POST: when expectedRevision is the stored revision, the four data tables hold exactly data
  //       and the revision grows by 1; otherwise nothing changed and the promise rejects
  async replaceAll(
    data: { events: CalendarEvent[]; tasks: Task[]; settings: Settings; categories: Category[] },
    expectedRevision: number,
  ): Promise<void> {
    const { events, tasks, settings, meta, categories } = this.db;
    await this.db.transaction('rw', [events, tasks, settings, meta, categories], async () => {
      await this.claimRevision(expectedRevision);
      await Promise.all([events.clear(), tasks.clear(), settings.clear(), categories.clear()]);
      await categories.bulkPut(data.categories);
      await events.bulkPut(data.events);
      await tasks.bulkPut(data.tasks);
      await settings.put({ key: SETTINGS_KEY, value: data.settings });
    });
  }
}
