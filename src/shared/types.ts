// Domain and result types shared by every layer — frozen contract (TECH_SPEC §5).

export type Minute = number; // integer minutes since Unix epoch (UTC)
export interface Interval {
  readonly start: Minute;
  readonly end: Minute;
} // half-open [start, end)

export type Priority = 'high' | 'medium' | 'low';
export type Category = 'meeting' | 'class' | 'appointment' | 'assignment' | 'personal';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday (JS Date convention)

export interface CalendarEvent extends Interval {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: Category;
  readonly priority: Priority;
  readonly flexible: boolean;
  readonly flexWindow: Interval | null; // non-null iff flexible
  readonly taskId: string | null; // set iff this event is a scheduled task
  readonly createdAt: Minute;
  readonly updatedAt: Minute;
}

export interface Task {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: Category;
  readonly priority: Priority;
  readonly durationMin: number; // 5..1440
  readonly window: Interval; // allowable scheduling window
  readonly useWorkingHours: boolean;
  readonly status: 'unscheduled' | 'scheduled';
  readonly scheduledEventId: string | null; // non-null iff status === 'scheduled'
  readonly createdAt: Minute;
  readonly updatedAt: Minute;
}

export interface BarredSlot {
  readonly id: string;
  readonly label: string;
  readonly startMin: number; // minutes after local midnight
  readonly endMin: number;
  readonly days: readonly Weekday[];
}

export interface Settings {
  readonly workDays: readonly Weekday[];
  readonly workStartMin: number; // minutes after local midnight
  readonly workEndMin: number;
  readonly bufferMin: number; // 0..120
  readonly barredSlots: readonly BarredSlot[];
  readonly defaultCriterion: UserCriterion;
}

export type EventInput = Pick<
  CalendarEvent,
  'title' | 'description' | 'category' | 'priority' | 'start' | 'end' | 'flexible' | 'flexWindow'
>;
export type TaskInput = Pick<
  Task,
  'name' | 'description' | 'category' | 'priority' | 'durationMin' | 'window' | 'useWorkingHours'
>;

// ---- derived (never stored) ----
export interface Conflict {
  readonly key: string; // `${smallerId}|${largerId}`
  readonly aId: string; // aId < bId (string compare)
  readonly bId: string;
  readonly overlap: Interval;
  readonly minutes: number;
  readonly targetId: string; // which one BR-10 suggests moving
}

export type UserCriterion = 'earliest' | 'bestFit' | 'priorityAware';
export interface BarredOverlap {
  readonly eventId: string;
  readonly label: string;
  readonly overlap: Interval;
  readonly minutes: number;
}
export type Criterion = UserCriterion | 'nearest' | 'leastLoaded';
export type EffectiveCriterion = Exclude<Criterion, 'priorityAware'>;

export type EdgeReason = 'windowStart' | 'windowEnd' | 'workStart' | 'workEnd' | 'now';
export type Boundary =
  | {
      readonly kind: 'event';
      readonly eventId: string;
      readonly title: string;
      readonly at: Minute;
      readonly bufferMin: number;
    }
  | { readonly kind: 'barred'; readonly label: string; readonly at: Minute }
  | { readonly kind: 'edge'; readonly reason: EdgeReason; readonly at: Minute };

/** One local day, pre-expanded to absolute minutes by shared/time.ts so algorithms never do calendar math. */
export interface DayFrame {
  readonly dayStart: Minute; // local midnight → next local midnight (23–25 h)
  readonly dayEnd: Minute;
  readonly weekday: Weekday;
  readonly work: Interval | null; // null if not a working day
  readonly barred: readonly { readonly label: string; readonly interval: Interval }[];
}

export interface Segment extends Interval {
  readonly startEdge: Boundary;
  readonly endEdge: Boundary;
}
// buffered, merged
export interface BusyBlock extends Interval {
  readonly startEvent: { id: string; title: string; start: Minute }; // event whose buffered start opens the block
  readonly endEvent: { id: string; title: string; end: Minute }; // event whose buffered end closes the block
}
export interface FreeGap extends Interval {
  readonly before: Boundary;
  readonly after: Boundary;
}

export interface SlotOption {
  readonly rank: number; // 1-based
  readonly slot: Interval;
  readonly gap: FreeGap;
  readonly gapMin: number;
  readonly leftoverMin: number; // gapMin − duration
  readonly dayLoadMin: number; // load of the slot's local day before placing
  readonly criterion: Criterion; // requested
  readonly effectiveCriterion: EffectiveCriterion;
  readonly distanceMin: number | null; // |slot.start − originalStart| when an original start exists
}

