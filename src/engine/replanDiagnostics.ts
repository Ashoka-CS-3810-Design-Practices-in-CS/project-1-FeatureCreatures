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

// PRE:  event intersects the range and is unchanged by plan; notBefore is rounded now;
//       unplaced is plan's entry for event, if it failed placement
// POST: explains its exclusion in order: fixed, started, failed outside-flex placement, no slot
function exclusionReason(
  event: CalendarEvent,
  notBefore: Minute,
  unplaced: ReplanPlan['unplaced'][number] | undefined,
): ReplanNotMoved['reason'] {
  if (!event.flexible) return 'fixed';
  if (event.start < notBefore) return 'started';
  return unplaced?.reason?.kind === 'outsideFlexWindow' ? 'outsideFlexWindow' : 'noSlot';
}

// PRE:  events are valid and sorted; frames cover range's whole local days;
//       plan is a BR-12 plan over events/range at notBefore (rounded now)
// POST: returns one entry per unchanged in-range event left unplaced or still in a conflict/barred
//       overlap AFTER this plan, in original event order, with deduplicated problem names;
//       no inputs, placements or plan metrics are changed
export function diagnoseReplan(
  events: readonly CalendarEvent[],
  frames: readonly DayFrame[],
  range: Interval,
  notBefore: Minute,
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

  // INVARIANT: every visited warning intersecting range is recorded once by label for its event
  for (const warning of detectBarredOverlaps(projected, frames)) {
    if (overlaps(warning.overlap, range)) {
      (problems.get(warning.eventId) as RemainingProblems).barredLabels.add(warning.label);
    }
  }
  // POST: each event's remaining barred labels are recorded only for the selected range

  // INVARIANT: both participants of each visited in-range conflict record the other's title
  for (const conflict of detectConflicts(projected)) {
    if (overlaps(conflict.overlap, range)) {
      const first = byId.get(conflict.aId) as CalendarEvent;
      const second = byId.get(conflict.bId) as CalendarEvent;
      (problems.get(first.id) as RemainingProblems).conflictTitles.add(second.title);
      (problems.get(second.id) as RemainingProblems).conflictTitles.add(first.title);
    }
  }
  // POST: conflicts resolved by the plan do not contribute diagnostic entries

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
        reason: exclusionReason(event, notBefore, unplaced.get(event.id)),
        barredLabels: [...remaining.barredLabels],
        conflictTitles: [...remaining.conflictTitles],
      });
    }
  }
  // POST: entries contains exactly the relevant events, deduplicated and in original order
  return entries;
}
