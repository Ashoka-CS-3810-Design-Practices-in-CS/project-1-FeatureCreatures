import { useId, useState } from 'react';
import type { Result } from '@/shared/result';
import { addLocalDays, startOfLocalWeek } from '@/shared/time';
import type { Interval, Minute, ReplanPlan, ReplanResult } from '@/shared/types';
import { errorMessage } from '../../format/errors';
import { moveReasonText, moveText } from '../../format/explain';
import { fmtDuration } from '../../format/time';
import { fromDateInput, toDateInput } from '../../forms/eventForm';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';

const LAST_DAY_OF_WEEK = 6; // Sunday, counted from Monday
const PLAN_NAME: Record<ReplanPlan['id'], string> = {
  minimalChange: 'Minimal change',
  balanced: 'Balanced week',
};

// PRE:  activeRange is the visible range, or null; viewDate is the calendar's date
// POST: returns the default first and last day: the visible range, or the week of viewDate
function defaultDays(activeRange: Interval | null, viewDate: Minute): { from: string; to: string } {
  if (activeRange !== null) {
    return {
      from: toDateInput(activeRange.start),
      to: toDateInput(addLocalDays(activeRange.end, -1)),
    };
  }
  const monday = startOfLocalWeek(viewDate);
  return { from: toDateInput(monday), to: toDateInput(addLocalDays(monday, LAST_DAY_OF_WEEK)) };
}

// PRE:  plan is one of the computed plans; onApply applies it
// POST: shows the plan card: its metrics, its moves with their reasons, the events left unplaced,
//       and Apply this plan (or "No changes needed")
function PlanCard({ plan, onApply }: { plan: ReplanPlan; onApply: () => void }) {
  const { metrics } = plan;
  const name = PLAN_NAME[plan.id];
  return (
    <section aria-label={name} className="plan-card">
      <h3>{name}</h3>
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
      {plan.moves.length > 0 && (
        <ul aria-label={`${name} moves`}>
          {plan.moves.map((move) => (
            <li key={move.eventId}>{moveText(move)}</li>
          ))}
        </ul>
      )}
      {plan.unplaced.length > 0 && (
        <ul aria-label={`${name} unplaced`}>
          {plan.unplaced.map((entry) => (
            <li key={entry.eventId}>
              &quot;{entry.title}&quot; stays where it is:{' '}
              {entry.reason === null
                ? 'no free slot'
                : `${moveReasonText(entry.reason)}, no free slot`}
            </li>
          ))}
        </ul>
      )}
      {plan.moves.length === 0 ? (
        <p>No changes needed</p>
      ) : (
        <button type="button" className="primary" aria-label={`Apply ${name}`} onClick={onApply}>
          Apply this plan
        </button>
      )}
    </section>
  );
}

// PRE:  rendered under StoreProvider; reads view and snapshot.settings; uses computeReplan,
//       applyReplan and closeDialog
//       + additional props from: Modal, PlanCard
// POST: shows the replan form (first and last day, defaulting to the visible week, and a buffer
//       override), Compute plans, and then the two plan cards side by side, or "No flexible events
//       in this range", or the range / buffer problem; applying a plan closes the dialog
function ReplanForm() {
  const view = useAppStore((state) => state.view);
  const settingsBuffer = useAppStore((state) => state.snapshot.settings.bufferMin);
  const actions = useAppStore((state) => state.actions);
  const idPrefix = useId();
  const [days, setDays] = useState(() => defaultDays(view.activeRange, view.date));
  const [buffer, setBuffer] = useState('');
  const [result, setResult] = useState<Result<ReplanResult> | null>(null);

  // PRE:  none
  // POST: computes both plans for [from 00:00, the day after to 00:00) and shows them
  function compute(): void {
    const range = { start: fromDateInput(days.from), end: addLocalDays(fromDateInput(days.to), 1) };
    const bufferMin = buffer.trim() === '' ? undefined : Number(buffer);
    setResult(actions.computeReplan(range, bufferMin));
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
    <Modal open title="Replan" onClose={actions.closeDialog}>
      <label htmlFor={`${idPrefix}-from`}>From</label>
      <input
        id={`${idPrefix}-from`}
        type="date"
        value={days.from}
        onChange={(event) => setDays({ ...days, from: event.target.value })}
      />
      <label htmlFor={`${idPrefix}-to`}>To</label>
      <input
        id={`${idPrefix}-to`}
        type="date"
        value={days.to}
        onChange={(event) => setDays({ ...days, to: event.target.value })}
      />
      <label htmlFor={`${idPrefix}-buffer`}>Buffer (min)</label>
      <input
        id={`${idPrefix}-buffer`}
        type="number"
        min={0}
        placeholder={String(settingsBuffer)}
        value={buffer}
        onChange={(event) => setBuffer(event.target.value)}
      />
      <button type="button" onClick={compute}>
        Compute plans
      </button>

      {result !== null && !result.ok && <p role="alert">{errorMessage(result.error)}</p>}
      {result?.ok === true && result.value.movableCount === 0 && (
        <p>No flexible events in this range</p>
      )}
      {result?.ok === true && result.value.movableCount > 0 && (
        <div className="plan-cards">
          {result.value.plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onApply={() => void apply(result.value, plan.id)} />
          ))}
        </div>
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
