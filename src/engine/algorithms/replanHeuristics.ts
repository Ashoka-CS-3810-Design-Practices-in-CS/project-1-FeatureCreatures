// Replan heuristics (TECH_SPEC §8.13, BR-12): one greedy pass over the movable events, run once per
// plan. Each placed event becomes busy for the ones after it; nothing is ever backtracked, so every
// move can be explained on its own.

import { PRIORITY_RANK } from '@/shared/constants';
import type {
  CalendarEvent,
  Conflict,
  DayFrame,
  Interval,
  Minute,
  MoveReason,
  ReplanMetrics,
  ReplanMove,
  ReplanPlan,
  Segment,
  SlotOption,
} from '@/shared/types';
import { computeDayLoads, frameOf, loadSpread } from './dayLoad';
import { freeGaps } from './gaps';
import { contains, expand, intersect, length, overlaps } from './interval';
import { mergeBusy } from './merge';
import { rankOptions } from './rank';
import { compareEvents, compareIds, eventsIntersecting, insertSorted } from './sortedArray';
import { detectConflicts } from './sweep';
import { detectBarredOverlaps } from './barred';

export interface ReplanInput {
  events: readonly CalendarEvent[]; // all, sorted
  conflicts: readonly Conflict[]; // current, for conflictsBefore
  frames: readonly DayFrame[]; // for the range
  range: Interval;
  bufferMin: number;
  notBefore: Minute;
  useWorkingHours: boolean;
  segmentsFor: (window: Interval) => Segment[];
}

type PlanKind = ReplanPlan['id'];
type UnplacedEvent = ReplanPlan['unplaced'][number];

interface Placement {
  readonly placed: CalendarEvent; // where the event ends up (unchanged when kept or unplaced)
  readonly move: ReplanMove | null;
  readonly unplaced: UnplacedEvent | null;
}

// PRE:  first and second are events
// POST: returns < 0, 0 or > 0 ordering them for processing: higher PRIORITY_RANK first, then longer
//       duration, then earlier start, then smaller id (BR-12)
function compareMovable(first: CalendarEvent, second: CalendarEvent): number {
  if (first.priority !== second.priority) {
    return PRIORITY_RANK[second.priority] - PRIORITY_RANK[first.priority];
  }
  if (length(first) !== length(second)) {
    return length(second) - length(first);
  }
  if (first.start !== second.start) {
    return first.start - second.start;
  }
  return compareIds(first.id, second.id);
}

// PRE:  event is an event
// POST: returns just its interval [event.start, event.end)
function spanOf(event: CalendarEvent): Interval {
  return { start: event.start, end: event.end };
}

// PRE:  kind is 'conflict' or 'buffer'; other is the event it refers to
// POST: returns that move reason naming other
function reasonWith(kind: 'conflict' | 'buffer', other: CalendarEvent): MoveReason {
  return { kind, withEventId: other.id, withTitle: other.title };
}

// PRE:  window is flexWindow ∩ range, or null when they do not meet; occupied is sorted and does
//       not contain event; frames cover the range; bufferMin ≥ 0; useWorkingHours is the global rule
// POST: returns null when event's current interval is a valid place (BR-12 Minimal change), else the
//       first failing check, in this order: outside the flex window, outside one day's working
//       hours when enabled, in any touched day's unkept barred slot, overlapping an event, inside its buffer
function invalidReason(
  event: CalendarEvent,
  window: Interval | null,
  occupied: readonly CalendarEvent[],
  bufferMin: number,
  frames: readonly DayFrame[],
  useWorkingHours: boolean,
): MoveReason | null {
  if (window === null || !contains(window, event)) {
    return { kind: 'outsideFlexWindow' };
  }
  // A working interval lies inside its own day, so only the frame holding event.start can contain it.
  const frame = frameOf(frames, event.start);
  if (
    useWorkingHours &&
    (frame === undefined || frame.work === null || !contains(frame.work, event))
  ) {
    return { kind: 'outsideWorkingHours' };
  }
  const barred = detectBarredOverlaps([event], frames).find(
    (warning) => !event.keptInBarred.includes(warning.slotId),
  );
  if (barred !== undefined) {
    return { kind: 'barred', label: barred.label };
  }
  const conflicting = eventsIntersecting(occupied, event)[0];
  if (conflicting !== undefined) {
    return reasonWith('conflict', conflicting);
  }
  // o's buffered interval meets event exactly when event's buffered interval meets o.
  const crowding = eventsIntersecting(occupied, expand(event, bufferMin))[0];
  if (crowding !== undefined) {
    return reasonWith('buffer', crowding);
  }
  return null;
}

