// The slot picker's state (TECH_SPEC §11.1). WI-21 adds its actions; WI-18 only needs the type.

import type { Result } from '@/shared/result';
import type { SlotSearchResult, UserCriterion, WindowExplanation } from '@/shared/types';

export type PickerState =
  | {
      mode: 'task';
      queue: string[];
      index: number;
      criterion: UserCriterion;
      bufferMin: number;
      result: Result<SlotSearchResult>;
      explanation: WindowExplanation | null; // WI-45: what is left of the window after ER2 / ER3
      selected: number;
      scheduled: number;
      skipped: number;
    }
  | {
      mode: 'alternatives';
      eventId: string;
      otherEventId: string | null;
      bufferMin: number;
      useWorkingHours: boolean; // WI-41: the "Working hours only / Any time" choice
      order: readonly [string, string] | null; // WI-45: the Move radios' fixed order (aId, bId)
      result: Result<SlotSearchResult>;
      explanation: WindowExplanation | null;
      selected: number;
    };
