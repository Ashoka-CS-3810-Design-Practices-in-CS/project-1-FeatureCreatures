import { useId, useState } from 'react';
import {
  DEFAULT_REPLAN_STRATEGY,
  MAX_REPLAN_DAYS,
  MINUTES_PER_DAY,
  REPLAN_DST_SLACK_MIN,
  REPLAN_STRATEGIES,
  REPLAN_STRATEGY_LABELS,
} from '@/shared/constants';
import type { Result } from '@/shared/result';
import { addLocalDays, startOfLocalWeek } from '@/shared/time';
import type {
  Interval,
  Minute,
  ReplanNotMoved,
  ReplanPlan,
  ReplanResult,
  ReplanStrategy,
} from '@/shared/types';
import { errorMessage } from '../../format/errors';
import { fmtDuration } from '../../format/time';
import { fromDateInput, toDateInput } from '../../forms/eventForm';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';
import { NotMovedList } from './NotMovedList';
import { ReplanMoves } from './ReplanMoves';
import { combinedNotMoved } from './replanView';

const LAST_DAY_OF_WEEK = 6; // Sunday, counted from Monday
// The engine's limit on a replan range (TECH_SPEC §7.4.4), DST slack included.
const MAX_REPLAN_SPAN_MIN = MAX_REPLAN_DAYS * MINUTES_PER_DAY + REPLAN_DST_SLACK_MIN;

// PRE:  activeRange is the visible range, or null; viewDate is the first day of the shown period
// POST: returns the default first and last day: the week of viewDate while no range is known;
//       the visible range when a replan may cover it; else the first full week (Monday–Sunday)
//       starting on or after viewDate. Month shows 35–42 days, more than MAX_REPLAN_DAYS, so it
//       gets that week (AUDIT A10)
function defaultDays(activeRange: Interval | null, viewDate: Minute): { from: string; to: string } {
  if (activeRange !== null && activeRange.end - activeRange.start <= MAX_REPLAN_SPAN_MIN) {
    return {
      from: toDateInput(activeRange.start),
      to: toDateInput(addLocalDays(activeRange.end, -1)),
    };
  }
  const monday = startOfLocalWeek(
    activeRange === null ? viewDate : addLocalDays(viewDate, LAST_DAY_OF_WEEK),
  );
  return { from: toDateInput(monday), to: toDateInput(addLocalDays(monday, LAST_DAY_OF_WEEK)) };
}

// PRE: plan is computed; name labels it; notMoved describes its remaining problems;
//      details controls full metrics; onApply applies this plan
//      + additional props from: ReplanMoves
// POST: shows the move/conflict headline and grouped moves, full metrics only in Details;
//       a plan with no moves says No changes needed only if no diagnostic entries remain
function PlanCard({
  plan,
  notMoved,
  name,
  details,
  onApply,
}: {
  plan: ReplanPlan;
  notMoved: readonly ReplanNotMoved[];
  name: string;
  details: boolean;
  onApply: () => void;
}) {
  const { metrics } = plan;
  return (
    <section aria-label={name} className="plan-card">
      <h3>{name}</h3>
      <p className="plan-headline">
        {metrics.moved} {metrics.moved === 1 ? 'move' : 'moves'} · conflicts{' '}
        {metrics.conflictsBefore} → {metrics.conflictsAfter}
      </p>
      {details && (
        <ul>
          <li>Moved: {metrics.moved}</li>
          <li>Total shift: {fmtDuration(metrics.totalShiftMin)}</li>
          <li>
            Conflicts: {metrics.conflictsBefore} → {metrics.conflictsAfter}
          </li>
          <li>
            Day-load spread: {fmtDuration(metrics.loadSpreadBeforeMin)} →{' '}
            {fmtDuration(metrics.loadSpreadAfterMin)}
          </li>
          <li>Unplaced: {metrics.unplaced}</li>
        </ul>
      )}
      {plan.moves.length === 0 && (
        <p>
          {notMoved.length === 0
            ? 'No changes needed'
            : `No moves in this plan — ${notMoved.length} ${notMoved.length === 1 ? 'event still needs' : 'events still need'} attention.`}
        </p>
      )}
      {plan.moves.length > 0 && <ReplanMoves moves={plan.moves} name={name} details={details} />}
      {plan.moves.length > 0 && (
        <button type="button" className="primary" aria-label={`Apply ${name}`} onClick={onApply}>
          Apply this plan
        </button>
      )}
    </section>
  );
}

