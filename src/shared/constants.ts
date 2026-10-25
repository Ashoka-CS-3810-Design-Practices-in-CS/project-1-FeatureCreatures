// Named limits and defaults — frozen contract (TECH_SPEC §5). Add new magic numbers here.

import type { Priority, Settings } from './types';

export const MAX_EVENT_MIN = 1440; // BR-4
export const MAX_OPTIONS = 5; // BR-7
export const HISTORY_LIMIT = 50; // B1
export const SNAP_MIN = 5; // BR-5 notBefore rounding + UI snap
export const MAX_REPLAN_DAYS = 14; // BR-12
export const CONFLICT_LIST_LIMIT = 50;
export const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
export const DEFAULT_SETTINGS: Settings = {
  workDays: [1, 2, 3, 4, 5], // Monday–Friday
  workStartMin: 540, // 09:00
  workEndMin: 1080, // 18:00
  bufferMin: 0,
  barredSlots: [],
  defaultCriterion: 'earliest',
};
