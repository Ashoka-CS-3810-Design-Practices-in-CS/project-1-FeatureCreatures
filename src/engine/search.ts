// The slot search shared by findSlots, suggestAlternatives and Replan (TECH_SPEC §7.5):
// segments → busy → gaps → rank. It is the only place this pipeline is assembled.

import { SNAP_MIN } from '@/shared/constants';
import type { EmptyWindowCause, EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import { parseInput, slotSchema } from '@/shared/schemas';
import { buildDayFrames, ceilTo } from '@/shared/time';
import type {
  Boundary,
  CalendarEvent,
  Criterion,
  DayFrame,
  FreeGap,
  Interval,
  Minute,
  Priority,
  SearchSubject,
  Segment,
  SlotSearchResult,
  WindowExplanation,
  WindowSplit,
  WindowStretches,
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

// PRE:  as search
// POST: returns the day frames of request.window and its allowed segments (BR-5)
function allowedFor(
  state: EngineState,
  request: SearchRequest,
  notBefore: Minute,
): { frames: DayFrame[]; segments: Segment[] } {
  const frames = buildDayFrames(request.window, state.settings);
  const segments = allowedSegments(request.window, frames, {
    useWorkingHours: request.useWorkingHours,
    notBefore,
  });
  return { frames, segments };
}

// PRE:  as search; segments are request's allowed segments
// POST: returns the free gaps of segments once request's busy events (all but excludeIds, grown
//       by the buffer) are taken out (BR-6)
function freeGapsFor(state: EngineState, request: SearchRequest, segments: Segment[]): FreeGap[] {
  // Expanded by the buffer, so an event just outside the window still pushes its buffer into it.
  const near = eventsIntersecting(state.events, expand(request.window, request.bufferMin)).filter(
    (event) => !request.excludeIds.includes(event.id),
  );
  return freeGaps(segments, mergeBusy(near, request.bufferMin));
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
  const { frames, segments } = allowedFor(state, request, notBefore);
  const longest = maxLength(segments);
  if (request.durationMin > longest) {
    return err({
      code: 'TaskLongerThanWindow',
      durationMin: request.durationMin,
      longestStretchMin: longest,
    });
  }

  const gaps = freeGapsFor(state, request, segments);
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

// PRE:  ending is the boundary that ends one stretch; starting the one that starts the next
// POST: returns the barred slot or event between them when both boundaries name the same one
//       (same barred label, or same event), else null (a day or working-hours edge splits them)
function splitBetween(ending: Boundary, starting: Boundary): WindowSplit | null {
  const interval = { start: ending.at, end: starting.at };
  if (ending.kind === 'barred' && starting.kind === 'barred' && ending.label === starting.label) {
    return { kind: 'barred', label: ending.label, interval };
  }
  if (ending.kind === 'event' && starting.kind === 'event' && ending.eventId === starting.eventId) {
    return { kind: 'event', label: ending.title, interval };
  }
  return null;
}

// PRE:  pieces are disjoint and in order, each with the boundaries that start and end it
// POST: returns their intervals and every barred slot or event that lies between two neighbours
function stretchesOf(
  pieces: readonly { interval: Interval; starts: Boundary; ends: Boundary }[],
): WindowStretches {
  const splits: WindowSplit[] = [];

  // INVARIANT: guard: 1 ≤ index ≤ pieces.length
  //            behavior: splits holds the split between every neighbouring pair before index
  for (let index = 1; index < pieces.length; index += 1) {
    const before = pieces[index - 1] as (typeof pieces)[number];
    const after = pieces[index] as (typeof pieces)[number];
    const split = splitBetween(before.ends, after.starts);
    if (split !== null) {
      splits.push(split);
    }
  }
  // POST: splits holds the split between every neighbouring pair that has one

  return { stretches: pieces.map((piece) => piece.interval), splits };
}

// PRE:  as search
// POST: returns what is left of request.window (WI-45, report #7): its allowed segments (what ER2
//       measures) and its free gaps (what ER3 measures), each with what splits them; read-only
export function explainSearch(
  state: EngineState,
  request: SearchRequest,
  notBefore: Minute,
): WindowExplanation {
  const { segments } = allowedFor(state, request, notBefore);
  const gaps = freeGapsFor(state, request, segments);
  return {
    allowed: stretchesOf(
      segments.map((segment) => ({
        interval: { start: segment.start, end: segment.end },
        starts: segment.startEdge,
        ends: segment.endEdge,
      })),
    ),
    free: stretchesOf(
      gaps.map((gap) => ({
        interval: { start: gap.start, end: gap.end },
        starts: gap.before,
        ends: gap.after,
      })),
    ),
  };
}

// PRE:  window.start < window.end; a search of window with useWorkingHours from notBefore found
//       no allowed minute (longest stretch 0)
// POST: returns why (WI-41): 'past' when window ends by notBefore; 'barred' when the same search
//       with no barred slots would find allowed time; otherwise 'noWorkingHours'
export function emptyWindowCause(
  state: EngineState,
  window: Interval,
  useWorkingHours: boolean,
  notBefore: Minute,
): EmptyWindowCause {
  if (window.end <= notBefore) {
    return 'past';
  }
  const withoutBarred = { ...state.settings, barredSlots: [] };
  const segments = allowedSegments(window, buildDayFrames(window, withoutBarred), {
    useWorkingHours,
    notBefore,
  });
  return segments.length > 0 ? 'barred' : 'noWorkingHours';
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

// PRE:  start is when an offered slot or planned move begins; now is the current Minute
// POST: returns ok when start ≥ notBeforeFor(now), else err StaleResult (ER7): time has passed
//       since the result was computed, and data versions do not change when it does (AUDIT A07)
export function requireNotPast(start: Minute, now: Minute): Result<null, EngineError> {
  return start >= notBeforeFor(now) ? ok(null) : err({ code: 'StaleResult' });
}

// PRE:  slot comes from the UI (untrusted); durationMin is the length the slot must have
// POST: returns ok when slot's ends are supported integer Minutes (slotSchema) and slot is exactly
//       durationMin long; else the schema's error at 'slot.start' / 'slot.end' (AUDIT A06), or
//       err InvalidTime at path 'slot' for a wrong length
export function requireValidSlot(slot: Interval, durationMin: number): Result<null, EngineError> {
  const parsed = parseInput(slotSchema, { slot });
  if (!parsed.ok) {
    return err(parsed.error);
  }
  if (slot.end - slot.start === durationMin) {
    return ok(null);
  }
  return err({
    code: 'InvalidTime',
    issues: [{ path: 'slot', message: 'The slot must be exactly as long as the duration.' }],
  });
}
