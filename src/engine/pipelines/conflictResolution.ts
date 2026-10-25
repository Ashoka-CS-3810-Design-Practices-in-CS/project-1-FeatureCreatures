// Conflict Resolution pipeline (TECH_SPEC §7.4.2, FR7). Detection (FR4) is not a command: it runs
// inside every commit. This module proposes and applies alternative times for one event.

import type { EngineError } from '@/shared/errors';
import { err, type Result } from '@/shared/result';
import { parseInput, searchOptionsSchema } from '@/shared/schemas';
import { addLocalDays, startOfLocalDay } from '@/shared/time';
import type { CalendarEvent, Interval, Minute, SlotSearchResult } from '@/shared/types';
import { search } from '../search';
import type { EngineState } from '../state';

// A fixed event is searched from the day before its day to the day after it.
const FIXED_SEARCH_DAYS_BEFORE = 1;
const FIXED_SEARCH_DAYS_AFTER = 2;

export interface AlternativesRequest {
  eventId: string;
  otherEventId?: string;
  bufferMin?: number;
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

// PRE:  state.events is sorted; request comes from outside (bufferMin unchecked); notBefore is now
//       rounded up to SNAP_MIN
// POST: returns the nearest-first alternative slots for the event (working hours on, the event itself
//       excluded, buffer = request.bufferMin ?? settings.bufferMin); err InvalidInput for a bad
//       bufferMin, NotFound for an unknown event, or the search's ER2 / ER3 errors
export function suggestAlternatives(
  state: EngineState,
  request: AlternativesRequest,
  notBefore: Minute,
): Result<SlotSearchResult, EngineError> {
  const options = parseInput(searchOptionsSchema, { bufferMin: request.bufferMin });
  if (!options.ok) {
    return options;
  }
  const event = state.events.find((candidate) => candidate.id === request.eventId);
  if (event === undefined) {
    return err({ code: 'NotFound', entity: 'event', id: request.eventId });
  }

  return search(
    state,
    {
      durationMin: event.end - event.start,
      priority: event.priority,
      window: alternativesWindow(event),
      useWorkingHours: true,
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
    },
    notBefore,
  );
}
