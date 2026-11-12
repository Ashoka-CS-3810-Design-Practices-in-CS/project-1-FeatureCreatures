// Conflict Resolution pipeline (TECH_SPEC §7.4.2, FR7). Detection (FR4) is not a command: it runs
// inside every commit. This module proposes and applies alternative times for one event.

import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import { parseInput, searchOptionsSchema } from '@/shared/schemas';
import { addLocalDays, startOfLocalDay } from '@/shared/time';
import type {
  CalendarEvent,
  Interval,
  Minute,
  SlotSearchResult,
  WindowExplanation,
} from '@/shared/types';
import {
  emptyWindowCause,
  explainSearch,
  requireCurrentVersion,
  requireNotPast,
  requireValidSlot,
  search,
  type SearchRequest,
} from '../search';
import type { EngineState, PipelineContext, PipelineOutcome } from '../state';
// eventCrud also imports this module (for the ER4 suggestion). The cycle is safe: each side only
// calls the other's functions at run time, never while the modules load.
import { moveEvent } from './eventCrud';

// A fixed event is searched from the day before its day to the day after it.
const FIXED_SEARCH_DAYS_BEFORE = 1;
const FIXED_SEARCH_DAYS_AFTER = 2;

export interface ApplyAlternativeRequest {
  eventId: string;
  slot: Interval;
  baseVersion: number;
}

export interface AlternativesRequest {
  eventId: string;
  otherEventId?: string;
  bufferMin?: number;
  useWorkingHours?: boolean; // WI-41: false searches any time; omitted means true (as before)
}

// PRE:  event is an event
// POST: returns where alternatives are searched: the flex window of a flexible event, otherwise the
//       local day before the event's day through the local day after it (three whole days)
function alternativesWindow(event: CalendarEvent): Interval {
  if (event.flexible && event.flexWindow !== null) {
    return event.flexWindow;
  }
  const day = startOfLocalDay(event.start);
  return {
    start: addLocalDays(day, -FIXED_SEARCH_DAYS_BEFORE),
    end: addLocalDays(day, FIXED_SEARCH_DAYS_AFTER),
  };
}

// PRE:  state.events is sorted; request comes from outside (bufferMin unchecked)
// POST: returns the search an alternatives request runs: the event's duration over
//       alternativesWindow, working hours unless request.useWorkingHours is false, the event
//       excluded, nearest to its start, buffer request.bufferMin ?? settings.bufferMin; err
//       InvalidInput for a bad bufferMin or NotFound for an unknown event
function alternativesSearch(
  state: EngineState,
  request: AlternativesRequest,
): Result<SearchRequest, EngineError> {
  const options = parseInput(searchOptionsSchema, { bufferMin: request.bufferMin });
  if (!options.ok) {
    return options;
  }
  const event = state.events.find((candidate) => candidate.id === request.eventId);
  if (event === undefined) {
    return err({ code: 'NotFound', entity: 'event', id: request.eventId });
  }
  return ok({
    durationMin: event.end - event.start,
    priority: event.priority,
    window: alternativesWindow(event),
    useWorkingHours: request.useWorkingHours ?? true,
    excludeIds: [event.id],
    originalStart: event.start,
    criterion: 'nearest',
    bufferMin: options.value.bufferMin ?? state.settings.bufferMin,
    subject: {
      kind: 'event',
      eventId: event.id,
      title: event.title,
      otherEventId: request.otherEventId ?? null,
    },
  });
}

// PRE:  state.events is sorted; request comes from outside (bufferMin unchecked); notBefore is now
//       rounded up to SNAP_MIN
// POST: returns the nearest-first alternative slots for the event (working hours only unless
//       request.useWorkingHours is false; barred slots always apply; the event itself excluded;
//       buffer = request.bufferMin ?? settings.bufferMin); err InvalidInput for a bad bufferMin,
//       NotFound for an unknown event, or the search's ER2 / ER3 errors, where an ER2 with no
//       allowed minute at all also names its emptyCause
export function suggestAlternatives(
  state: EngineState,
  request: AlternativesRequest,
  notBefore: Minute,
): Result<SlotSearchResult, EngineError> {
  const prepared = alternativesSearch(state, request);
  if (!prepared.ok) {
    return prepared;
  }
  const { window, useWorkingHours } = prepared.value;
  const found = search(state, prepared.value, notBefore);
  if (
    found.ok ||
    found.error.code !== 'TaskLongerThanWindow' ||
    found.error.longestStretchMin > 0
  ) {
    return found;
  }
  return err({
    ...found.error,
    emptyCause: emptyWindowCause(state, window, useWorkingHours, notBefore),
  });
}

// PRE:  as suggestAlternatives
// POST: returns explainSearch of the search suggestAlternatives would run for request (WI-45), or
//       its InvalidInput / NotFound error
export function explainAlternativesWindow(
  state: EngineState,
  request: AlternativesRequest,
  notBefore: Minute,
): Result<WindowExplanation, EngineError> {
  const prepared = alternativesSearch(state, request);
  return prepared.ok ? ok(explainSearch(state, prepared.value, notBefore)) : prepared;
}

// PRE:  request comes from the UI, normally an option of suggestAlternatives
// POST: moves the event to request.slot as moveEvent does (label 'Move "<title>"'); err StaleResult
//       when the state changed since request.baseVersion or the slot now starts in the past (ER7),
//       NotFound for an unknown event, or InvalidTime when the slot is not exactly the event's duration
export async function applyAlternative(
  context: PipelineContext,
  request: ApplyAlternativeRequest,
): Promise<Result<PipelineOutcome, EngineError>> {
  const current = requireCurrentVersion(context.state, request.baseVersion);
  if (!current.ok) {
    return current;
  }
  const event = context.state.events.find((candidate) => candidate.id === request.eventId);
  if (event === undefined) {
    return err({ code: 'NotFound', entity: 'event', id: request.eventId });
  }
  const fits = requireValidSlot(request.slot, event.end - event.start);
  if (!fits.ok) {
    return fits;
  }
  const upcoming = requireNotPast(request.slot.start, context.now);
  if (!upcoming.ok) {
    return upcoming;
  }
  return moveEvent(context, event.id, request.slot);
}
