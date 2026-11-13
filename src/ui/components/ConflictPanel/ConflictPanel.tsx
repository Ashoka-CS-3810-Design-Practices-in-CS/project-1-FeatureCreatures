import { CONFLICT_LIST_LIMIT } from '@/shared/constants';
import type { Conflict } from '@/shared/types';
import { useId, useState } from 'react';
import { fmtDuration, fmtRange } from '../../format/time';
import { useAppStore } from '../../store/appStore';
import { eventIsVisible, upcomingOverlaps } from '../../store/selectors';
import { BarredOverlapPanel } from './BarredOverlapPanel';

// PRE:  conflicts is one time group's ordered list; past determines its name and actions;
//       reads snapshot.events, eventPriorityFilter, hiddenCategoryIds; uses openAlternatives
// POST: renders up to CONFLICT_LIST_LIMIT rows and the remainder count, keeping full overlap
//       details and hidden-filter hints; only upcoming rows offer Suggest alternatives
function ConflictList({ conflicts, past }: { conflicts: readonly Conflict[]; past: boolean }) {
  const events = useAppStore((state) => state.snapshot.events);
  const filter = useAppStore((state) => state.eventPriorityFilter);
  const hiddenCategories = useAppStore((state) => state.hiddenCategoryIds);
  const openAlternatives = useAppStore((state) => state.actions.openAlternatives);
  const byId = new Map(events.map((event) => [event.id, event]));
  const shown = conflicts.slice(0, CONFLICT_LIST_LIMIT);

  return (
    <>
      <ul aria-label={past ? 'Past conflict list' : 'Conflict list'}>
        {shown.map((conflict) => {
          const first = byId.get(conflict.aId);
          const second = byId.get(conflict.bId);
          const names = `${first?.title ?? conflict.aId} ↔ ${second?.title ?? conflict.bId}`;
          const hidden = [first, second].some(
            (event) => event !== undefined && !eventIsVisible(event, filter, hiddenCategories),
          );
          return (
            <li key={conflict.key}>
              <strong>⚠ {names}</strong>{' '}
              <span>
                {fmtRange(conflict.overlap)} ({fmtDuration(conflict.minutes)})
              </span>
              {hidden && <span className="hint"> (hidden by filter)</span>}{' '}
              {!past && (
                <button
                  type="button"
                  aria-label={`Suggest alternatives for ${names}`}
                  onClick={() => openAlternatives(conflict)}
                >
                  Suggest alternatives
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {conflicts.length > CONFLICT_LIST_LIMIT && (
        <p>and {conflicts.length - CONFLICT_LIST_LIMIT} more</p>
      )}
    </>
  );
}

// PRE:  rendered under StoreProvider; reads snapshot.conflicts and currentMinute
//       + additional props from: ConflictList, BarredOverlapPanel
// POST: counts/lists upcoming conflicts independently of filters; Past starts collapsed and
//       reveals read-only history, classified by overlap.end ≤ now (D-08)
export function ConflictPanel() {
  const conflicts = useAppStore((state) => state.snapshot.conflicts);
  const now = useAppStore((state) => state.currentMinute);
  const upcoming = upcomingOverlaps(conflicts, now);
  const past = conflicts.filter((conflict) => conflict.overlap.end <= now);
  const [pastOpen, setPastOpen] = useState(false);
  const pastId = useId();
  return (
    <section aria-labelledby="conflict-panel-title" className="conflict-panel">
      <h2 id="conflict-panel-title">Conflicts ({upcoming.length})</h2>
      <h3>Upcoming ({upcoming.length})</h3>
      {upcoming.length === 0 ? (
        <p>No conflicts</p>
      ) : (
        <ConflictList conflicts={upcoming} past={false} />
      )}
      <button
        type="button"
        aria-expanded={pastOpen}
        aria-controls={pastId}
        onClick={() => setPastOpen(!pastOpen)}
      >
        Past ({past.length})
      </button>
      <div id={pastId} hidden={!pastOpen}>
        {pastOpen &&
          (past.length === 0 ? <p>No past conflicts</p> : <ConflictList conflicts={past} past />)}
      </div>
      <BarredOverlapPanel />
    </section>
  );
}