// PRE:  loads maps dayStart → day load; frames are contiguous DayFrames; minute is a Minute
// POST: returns the load of the day holding minute, 0 when no frame holds it
function dayLoadAt(
  loads: Map<Minute, number>,
  frames: readonly DayFrame[],
  minute: Minute,
): number {
  const frame = frameOf(frames, minute);
  return frame === undefined ? 0 : (loads.get(frame.dayStart) ?? 0);
}

// PRE:  event is movable (flexible, start ≥ input.notBefore); occupied is sorted, holds everything
//       busy so far and not event itself
// POST: returns where kind's rule puts event: Minimal change keeps a valid event; otherwise the best
//       free slot in its allowed segments (nearest for Minimal change, leastLoaded for Balanced);
//       with no slot that fits, event stays and is unplaced; a move is reported only when the start changes
function placeEvent(
  kind: PlanKind,
  event: CalendarEvent,
  occupied: readonly CalendarEvent[],
  input: ReplanInput,
): Placement {
  const window = event.flexWindow === null ? null : intersect(event.flexWindow, input.range);
  const reason = invalidReason(
    event,
    window,
    occupied,
    input.bufferMin,
    input.frames,
    input.useWorkingHours,
  );
  if (kind === 'minimalChange' && reason === null) {
    return { placed: event, move: null, unplaced: null };
  }

  const durationMin = length(event);
  const segments = window === null ? [] : input.segmentsFor(window);
  const fitting = freeGaps(segments, mergeBusy(occupied, input.bufferMin)).filter(
    (gap) => length(gap) >= durationMin,
  );
  if (fitting.length === 0) {
    return {
      placed: event,
      move: null,
      unplaced: { eventId: event.id, title: event.title, reason },
    };
  }

  const dayLoads = computeDayLoads(occupied, input.frames);
  const ranked = rankOptions(fitting, {
    durationMin,
    criterion: kind === 'balanced' ? 'leastLoaded' : 'nearest',
    priority: event.priority,
    originalStart: event.start,
    dayLoads,
    frames: input.frames,
  });
  // fitting is non-empty, so rankOptions returns at least one option.
  const best = ranked[0] as SlotOption;
  if (best.slot.start === event.start) {
    return { placed: event, move: null, unplaced: null };
  }

  return {
    placed: { ...event, ...best.slot },
    move: {
      eventId: event.id,
      title: event.title,
      priority: event.priority,
      from: spanOf(event),
      to: best.slot,
      reason: reason ?? {
        kind: 'balance',
        fromDayLoadMin: dayLoadAt(dayLoads, input.frames, event.start),
        toDayLoadMin: best.dayLoadMin,
      },
    },
    unplaced: null,
  };
}

// PRE:  conflicts are conflicts; range is an interval
// POST: returns how many of conflicts have an overlap that intersects range
function countInRange(conflicts: readonly Conflict[], range: Interval): number {
  return conflicts.filter((conflict) => overlaps(conflict.overlap, range)).length;
}

// PRE:  inRange is sorted and holds the events intersecting the range; after is inRange with the
//       moves applied, sorted; moves and unplacedCount come from the same plan
// POST: returns the plan's BR-12 metrics
function planMetrics(
  moves: readonly ReplanMove[],
  unplacedCount: number,
  inRange: readonly CalendarEvent[],
  after: readonly CalendarEvent[],
  input: ReplanInput,
): ReplanMetrics {
  return {
    moved: moves.length,
    totalShiftMin: moves.reduce((sum, move) => sum + Math.abs(move.to.start - move.from.start), 0),
    conflictsBefore: countInRange(input.conflicts, input.range),
    conflictsAfter: countInRange(detectConflicts(after), input.range),
    loadSpreadBeforeMin: loadSpread(computeDayLoads(inRange, input.frames), input.frames),
    loadSpreadAfterMin: loadSpread(computeDayLoads(after, input.frames), input.frames),
    unplaced: unplacedCount,
  };
}

// PRE:  inRange is sorted; moves have distinct eventIds that all appear in inRange
// POST: returns inRange with every moved event at its new interval, sorted by compareEvents
function applyMoves(
  inRange: readonly CalendarEvent[],
  moves: readonly ReplanMove[],
): CalendarEvent[] {
  const newIntervals = new Map(moves.map((move) => [move.eventId, move.to]));
  return inRange
    .map((event) => {
      const to = newIntervals.get(event.id);
      return to === undefined ? event : { ...event, ...to };
    })
    .toSorted(compareEvents);
}

