// Named limits and defaults — frozen contract (TECH_SPEC §5). Add new magic numbers here.

import type { Priority, Settings } from './types';

export const MAX_EVENT_MIN = 1440; // BR-4
export const MAX_OPTIONS = 5; // BR-7
export const HISTORY_LIMIT = 50; // B1
export const SNAP_MIN = 5; // BR-5 notBefore rounding + UI snap
export const MAX_REPLAN_DAYS = 14; // BR-12
export const EXPORT_FORMAT = 'feature-creatures-calendar'; // §9.4
export const EXPORT_VERSION = 1;
export const REPLAN_DST_SLACK_MIN = 120; // a replan range of 14 local days may span DST changes
export const CONFLICT_LIST_LIMIT = 50;
export const TOAST_MS = 4000; // success and info toasts (PROJECT_SCHEMA UX feedback)
export const WARNING_TOAST_MS = 8000; // ER4 warning toasts
export const EMPHASIS_MS = 1500; // how long changed events stay emphasised
export const DRAWER_BREAKPOINT_PX = 1024;
export const MIN_CLICK_TARGET_PX = 32;
export const CLICK_EVENT_MIN = 30; // a click on empty time creates one calendar row (WI-35)
export const IMPORT_SPINNER_THRESHOLD = 1000;
export const INITIAL_REVISION = 0; // stored revision of a repository nothing has written to (WI-40)
export const MAX_LISTED_STRETCHES = 6; // ER2/ER3 explanation lists at most this many (WI-45)
export const TAB_CHANNEL_NAME = 'feature-creatures-calendar'; // BroadcastChannel between tabs (WI-40)
export const MINUTES_PER_DAY = 1440;
// Supported dates, 1970-01-01T00:00Z to 9999-12-31T23:59Z: every such minute is a valid JavaScript
// Date and formats in any time zone (AUDIT A02).
export const MIN_SUPPORTED_MINUTE = 0;
export const MAX_SUPPORTED_MINUTE = 4_223_371_679;
export const MINUTES_PER_HOUR = 60;
export const MS_PER_MINUTE = 60_000;
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
