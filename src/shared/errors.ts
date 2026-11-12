// Typed engine errors (ER1–ER8) — frozen contract (TECH_SPEC §5).

import type { Interval } from './types';

export interface FieldIssue {
  readonly path: string; // path like 'end', 'window.end'
  readonly message: string;
}

/** Why a search window has no allowed minute at all (WI-41): it is over, it has no working hours
 *  (and the search was limited to them), or barred slots cover all that is left. */
export type EmptyWindowCause = 'past' | 'noWorkingHours' | 'barred';

export type EngineError =
  | { code: 'InvalidInput'; issues: FieldIssue[] } // ER1 (shape)
  | { code: 'InvalidTime'; issues: FieldIssue[] } // ER1 (ordering)
  | {
      code: 'TaskLongerThanWindow';
      durationMin: number;
      longestStretchMin: number;
      emptyCause?: EmptyWindowCause; // set by suggestAlternatives when longestStretchMin is 0
    } // ER2
  | {
      code: 'NoSlotFound';
      durationMin: number;
      largestGapMin: number;
      largestGap: Interval | null;
      bufferMin: number;
    } // ER3
  | { code: 'StorageError'; message: string } // ER5
  | { code: 'InvalidImport'; issues: FieldIssue[] } // ER6
  | { code: 'StaleResult' } // ER7
  | { code: 'ConcurrentModification' } // ER8: another tab saved first (WI-40)
  | { code: 'CategoryInUse'; eventCount: number; taskCount: number }
  | { code: 'NotFound'; entity: 'event' | 'task' | 'category'; id: string };