// PRE:  rendered under StoreProvider; reads view and snapshot.settings; uses computeReplan,
//       applyReplan, openEventAlternatives and closeDialog
//       + additional props from: Modal, PlanCard, NotMovedList
// POST: shows the replan form (first and last day, defaulting to the visible week, and a buffer
//       override behind Details), Strategy and Compute plans, then compact plan cards and shared collapsed diagnostics, or "No flexible events
//       in this range", or the range / buffer problem, until an input changes; applying a plan
//       closes the dialog
function ReplanForm() {
  const view = useAppStore((state) => state.view);
  const settingsBuffer = useAppStore((state) => state.snapshot.settings.bufferMin);
  const actions = useAppStore((state) => state.actions);
  const idPrefix = useId();
  const [days, setDays] = useState(() => defaultDays(view.activeRange, view.date));
  const [buffer, setBuffer] = useState('');
  const [strategy, setStrategy] = useState<ReplanStrategy>(DEFAULT_REPLAN_STRATEGY);
  const [details, setDetails] = useState(false);
  const [result, setResult] = useState<Result<ReplanResult> | null>(null);

  // PRE:  update applies one edit of From, To or Buffer
  // POST: applies it and drops the computed plans: they were made for the old inputs, and Apply
  //       must never use a plan other than what the form shows (AUDIT A08)
  function editInput(update: () => void): void {
    update();
    setResult(null);
  }

  // PRE:  none
  // POST: computes both plans for [from 00:00, the day after to 00:00) and shows them
  function compute(): void {
    const range = { start: fromDateInput(days.from), end: addLocalDays(fromDateInput(days.to), 1) };
    const bufferMin = buffer.trim() === '' ? undefined : Number(buffer);
    setResult(actions.computeReplan(range, bufferMin, strategy));
  }

  // PRE:  plans is the shown result; planId names one of its plans
  // POST: applies the plan; closes on success, recomputes when the calendar changed (ER7)
  async function apply(plans: ReplanResult, planId: ReplanPlan['id']): Promise<void> {
    const applied = await actions.applyReplan(plans.baseVersion, planId);
    if (applied.ok) {
      actions.closeDialog();
    } else if (applied.error.code === 'StaleResult') {
      compute();
    }
  }

  return (
    <Modal open title="Replan" onClose={actions.closeDialog} className="replan-dialog">
      <div className="replan-inputs">
        <label>
          From
          <input
            id={`${idPrefix}-from`}
            type="date"
            value={days.from}
            onChange={(event) => editInput(() => setDays({ ...days, from: event.target.value }))}
          />
        </label>
        <label>
          To
          <input
            id={`${idPrefix}-to`}
            type="date"
            value={days.to}
            onChange={(event) => editInput(() => setDays({ ...days, to: event.target.value }))}
          />
        </label>
        <label>
          Strategy{' '}
          <select
            value={strategy}
            onChange={(event) => editInput(() => setStrategy(event.target.value as ReplanStrategy))}
          >
            {REPLAN_STRATEGIES.map((value) => (
              <option key={value} value={value}>
                {REPLAN_STRATEGY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={compute}>
          Compute plans
        </button>
      </div>
      <button type="button" aria-expanded={details} onClick={() => setDetails(!details)}>
        Details
      </button>
      {details && (
        <>
          <label htmlFor={`${idPrefix}-buffer`}>Buffer (min)</label>
          <input
            id={`${idPrefix}-buffer`}
            type="number"
            min={0}
            placeholder={String(settingsBuffer)}
            value={buffer}
            onChange={(event) => editInput(() => setBuffer(event.target.value))}
          />
        </>
      )}

      {result !== null && !result.ok && <p role="alert">{errorMessage(result.error)}</p>}
      {result?.ok === true &&
        result.value.movableCount === 0 &&
        result.value.plans.every((plan) => result.value.notMoved[plan.id].length === 0) && (
          <p>No flexible events in this range</p>
        )}
      {result?.ok === true &&
        (result.value.movableCount > 0 ||
          result.value.plans.some((plan) => result.value.notMoved[plan.id].length > 0)) && (
          <>
            <div className="plan-cards">
              {result.value.plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  notMoved={result.value.notMoved[plan.id]}
                  name={
                    plan.id === 'minimalChange'
                      ? 'Minimal change'
                      : REPLAN_STRATEGY_LABELS[result.value.strategy]
                  }
                  details={details}
                  onApply={() => void apply(result.value, plan.id)}
                />
              ))}
            </div>
            <NotMovedList
              entries={combinedNotMoved(result.value)}
              details={details}
              onSuggest={actions.openEventAlternatives}
            />
          </>
        )}

      <div className="dialog-actions">
        <button type="button" onClick={actions.closeDialog}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// PRE:  rendered under StoreProvider; reads dialog
//       + additional props from: ReplanForm
// POST: while the replan dialog is open, shows its form (fresh each time it opens)
export function ReplanDialog() {
  const dialog = useAppStore((state) => state.dialog);
  return dialog?.kind === 'replan' ? <ReplanForm /> : null;
}