export type SearchSubject =
  | { readonly kind: 'task'; readonly taskId: string; readonly name: string }
  | {
      readonly kind: 'event';
      readonly eventId: string;
      readonly title: string;
      readonly otherEventId: string | null;
    };

/** What divides two stretches of a search window: a barred slot or a busy event (WI-45, #7). */
export interface WindowSplit {
  readonly kind: 'barred' | 'event';
  readonly label: string; // the barred slot's label or the event's title
  readonly interval: Interval;
}

/** Stretches of a window in order, with the barred slots / events found between neighbours. */
export interface WindowStretches {
  readonly stretches: readonly Interval[];
  readonly splits: readonly WindowSplit[];
}

/** engine.explainWindow: the allowed segments (ER2's view) and the free gaps (ER3's view). */
export interface WindowExplanation {
  readonly allowed: WindowStretches;
  readonly free: WindowStretches;
}

export interface SlotSearchResult {
  readonly baseVersion: number;
  readonly subject: SearchSubject;
  readonly durationMin: number;
  readonly priority: Priority;
  readonly criterion: Criterion;
  readonly bufferMin: number;
  readonly searchWindow: Interval;
  readonly segmentCount: number;
  readonly freeGaps: readonly FreeGap[]; // ALL gaps, including too-short ones
  readonly fittingCount: number;
  readonly options: readonly SlotOption[]; // ≤ MAX_OPTIONS, ranked
}

export type MoveReason =
  | { readonly kind: 'outsideFlexWindow' }
  | { readonly kind: 'outsideWorkingHours' }
  | { readonly kind: 'barred'; readonly label: string }
  | { readonly kind: 'conflict'; readonly withEventId: string; readonly withTitle: string }
  | { readonly kind: 'buffer'; readonly withEventId: string; readonly withTitle: string }
  | { readonly kind: 'balance'; readonly fromDayLoadMin: number; readonly toDayLoadMin: number };

export interface ReplanMove {
  readonly eventId: string;
  readonly title: string;
  readonly priority: Priority;
  readonly from: Interval;
  readonly to: Interval;
  readonly reason: MoveReason;
}
export interface ReplanMetrics {
  readonly moved: number;
  readonly totalShiftMin: number;
  readonly conflictsBefore: number;
  readonly conflictsAfter: number;
  readonly loadSpreadBeforeMin: number;
  readonly loadSpreadAfterMin: number;
  readonly unplaced: number;
}
export interface ReplanPlan {
  readonly id: 'minimalChange' | 'balanced';
  readonly moves: readonly ReplanMove[];
  readonly unplaced: readonly {
    readonly eventId: string;
    readonly title: string;
    readonly reason: MoveReason | null;
  }[];
  readonly metrics: ReplanMetrics;
}
export interface ReplanResult {
  readonly baseVersion: number;
  readonly range: Interval;
  readonly bufferMin: number;
  readonly movableCount: number;
  readonly plans: readonly [ReplanPlan, ReplanPlan]; // [minimalChange, balanced]
  readonly notMoved: Readonly<Record<ReplanPlan['id'], readonly ReplanNotMoved[]>>;
}

export interface ReplanNotMoved {
  readonly eventId: string;
  readonly title: string;
  readonly reason: 'fixed' | 'started' | 'outsideFlexWindow' | 'noSlot';
  readonly barredLabels: readonly string[];
  readonly conflictTitles: readonly string[];
}

export interface Snapshot {
  readonly version: number;
  readonly events: readonly CalendarEvent[]; // sorted by (start, end, id)
  readonly tasks: readonly Task[]; // creation order
  readonly settings: Settings;
  readonly conflicts: readonly Conflict[]; // sorted by (overlap.start, key)
  readonly barredOverlaps: readonly BarredOverlap[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

export interface MutationResult {
  readonly snapshot: Snapshot;
  readonly label: string; // e.g. 'Move "Gym"' — also the undo label
  readonly changedEventIds: readonly string[];
  readonly introducedConflicts: readonly Conflict[];
  readonly resolvedConflicts: readonly Conflict[];
  readonly suggestion: SlotOption | null; // ER4: top nearest alternative for the subject event
}

export interface ExportFile {
  readonly format: 'feature-creatures-calendar';
  readonly version: 1;
  readonly exportedAt: string; // ISO 8601
  readonly events: readonly CalendarEvent[];
  readonly tasks: readonly Task[];
  readonly settings: Settings;
}
