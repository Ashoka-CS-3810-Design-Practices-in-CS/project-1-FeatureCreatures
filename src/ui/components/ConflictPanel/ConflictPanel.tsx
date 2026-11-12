import { CONFLICT_LIST_LIMIT } from '@/shared/constants';
import { fmtDuration, fmtRange } from '../../format/time';
import { useAppStore } from '../../store/appStore';
import { eventIsVisible } from '../../store/selectors';
import { BarredOverlapPanel } from './BarredOverlapPanel';

// PRE:  rendered under StoreProvider; reads snapshot.conflicts, snapshot.events and
//       eventPriorityFilter; uses actions.openAlternatives
//       + additional props from: BarredOverlapPanel
// POST: lists the first CONFLICT_LIST_LIMIT conflicts ("⚠ A ↔ B", overlap and minutes), notes
//       "(hidden by filter)" when either event is filtered out of the calendar (FR6), and offers
//       Suggest alternatives for each; says "No conflicts" when there are none
export function ConflictPanel() {
  const conflicts = useAppStore((state) => state.snapshot.conflicts);
  const events = useAppStore((state) => state.snapshot.events);
  const filter = useAppStore((state) => state.eventPriorityFilter);
  const hiddenCategories = useAppStore((state) => state.hiddenCategoryIds);
  const openAlternatives = useAppStore((state) => state.actions.openAlternatives);
  const byId = new Map(events.map((event) => [event.id, event]));
  const shown = conflicts.slice(0, CONFLICT_LIST_LIMIT);

  return (
    <section aria-labelledby="conflict-panel-title" className="conflict-panel">
      <h2 id="conflict-panel-title">Conflicts ({conflicts.length})</h2>
      {conflicts.length === 0 ? (
        <p>No conflicts</p>
      ) : (
        <ul aria-label="Conflict list">
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
                <button
                  type="button"
                  aria-label={`Suggest alternatives for ${names}`}
                  onClick={() => openAlternatives(conflict)}
                >
                  Suggest alternatives
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {conflicts.length > CONFLICT_LIST_LIMIT && (
        <p>and {conflicts.length - CONFLICT_LIST_LIMIT} more</p>
      )}
      <BarredOverlapPanel />
    </section>
  );
}
