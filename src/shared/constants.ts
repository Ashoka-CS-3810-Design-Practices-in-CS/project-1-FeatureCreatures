// Named limits and defaults — frozen contract (TECH_SPEC §5). Add new magic numbers here.

import type { Category, Priority, Settings } from './types';

export const MAX_EVENT_MIN = 1440; // BR-4
export const MAX_OPTIONS = 5; // BR-7
export const SUGGESTION_STEP_MIN = 30;
export const SUGGESTION_CHIPS_PER_DAY = 8;
export const HISTORY_LIMIT = 50; // B1
export const SNAP_MIN = 5; // BR-5 notBefore rounding + UI snap
export const MAX_REPLAN_DAYS = 14; // BR-12
export const EXPORT_FORMAT = 'feature-creatures-calendar'; // §9.4
export const EXPORT_VERSION = 2;
export const LEGACY_EXPORT_VERSION = 1;
export const MAX_CATEGORY_NAME_LENGTH = 40;
export const MIN_CATEGORY_COLOUR_DISTANCE = 0.04;
export const MIN_NON_TEXT_CONTRAST = 3;
export const CATEGORY_TAG_BACKGROUNDS = ['#f4f1ea', '#1c1e1b'] as const;
export const CATEGORY_PALETTE: readonly string[] = [
  '#467b70',
  '#9364a2',
  '#a45c81',
  '#7b7650',
  '#427e8c',
  '#577d35',
  '#7e6ac0',
  '#a96048',
  '#368259',
  '#6f7a96',
  '#716b75',
  '#967151',
];
export const RESERVED_COLOURS: readonly string[] = [
  '#363631',
  '#ebe6d9',
  '#b3302a',
  '#ff8076',
  '#b0281f',
  '#ff978c',
  '#8f5506',
  '#f0b356',
  '#395883',
  '#9cb9e8',
];
export const COLOUR_CHANNEL_OFFSETS = [1, 3, 5] as const;
export const COLOUR_CHANNEL_DIGITS = 2;
export const COLOUR_HEX_RADIX = 16;
export const COLOUR_CHANNEL_MAX = 255;
export const SRGB_LINEAR_THRESHOLD = 0.04045;
export const SRGB_LINEAR_SLOPE = 12.92;
export const SRGB_GAMMA_OFFSET = 0.055;
export const SRGB_GAMMA = 2.4;
export const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
export const CONTRAST_LUMINANCE_OFFSET = 0.05;
// Standard OKLab matrices convert linear sRGB to perceptually uniform coordinates.
export const OKLAB_LMS_MATRIX = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const;
export const OKLAB_MATRIX = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
] as const;
export const REPLAN_DST_SLACK_MIN = 120; // a replan range of 14 local days may span DST changes
export const CONFLICT_LIST_LIMIT = 50;
export const TOAST_MS = 4000; // success and info toasts (PROJECT_SCHEMA UX feedback)
export const WARNING_TOAST_MS = 8000; // ER4 warning toasts
export const EMPHASIS_MS = 1500; // how long changed events stay emphasised
export const DRAWER_BREAKPOINT_PX = 1024;
export const MIN_CLICK_TARGET_PX = 32;
export const CALENDAR_PAN_THRESHOLD_PX = 5;
export const FIXED_ALTERNATIVE_RANGE_DAYS = 2;
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
export const NOW_GUIDE_DURATION_MIN = 1;
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MIN_BARRED_RANGE_DAYS = 3;
export const MAX_TITLE_LENGTH = 100; // event title and task name
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_BARRED_LABEL_LENGTH = 40;
export const MIN_TASK_DURATION_MIN = 5;
export const MAX_TASK_DURATION_MIN = MAX_EVENT_MIN; // a scheduled task becomes an event, so it shares the cap
export const MAX_BUFFER_MIN = 120;
export const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
export const DEFAULT_SETTINGS: Settings = {
  useWorkingHours: true,
  workDays: [1, 2, 3, 4, 5], // Monday–Friday
  workStartMin: 540, // 09:00
  workEndMin: 1080, // 18:00
  bufferMin: 0,
  barredSlots: [],
  defaultCriterion: 'earliest',
};

// Stable seed ids let a legacy enum map to the same category on every database and import.
export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: 'meeting', name: 'Meeting', colour: '#467b70', createdAt: MIN_SUPPORTED_MINUTE },
  { id: 'class', name: 'Class', colour: '#9364a2', createdAt: MIN_SUPPORTED_MINUTE },
  { id: 'appointment', name: 'Appointment', colour: '#a45c81', createdAt: MIN_SUPPORTED_MINUTE },
  { id: 'assignment', name: 'Assignment', colour: '#7b7650', createdAt: MIN_SUPPORTED_MINUTE },
  { id: 'personal', name: 'Personal', colour: '#427e8c', createdAt: MIN_SUPPORTED_MINUTE },
].toSorted((first, second) => first.id.localeCompare(second.id));
