// The slot search shared by findSlots, suggestAlternatives and Replan (TECH_SPEC §7.5):
// segments → busy → gaps → rank. It is the only place this pipeline is assembled.

import { SNAP_MIN } from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import { buildDayFrames, ceilTo } from '@/shared/time';
import type {
  CalendarEvent,
  Criterion,
  DayFrame,
  Interval,
  Minute,
  Priority,
  SearchSubject,
  Segment,
  SlotSearchResult,
} from '@/shared/types';
import { computeDayLoads } from './algorithms/dayLoad';
import { freeGaps, largestGap } from './algorithms/gaps';
import { expand, length, maxLength } from './algorithms/interval';
import { mergeBusy } from './algorithms/merge';
import { rankOptions } from './algorithms/rank';
import { allowedSegments } from './algorithms/segments';
import { eventsIntersecting } from './algorithms/sortedArray';
import type { EngineState } from './state';

export interface SearchRequest {
  durationMin: number;
  priority: Priority;
  window: Interval;
  useWorkingHours: boolean;
  excludeIds: readonly string[];
  originalStart: Minute | null;
  criterion: Criterion;
  bufferMin: number;
  subject: SearchSubject;
}

// PRE:  state.events is sorted; frames is non-empty, in order and contiguous
// POST: returns the events, except excludeIds, that intersect the whole days of frames. A day's
//       load covers its whole working day (BR-7), so a window that starts or ends mid-day must not
//       hide the rest of that day's events (AUDIT A05)
function eventsOnDays(
  state: EngineState,
  frames: readonly DayFrame[],
  excludeIds: readonly string[],
): CalendarEvent[] {
  const days = { start: (frames[0] as DayFrame).dayStart, end: (frames.at(-1) as DayFrame).dayEnd };
  return eventsIntersecting(state.events, days).filter((event) => !excludeIds.includes(event.id));
}

// PRE:  state.events is sorted; request.window has start < end; request.durationMin > 0;
//       request.bufferMin is an integer 0 … 120 (validated by the caller); notBefore is now rounded
//       up to SNAP_MIN
// POST: returns the ranked options for request (BR-5 … BR-8) with the search's explanation data;
//       err TaskLongerThanWindow when no allowed segment is long enough (ER2), err NoSlotFound with
//       the first largest gap when segments exist but no free gap fits (ER3)
export function search(
  state: EngineState,
  request: SearchRequest,
  notBefore: Minute,
): Result<SlotSearchResult, EngineError> {
  const frames = buildDayFrames(request.window, state.settings);
  const segments = allowedSegments(request.window, frames, {
    useWorkingHours: request.useWorkingHours,
    notBefore,
  });
  const longest = maxLength(segments);
  if (request.durationMin > longest) {
    return err({
      code: 'TaskLongerThanWindow',
      durationMin: request.durationMin,
      longestStretchMin: longest,
    });
  }

  // Expanded by the buffer, so an event just outside the window still pushes its buffer into it.
  const near = eventsIntersecting(state.events, expand(request.window, request.bufferMin)).filter(
    (event) => !request.excludeIds.includes(event.id),
  );
  const gaps = freeGaps(segments, mergeBusy(near, request.bufferMin));
  const fitting = gaps.filter((gap) => length(gap) >= request.durationMin);
  if (fitting.length === 0) {
    const largest = largestGap(gaps);
    return err({
      code: 'NoSlotFound',
      durationMin: request.durationMin,
      bufferMin: request.bufferMin,
      largestGapMin: largest === null ? 0 : length(largest),
      largestGap: largest === null ? null : { start: largest.start, end: largest.end },
    });
  }

  const options = rankOptions(fitting, {
    durationMin: request.durationMin,
    criterion: request.criterion,
    priority: request.priority,
    originalStart: request.originalStart,
    dayLoads: computeDayLoads(eventsOnDays(state, frames, request.excludeIds), frames),
    frames,
  });
  return ok({
    baseVersion: state.version,
    subject: request.subject,
    durationMin: request.durationMin,
    priority: request.priority,
    criterion: request.criterion,
    bufferMin: request.bufferMin,
    searchWindow: request.window,
    segmentCount: segments.length,
    freeGaps: gaps,
    fittingCount: fitting.length,
    options,
  });
}

// PRE:  now is the current Minute
// POST: returns the earliest minute a search may place time: now rounded up to SNAP_MIN (BR-5)
export function notBeforeFor(now: Minute): Minute {
  return ceilTo(now, SNAP_MIN);
}

// PRE:  state.settings is valid; notBefore is now rounded up to SNAP_MIN
// POST: returns the segmentsFor closure Replan needs: window ↦ its working-hours allowed segments
export function segmentsFor(
  state: EngineState,
  notBefore: Minute,
): (window: Interval) => Segment[] {
  return (window) =>
    allowedSegments(window, buildDayFrames(window, state.settings), {
      useWorkingHours: true,
      notBefore,
    });
}

// PRE:  state is the current state; baseVersion comes from an earlier search result
// POST: returns ok when baseVersion is the current version, else err StaleResult (ER7)
export function requireCurrentVersion(
  state: EngineState,
  baseVersion: number,
): Result<null, EngineError> {
  return baseVersion === state.version ? ok(null) : err({ code: 'StaleResult' });
}

// PRE:  slot comes from the UI; durationMin is the length the slot must have
// POST: returns ok when slot is exactly durationMin long, else err InvalidTime at path 'slot'
export function requireSlotLength(slot: Interval, durationMin: number): Result<null, EngineError> {
  if (slot.end - slot.start === durationMin) {
    return ok(null);
  }
  return err({
    code: 'InvalidTime',
    issues: [{ path: 'slot', message: 'The slot must be exactly as long as the duration.' }],
  });
}
