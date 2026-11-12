import { DEFAULT_CATEGORIES } from './constants';
import type { CalendarEvent, Category, LegacyCategory, Settings, Task } from './types';

export type LegacyEvent = Omit<CalendarEvent, 'categoryId' | 'keptInBarred'> & {
  readonly category: LegacyCategory;
};
export type LegacyTask = Omit<Task, 'categoryId' | 'doneAt' | 'status'> & {
  readonly category: LegacyCategory;
  readonly status: 'unscheduled' | 'scheduled';
};
export type LegacySettings = Omit<Settings, 'useWorkingHours'>;
export interface LegacyData {
  readonly events: readonly LegacyEvent[];
  readonly tasks: readonly LegacyTask[];
  readonly settings: LegacySettings | null;
}

// PRE:  event passed the legacy stored-event schema
// POST: preserves its fields, mapping the enum to its stable seed id and initialising kept ids
export function migrateLegacyEvent(event: LegacyEvent): CalendarEvent {
  const { category, ...fields } = event;
  return { ...fields, categoryId: category, keptInBarred: [] };
}

// PRE:  task passed the legacy stored-task schema
// POST: preserves its fields, mapping the enum to its stable seed id and initialising doneAt
export function migrateLegacyTask(task: LegacyTask): Task {
  const { category, ...fields } = task;
  return { ...fields, categoryId: category, doneAt: null };
}

// PRE:  data passed the legacy stored-data schema, including its individual barred-slot shapes
// POST: maps all records to v3 with five independent seed categories and working hours enabled;
//       overlapping legacy slots and absent settings are preserved
export function migrateLegacyData(data: LegacyData): {
  events: CalendarEvent[];
  tasks: Task[];
  settings: Settings | null;
  categories: Category[];
} {
  return {
    events: data.events.map(migrateLegacyEvent),
    tasks: data.tasks.map(migrateLegacyTask),
    settings: data.settings === null ? null : { ...data.settings, useWorkingHours: true },
    categories: structuredClone([...DEFAULT_CATEGORIES]),
  };
}
