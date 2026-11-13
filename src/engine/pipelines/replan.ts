// Replan pipeline (TECH_SPEC §7.4.4, FR10): build the inputs for the pure replan heuristics, and
// apply one of the two plans as a single undoable change.

import { MAX_REPLAN_DAYS } from '@/shared/constants';
import type { EngineError } from '@/shared/errors';
import { err, ok, type Result } from '@/shared/result';
import { parseInput, searchOptionsSchema } from '@/shared/schemas';
import { addLocalDays, buildDayFrames, startOfLocalDay } from '@/shared/time';
import type { CalendarEvent, Interval, Minute, ReplanPlan, ReplanResult } from '@/shared/types';
import { planReplan as planWithHeuristics } from '../algorithms/replanHeuristics';
import { diagnoseReplan } from '../replanDiagnostics';
import { notBeforeFor, requireCurrentVersion, requireNotPast, segmentsFor } from '../search';
import {
  commit,
  type EngineState,
  type PipelineContext,
  type PipelineOutcome,
  type RecordChange,
  unchangedOutcome,
} from '../state';

export interface PlanReplanRequest {
  range: Interval;
  bufferMin?: number;
}

export interface ApplyReplanRequest {
  baseVersion: number;
  planId: ReplanPlan['id'];
}

// PRE:  minute is a number
// POST: returns true iff minute is a local midnight
function isLocalMidnight(minute: Minute): boolean {
  return startOfLocalDay(minute) === minute;
}

// PRE:  range comes from the UI
// POST: returns ok when range is BR-12's: both ends at a local midnight and 1 to MAX_REPLAN_DAYS
//       local days long (so DST days count as days, AUDIT note), else err InvalidTime at 'range'
function requireReplanRange(range: Interval): Result<null, EngineError> {
  if (
    isLocalMidnight(range.start) &&
    isLocalMidnight(range.end) &&
    range.end > range.start &&
    range.end <= addLocalDays(range.start, MAX_REPLAN_DAYS)
  ) {
    return ok(null);
  }
  return err({
    code: 'InvalidTime',
    issues: [{ path: 'range', message: 'The replan range must be 1 to 14 days long.' }],
  });
}

// PRE:  state.events is sorted; request comes from outside; now is the current unrounded Minute
// POST: returns both BR-12 plans for request.range (buffer = request.bufferMin ?? settings.bufferMin)
//       with the version and per-plan remaining-problem diagnostics; err InvalidInput for a bad bufferMin, or
//       InvalidTime for a bad range
export function planReplan(
  state: EngineState,
  request: PlanReplanRequest,
  now: Minute,
): Result<ReplanResult, EngineError> {
  const notBefore = notBeforeFor(now);
  const options = parseInput(searchOptionsSchema, { bufferMin: request.bufferMin });
  if (!options.ok) {
    return options;
  }
  const range = requireReplanRange(request.range);
  if (!range.ok) {
    return range;
  }
  const bufferMin = options.value.bufferMin ?? state.settings.bufferMin;
  const frames = buildDayFrames(request.range, state.settings);
  const { movableCount, plans } = planWithHeuristics({
    events: state.events,
    conflicts: state.conflicts,
    frames,
    range: request.range,
    bufferMin,
    notBefore,
    useWorkingHours: state.settings.useWorkingHours,
    segmentsFor: segmentsFor(state, notBefore),
  });
  return ok({
    baseVersion: state.version,
    range: request.range,
    bufferMin,
    movableCount,
    plans,
    notMoved: {
      minimalChange: diagnoseReplan(state.events, frames, request.range, now, plans[0]),
      balanced: diagnoseReplan(state.events, frames, request.range, now, plans[1]),
    },
  });
}

// PRE:  lastReplan is the engine's latest planReplan result, or null; request comes from the UI
// POST: moves every event of the chosen plan in one change labelled 'Replan: <n> event(s) moved'
//       (a plan without moves returns ok with the state unchanged and the label ''); err
//       StaleResult unless lastReplan exists and was computed at the current version, and no
//       moved event or move target starts before notBeforeFor(now) any more (ER7, AUDIT A07)
export async function applyReplan(
  context: PipelineContext,
  lastReplan: ReplanResult | null,
  request: ApplyReplanRequest,
): Promise<Result<PipelineOutcome, EngineError>> {
  if (lastReplan === null || lastReplan.baseVersion !== request.baseVersion) {
    return err({ code: 'StaleResult' });
  }
  const current = requireCurrentVersion(context.state, request.baseVersion);
  if (!current.ok) {
    return current;
  }
  const [minimalChange, balanced] = lastReplan.plans;
  const plan = request.planId === 'balanced' ? balanced : minimalChange;
  if (plan.moves.length === 0) {
    return ok(unchangedOutcome(context.state));
  }
  // A moved event that has started since, or a target already past, makes the plan stale (FR10).
  const earliestStart = Math.min(...plan.moves.flatMap((move) => [move.from.start, move.to.start]));
  const upcoming = requireNotPast(earliestStart, context.now);
  if (!upcoming.ok) {
    return upcoming;
  }

  const byId = new Map(context.state.events.map((event) => [event.id, event]));
  // The version check above means the plan was computed on exactly these events, so every move's
  // event exists. Durations are unchanged by a replan, so no task needs mirroring (BR-9).
  const changes: RecordChange<CalendarEvent>[] = plan.moves.map((move) => {
    const before = byId.get(move.eventId) as CalendarEvent;
    return {
      id: move.eventId,
      before,
      after: { ...before, start: move.to.start, end: move.to.end, updatedAt: context.now },
    };
  });
  const count = plan.moves.length;
  const committed = await commit(
    context.state,
    {
      label: `Replan: ${count} ${count === 1 ? 'event' : 'events'} moved`,
      events: changes,
      tasks: [],
    },
    'do',
    context.repo,
  );
  return committed.ok ? ok({ ...committed.value, suggestion: null }) : committed;
}
