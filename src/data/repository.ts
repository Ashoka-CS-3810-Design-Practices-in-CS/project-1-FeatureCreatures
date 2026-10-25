// Persistence port of the engine — frozen contract (TECH_SPEC §9.1).
// Strategy pattern: the engine depends only on this interface; DexieRepository (IndexedDB) and
// MemoryRepository (tests, degraded mode) are interchangeable implementations of it.

import type { CalendarEvent, Settings, Task } from '@/shared/types';

export interface StoredData {
  events: CalendarEvent[];
  tasks: Task[];
  settings: Settings | null;
}

export interface ChangeSet {
  putEvents: CalendarEvent[];
  deleteEventIds: string[];
  putTasks: Task[];
  deleteTaskIds: string[];
}

export interface Repository {
  load(): Promise<StoredData>;
  apply(changes: ChangeSet): Promise<void>; // MUST be atomic (all or nothing)
  saveSettings(settings: Settings): Promise<void>;
  replaceAll(data: { events: CalendarEvent[]; tasks: Task[]; settings: Settings }): Promise<void>; // atomic
}