// PRE:  movable is in processing order (compareMovable); staticEvents is sorted and disjoint from
//       movable; pinned maps the ids of some movable events to why they could not be placed
// POST: returns one greedy pass of kind's rule: pinned events stay where they are and are busy from
//       the start; every other movable event in turn is placed by placeEvent against the static
//       events, the pinned ones and every event placed before it; moves and the newly unplaced
//       events are in processing order
function greedyPass(
  kind: PlanKind,
  movable: readonly CalendarEvent[],
  staticEvents: readonly CalendarEvent[],
  pinned: ReadonlyMap<string, UnplacedEvent>,
  input: ReplanInput,
): { moves: ReplanMove[]; unplaced: UnplacedEvent[] } {
  let occupied = staticEvents
    .concat(movable.filter((event) => pinned.has(event.id)))
    .toSorted(compareEvents);
  const moves: ReplanMove[] = [];
  const unplaced: UnplacedEvent[] = [];

  // INVARIANT: occupied is sorted and holds staticEvents, the pinned events and the placement of
  //            every visited event ∧ moves / unplaced hold the visited events that moved / could
  //            not be placed, in order
  for (const event of movable) {
    if (pinned.has(event.id)) {
      continue;
    }
    const placement = placeEvent(kind, event, occupied, input);
    if (placement.move !== null) {
      moves.push(placement.move);
    }
    if (placement.unplaced !== null) {
      unplaced.push(placement.unplaced);
    }
    occupied = insertSorted(occupied, placement.placed);
  }
  // POST: every unpinned movable event is placed, and moves / unplaced describe the pass

  return { moves, unplaced };
}

// PRE:  movable is in processing order (compareMovable); staticEvents is sorted and disjoint from
//       movable; inRange is sorted
// POST: returns kind's plan with its metrics. An event that cannot be placed stays where it is and
//       is busy for every other event (BR-12), including those processed before it, so no placed
//       event lands on it. A greedy pass cannot know that in advance, so passes repeat with each
//       newly unplaced event pinned in place until a pass leaves no new one unplaced: at most
//       movable.length + 1 passes, since pinned only grows
function runPlan(
  kind: PlanKind,
  movable: readonly CalendarEvent[],
  staticEvents: readonly CalendarEvent[],
  inRange: readonly CalendarEvent[],
  input: ReplanInput,
): ReplanPlan {
  const pinned = new Map<string, UnplacedEvent>();
  let pass = greedyPass(kind, movable, staticEvents, pinned, input);

  // INVARIANT: guard:    pinned ⊆ movable ids, and it grows by ≥ 1 per iteration
  //            behavior: pass is the greedy pass with exactly the pinned events held in place
  while (pass.unplaced.length > 0) {
    for (const entry of pass.unplaced) {
      pinned.set(entry.eventId, entry);
    }
    pass = greedyPass(kind, movable, staticEvents, pinned, input);
  }
  // POST: pass placed every unpinned event clear of the static, the pinned and the earlier-placed
  //       events, and the pinned events are exactly the unplaced ones

  const unplaced = movable.flatMap((event) => pinned.get(event.id) ?? []);
  const after = applyMoves(inRange, pass.moves);
  return {
    id: kind,
    moves: pass.moves,
    unplaced,
    metrics: planMetrics(pass.moves, unplaced.length, inRange, after, input),
  };
}

// PRE:  input.events is sorted by compareEvents with distinct ids; input.conflicts =
//       detectConflicts(input.events); input.frames cover input.range; input.notBefore is now
//       rounded up to SNAP_MIN; input.segmentsFor returns the working-hours allowed segments
// POST: returns the number of movable events (flexible, start ≥ notBefore, intersecting the range)
//       and the two BR-12 plans, [Minimal change, Balanced week]; inputs are not mutated;
//       O(c·(n + c + s + m log m)) per greedy pass, at most c + 1 passes per plan
export function planReplan(input: ReplanInput): {
  movableCount: number;
  plans: [ReplanPlan, ReplanPlan];
} {
  const inRange = eventsIntersecting(input.events, input.range);
  const movable = inRange
    .filter((event) => event.flexible && event.start >= input.notBefore)
    .toSorted(compareMovable);
  const movableIds = new Set(movable.map((event) => event.id));
  // Expanded by the buffer, so an event just outside the range still pushes its buffer into it.
  const staticEvents = eventsIntersecting(
    input.events,
    expand(input.range, input.bufferMin),
  ).filter((event) => !movableIds.has(event.id));

  return {
    movableCount: movable.length,
    plans: [
      runPlan('minimalChange', movable, staticEvents, inRange, input),
      runPlan('balanced', movable, staticEvents, inRange, input),
    ],
  };
}
