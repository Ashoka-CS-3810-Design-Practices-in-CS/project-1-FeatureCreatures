// Persistence port of the engine — frozen contract (TECH_SPEC §9.1).
// Strategy pattern: the engine depends only on this interface; DexieRepository (IndexedDB) and
// MemoryRepository (tests, degraded mode) are interchangeable implementations of it.

import type { CalendarEvent, Settings, Task } from '@/shared/types';

export interface StoredData {
  events: CalendarEvent[];
  tasks: Task[];
  settings: Settings | null;
  revision: number; // how many writes the store has accepted (WI-40); 0 when never written
}

export interface ChangeSet {
  putEvents: CalendarEvent[];
  deleteEventIds: string[];
  putTasks: Task[];
  deleteTaskIds: string[];
}

// Every write names the revision its caller last loaded or wrote. Another tab may have written
// since, so the write is refused unless the stored revision still equals it; on success the
// stored revision is expectedRevision + 1. The check and the write run in one transaction.
export interface Repository {
  load(): Promise<StoredData>;
  apply(changes: ChangeSet, expectedRevision: number): Promise<void>; // MUST be atomic (all or nothing)
  saveSettings(settings: Settings, expectedRevision: number): Promise<void>;
  replaceAll(
    data: { events: CalendarEvent[]; tasks: Task[]; settings: Settings },
    expectedRevision: number,
  ): Promise<void>; // atomic
}

/** Thrown by a Repository write whose expected revision is out of date (ER8). */
export class ConcurrentModificationError extends Error {
  // PRE:  storedRevision ≠ expectedRevision
  // POST: an error naming both revisions
  constructor(storedRevision: number, expectedRevision: number) {
    super(
      `The data was changed elsewhere (revision ${storedRevision}, expected ${expectedRevision}).`,
    );
    this.name = 'ConcurrentModificationError';
  }
}

// PRE:  storedRevision is the revision currently stored, read inside the write's transaction
// POST: returns normally when storedRevision = expectedRevision; otherwise throws
//       ConcurrentModificationError (so the transaction aborts and nothing is written)
export function requireRevision(storedRevision: number, expectedRevision: number): void {
  if (storedRevision !== expectedRevision) {
    throw new ConcurrentModificationError(storedRevision, expectedRevision);
  }
}
