import type {
  CalendarEvent,
  DayFrame,
  Interval,
  Minute,
  ReplanNotMoved,
  ReplanPlan,
} from '@/shared/types';
import { detectBarredOverlaps } from './algorithms/barred';
import { overlaps } from './algorithms/interval';
import { compareEvents } from './algorithms/sortedArray';
import { detectConflicts } from './algorithms/sweep';

interface RemainingProblems {
  barredLabels: Set<string>;
  conflictTitles: Set<string>;
}

// PRE:  event intersects the range and is unchanged by plan; now is the current unrounded Minute;
//       unplaced is plan's entry for event, if it failed placement
// POST: explains its exclusion in order: fixed, started, failed outside-flex placement, no slot
function exclusionReason(
  event: CalendarEvent,
  now: Minute,
  unplaced: ReplanPlan['unplaced'][number] | undefined,
): ReplanNotMoved['reason'] {
  if (!event.flexible) return 'fixed';
  if (event.start <= now && event.end > now) return 'started';
  return unplaced?.reason?.kind === 'outsideFlexWindow' ? 'outsideFlexWindow' : 'noSlot';
}

// PRE:  events are valid and sorted; frames cover range's whole local days;
//       plan is a BR-12 plan over events/range at ceil(now, SNAP_MIN)
// POST: returns one entry per unchanged in-range event left unplaced or still in a conflict/barred
//       unkept overlap AFTER this plan whose end > now, in original event order, with deduplicated problem names;
//       no inputs, placements or plan metrics are changed
export function diagnoseReplan(
  events: readonly CalendarEvent[],
  frames: readonly DayFrame[],
  range: Interval,
  now: Minute,
  plan: ReplanPlan,
): ReplanNotMoved[] {
  const moves = new Map(plan.moves.map((move) => [move.eventId, move.to]));
  const projected = events
    .map((event) => ({ ...event, ...moves.get(event.id) }))
    .toSorted(compareEvents);
  const byId = new Map(projected.map((event) => [event.id, event]));
  const problems = new Map<string, RemainingProblems>(
    events.map((event) => [event.id, { barredLabels: new Set(), conflictTitles: new Set() }]),
  );

  // INVARIANT: every visited non-past, unkept warning intersecting range is recorded once by label
  for (const warning of detectBarredOverlaps(projected, frames)) {
    if (
      warning.overlap.end > now &&
      overlaps(warning.overlap, range) &&
      !byId.get(warning.eventId)?.keptInBarred.includes(warning.slotId)
    ) {
      (problems.get(warning.eventId) as RemainingProblems).barredLabels.add(warning.label);
    }
  }
  // POST: each event's non-past, unkept barred labels are recorded only for the selected range

  // INVARIANT: both participants of each visited non-past in-range conflict record the other's title
  for (const conflict of detectConflicts(projected)) {
    if (conflict.overlap.end > now && overlaps(conflict.overlap, range)) {
      const first = byId.get(conflict.aId) as CalendarEvent;
      const second = byId.get(conflict.bId) as CalendarEvent;
      (problems.get(first.id) as RemainingProblems).conflictTitles.add(second.title);
      (problems.get(second.id) as RemainingProblems).conflictTitles.add(first.title);
    }
  }
  // POST: resolved and entirely past conflicts do not contribute diagnostic entries

  const unplaced = new Map(plan.unplaced.map((entry) => [entry.eventId, entry]));
  const entries: ReplanNotMoved[] = [];
  // INVARIANT: entries describes each visited unchanged in-range event with a remaining problem
  for (const event of events) {
    if (moves.has(event.id) || !overlaps(event, range)) continue;
    const remaining = problems.get(event.id) as RemainingProblems;
    if (
      unplaced.has(event.id) ||
      remaining.barredLabels.size > 0 ||
      remaining.conflictTitles.size > 0
    ) {
      entries.push({
        eventId: event.id,
        title: event.title,
        reason: exclusionReason(event, now, unplaced.get(event.id)),
        barredLabels: [...remaining.barredLabels],
        conflictTitles: [...remaining.conflictTitles],
      });
    }
  }
  // POST: entries contains exactly the relevant events, deduplicated and in original order
  return entries;
}
