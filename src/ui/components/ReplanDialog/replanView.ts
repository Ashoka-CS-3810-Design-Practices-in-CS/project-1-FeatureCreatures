import { REPLAN_STRATEGY_LABELS } from '@/shared/constants';
import { startOfLocalDay } from '@/shared/time';
import type { Minute, ReplanMove, ReplanNotMoved, ReplanResult } from '@/shared/types';
import { fmtDay, fmtTime } from '../../format/time';

export interface PlanDiagnostic extends ReplanNotMoved {
  readonly planNames: readonly string[];
}

// PRE: result is a validated ReplanResult
// POST: unions remaining problems by event id in first-seen order, retaining each affected plan name
export function combinedNotMoved(result: ReplanResult): PlanDiagnostic[] {
  const entries = new Map<string, PlanDiagnostic>();
  // INVARIANT: entries merges all diagnostics of the visited plans without duplicate event ids
  for (const plan of result.plans) {
    const planName =
      plan.id === 'minimalChange' ? 'Minimal change' : REPLAN_STRATEGY_LABELS[result.strategy];
    // INVARIANT: entries includes the visited diagnostics from this plan and all earlier plans
    for (const entry of result.notMoved[plan.id]) {
      const previous = entries.get(entry.eventId);
      entries.set(entry.eventId, {
        ...entry,
        barredLabels: [...new Set([...(previous?.barredLabels ?? []), ...entry.barredLabels])],
        conflictTitles: [
          ...new Set([...(previous?.conflictTitles ?? []), ...entry.conflictTitles]),
        ],
        planNames: [...(previous?.planNames ?? []), planName],
      });
    }
    // POST: every diagnostic from this plan is merged
  }
  // POST: entries contains the union across both plans, with their names
  return [...entries.values()];
}

// PRE: moves are valid Replan moves
// POST: returns destination-day groups in date/time order without changing moves
export function movesByDay(moves: readonly ReplanMove[]): { day: Minute; moves: ReplanMove[] }[] {
  const groups = new Map<Minute, ReplanMove[]>();
  // INVARIANT: groups contains the visited moves in ascending destination time within day order
  for (const move of moves.toSorted((first, second) => first.to.start - second.to.start)) {
    const day = startOfLocalDay(move.to.start);
    const group = groups.get(day) ?? [];
    group.push(move);
    groups.set(day, group);
  }
  // POST: groups holds every move once, grouped by destination day
  return [...groups].map(([day, grouped]) => ({ day, moves: grouped }));
}

// PRE: move is valid
// POST: formats start-to-start movement, naming both days only when they differ
export function compactMoveTime(move: ReplanMove): string {
  return startOfLocalDay(move.from.start) === startOfLocalDay(move.to.start)
    ? `${fmtTime(move.from.start)} → ${fmtTime(move.to.start)}`
    : `${fmtDay(move.from.start)} ${fmtTime(move.from.start)} → ${fmtDay(move.to.start)} ${fmtTime(move.to.start)}`;
}

// PRE: reason is a Replan move reason
// POST: returns a short D-15 reason chip label
export function moveReasonChip(reason: ReplanMove['reason']): string {
  switch (reason.kind) {
    case 'outsideFlexWindow':
      return 'outside window';
    case 'outsideWorkingHours':
      return 'working hours';
    case 'barred':
      return 'barred';
    case 'conflict':
      return 'conflict';
    case 'buffer':
      return 'buffer';
    case 'balance':
      return 'balance';
    case 'strategy':
      return REPLAN_STRATEGY_LABELS[reason.strategy];
  }
}
