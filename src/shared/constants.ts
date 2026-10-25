// Named limits and defaults — frozen contract (TECH_SPEC §5). Add new magic numbers here.

import type { Priority, Settings } from './types';

export const MAX_EVENT_MIN = 1440; // BR-4
export const MAX_OPTIONS = 5; // BR-7
export const HISTORY_LIMIT = 50; // B1
export const SNAP_MIN = 5; // BR-5 notBefore rounding + UI snap
export const MAX_REPLAN_DAYS = 14; // BR-12
export const CONFLICT_LIST_LIMIT = 50;
export const MINUTES_PER_DAY = 1440;
export const MAX_TITLE_LENGTH = 100; // event title and task name
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_BARRED_LABEL_LENGTH = 40;
export const MIN_TASK_DURATION_MIN = 5;
export const MAX_TASK_DURATION_MIN = MAX_EVENT_MIN; // a scheduled task becomes an event, so it shares the cap
export const MAX_BUFFER_MIN = 120;
export const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
export const DEFAULT_SETTINGS: Settings = {
  workDays: [1, 2, 3, 4, 5], // Monday–Friday
  workStartMin: 540, // 09:00
  workEndMin: 1080, // 18:00
  bufferMin: 0,
  barredSlots: [],
  defaultCriterion: 'earliest',
};
