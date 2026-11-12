// The slot picker's state (TECH_SPEC §11.1). WI-21 adds its actions; WI-18 only needs the type.

import type { Result } from '@/shared/result';
import type { SlotSearchResult, UserCriterion } from '@/shared/types';

export type PickerState =
  | {
      mode: 'task';
      queue: string[];
      index: number;
      criterion: UserCriterion;
      bufferMin: number;
      result: Result<SlotSearchResult>;
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
      result: Result<SlotSearchResult>;
      selected: number;
    };
