// Conflict Resolution pipeline (TECH_SPEC §7.4.2, FR7). Detection (FR4) is not a command: it runs
// inside every commit. This module proposes and applies alternative times for one event.

import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import { alternativesOptionsSchema, parseAlternativeRange, parseInput } from '@/shared/schemas';
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
  allowMoving?: boolean;
  range?: Interval;
}

interface PreparedAlternatives extends SearchRequest {
  enabled: boolean;
}

// PRE:  event is validated; request options have been validated, but its temporary range is untrusted
// POST: returns the flexible window or opted-in fixed range; an opted-out fixed event's interval
//       only identifies the empty result and is never searched; invalid fixed ranges give InvalidTime
function alternativesWindow(event: CalendarEvent, request: AlternativesRequest): Result<Interval> {
  if (event.flexible && event.flexWindow !== null) {
    return ok(event.flexWindow);
  }
  return request.allowMoving === true
    ? parseAlternativeRange(request.range)
    : ok({ start: event.start, end: event.end });
}

// PRE:  state.events is sorted; request comes from outside (bufferMin unchecked)
// POST: returns a prepared search with enabled=false for fixed events without consent; otherwise
//       uses the flexible window or validated temporary range, nearest to the event's start with
//       itself excluded; validates hours/consent/buffer and returns InvalidTime for an invalid range
function alternativesSearch(
  state: EngineState,
  request: AlternativesRequest,
): Result<PreparedAlternatives, EngineError> {
  const options = parseInput(alternativesOptionsSchema, request);
  if (!options.ok) {
    return options;
  }
  const event = state.events.find((candidate) => candidate.id === request.eventId);
  if (event === undefined) {
    return err({ code: 'NotFound', entity: 'event', id: request.eventId });
  }
  const window = alternativesWindow(event, { ...request, ...options.value });
  if (!window.ok) return window;
  return ok({
    enabled: event.flexible || options.value.allowMoving === true,
    durationMin: event.end - event.start,
    priority: event.priority,
    window: window.value,
    useWorkingHours: options.value.useWorkingHours ?? true,
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
// POST: fixed events without opt-in get no options and no search; otherwise returns nearest-first slots
//       (working hours only unless
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
  if (!prepared.value.enabled) {
    return ok({
      baseVersion: state.version,
      subject: prepared.value.subject,
      durationMin: prepared.value.durationMin,
      priority: prepared.value.priority,
      criterion: prepared.value.criterion,
      bufferMin: prepared.value.bufferMin,
      searchWindow: prepared.value.window,
      segmentCount: 0,
      freeGaps: [],
      fittingCount: 0,
      options: [],
    });
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
  if (!prepared.ok) return prepared;
  return prepared.value.enabled
    ? ok(explainSearch(state, prepared.value, notBefore))
    : ok({ allowed: { stretches: [], splits: [] }, free: { stretches: [], splits: [] } });
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
