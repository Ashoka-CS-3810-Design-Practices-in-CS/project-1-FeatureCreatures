import type { ReplanMove } from '@/shared/types';
import { PRIORITY_TAGS } from '@/shared/constants';
import { moveText } from '../../format/explain';
import { fmtDay } from '../../format/time';
import { useAppStore } from '../../store/appStore';
import { CategoryTag } from '../Categories/CategoryTag';
import { compactMoveTime, moveReasonChip, movesByDay } from './replanView';

// PRE: moves are valid; name labels the plan; details controls full explanations;
//      StoreProvider supplies snapshot.events/categories for current category identity
//      + additional props from: CategoryTag
// POST: renders compact move rows grouped by destination day, with optional full explanations
export function ReplanMoves({
  moves,
  name,
  details,
}: {
  moves: readonly ReplanMove[];
  name: string;
  details: boolean;
}) {
  const events = useAppStore((state) => state.snapshot.events);
  const categories = useAppStore((state) => state.snapshot.categories);
  const eventCategories = new Map(events.map((event) => [event.id, event.categoryId]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  return (
    <div>
      {movesByDay(moves).map((group) => (
        <section key={group.day} className="replan-move-day">
          <h4>{fmtDay(group.day)}</h4>
          <ul aria-label={`${name} ${fmtDay(group.day)} moves`}>
            {group.moves.map((move) => {
              const category = categoriesById.get(eventCategories.get(move.eventId) ?? '');
              return (
                <li key={move.eventId} className="replan-move-row">
                  <strong>{move.title}</strong>{' '}
                  <span className="tag">{PRIORITY_TAGS[move.priority]}</span>
                  {category !== undefined && <CategoryTag category={category} />}
                  <span>{compactMoveTime(move)}</span>{' '}
                  <span className="tag">{moveReasonChip(move.reason)}</span>
                  {details && <p className="replan-move-details">{moveText(move)}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
