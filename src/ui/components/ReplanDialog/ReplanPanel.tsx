import { useState } from 'react';
import {
  DEFAULT_REPLAN_STRATEGY,
  SNAP_MIN,
  REPLAN_STRATEGIES,
  REPLAN_STRATEGY_LABELS,
} from '@/shared/constants';
import { addLocalDays, ceilTo } from '@/shared/time';
import type { ReplanStrategy } from '@/shared/types';
import { fromDateInput } from '../../forms/eventForm';
import { fmtDay } from '../../format/time';
import { useAppStore } from '../../store/appStore';
import { defaultReplanDays } from './ReplanDialog';

// PRE: StoreProvider supplies calendar view, snapshot.events/currentMinute and openDialog
// POST: shows the default visible range, movable count, second-plan strategy and one Plan… action
export function ReplanPanel() {
  const view = useAppStore((state) => state.view);
  const events = useAppStore((state) => state.snapshot.events);
  const now = useAppStore((state) => state.currentMinute);
  const openDialog = useAppStore((state) => state.actions.openDialog);
  const [strategy, setStrategy] = useState<ReplanStrategy>(DEFAULT_REPLAN_STRATEGY);
  const days = defaultReplanDays(view.activeRange, view.date);
  const start = fromDateInput(days.from);
  const end = addLocalDays(fromDateInput(days.to), 1);
  const movable = events.filter(
    (event) =>
      event.flexible &&
      event.start >= ceilTo(now, SNAP_MIN) &&
      event.start < end &&
      event.end > start,
  ).length;
  return (
    <section aria-label="Replan" className="replan-panel">
      <h2>Replan ({movable})</h2>
      <p>
        {fmtDay(start)} – {fmtDay(fromDateInput(days.to))}
      </p>
      <label>
        Strategy{' '}
        <select
          value={strategy}
          onChange={(event) => setStrategy(event.target.value as ReplanStrategy)}
        >
          {REPLAN_STRATEGIES.map((value) => (
            <option key={value} value={value}>
              {REPLAN_STRATEGY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="primary"
        onClick={() => openDialog({ kind: 'replan', strategy })}
      >
        Plan…
      </button>
    </section>
  );
}
