import type FullCalendar from '@fullcalendar/react';
import type { RefObject } from 'react';
import type { Priority } from '@/shared/types';
import { fmtViewTitle } from '../../format/time';
import { useAppStore, type ViewType } from '../../store/appStore';
import { CategoryTag } from '../Categories/CategoryTag';

const VIEWS: { type: ViewType; label: string }[] = [
  { type: 'timeGridDay', label: 'Day' },
  { type: 'timeGridWeek', label: 'Week' },
  { type: 'dayGridMonth', label: 'Month' },
];
// The chips show the [H]/[M]/[L] tags of BR-13; the tooltip spells the priority out.
const PRIORITY_CHIPS: { priority: Priority; tag: string; title: string }[] = [
  { priority: 'high', tag: 'H', title: 'Show high-priority events' },
  { priority: 'medium', tag: 'M', title: 'Show medium-priority events' },
  { priority: 'low', tag: 'L', title: 'Show low-priority events' },
];
// PRE: StoreProvider supplies calendar view, lock, priority/category filters and actions;
//      calendarRef points at CalendarView's FullCalendar
//      + additional props from: CategoryTag
// POST: shows calendar-only navigation/title/view row and presentation/filter/lock/+ Event row
export function Toolbar({ calendarRef }: { calendarRef: RefObject<FullCalendar | null> }) {
  const view = useAppStore((state) => state.view);
  const lastCalendarView = useAppStore((state) => state.lastCalendarView);
  const locked = useAppStore((state) => state.calendarLocked);
  const filter = useAppStore((state) => state.eventPriorityFilter);
  const categories = useAppStore((state) => state.snapshot.categories);
  const hiddenCategories = useAppStore((state) => state.hiddenCategoryIds);
  const actions = useAppStore((state) => state.actions);
  const calendar = () => calendarRef.current?.getApi();

  return (
    <div className="toolbar">
      <div className="toolbar-period">
        <div role="group" aria-label="Navigation">
          <button type="button" aria-label="Previous period" onClick={() => calendar()?.prev()}>
            ◀
          </button>
          <button type="button" onClick={() => calendar()?.today()}>
            Today
          </button>
          <button type="button" aria-label="Next period" onClick={() => calendar()?.next()}>
            ▶
          </button>
        </div>
        <h2 className="toolbar-title">{fmtViewTitle(view.type, view.date)}</h2>
        <div role="group" aria-label="View">
          {VIEWS.map((option) => (
            <button
              key={option.type}
              type="button"
              aria-pressed={view.type === option.type}
              onClick={() => calendar()?.changeView(option.type)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="toolbar-controls">
        <div role="group" aria-label="Presentation">
          <button
            type="button"
            aria-pressed={view.type !== 'listWeek'}
            onClick={() => calendar()?.changeView(lastCalendarView)}
          >
            Calendar
          </button>
          <button
            type="button"
            aria-pressed={view.type === 'listWeek'}
            onClick={() => calendar()?.changeView('listWeek')}
          >
            List
          </button>
        </div>
        <div className="calendar-filters">
          <div role="group" aria-label="Priority filter">
            {PRIORITY_CHIPS.map((chip) => (
              <button
                key={chip.priority}
                type="button"
                className={`chip prio-${chip.priority}`}
                title={chip.title}
                aria-pressed={filter.includes(chip.priority)}
                onClick={() => actions.toggleEventPriority(chip.priority)}
              >
                {chip.tag}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Category filter" className="category-filters">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={!hiddenCategories.includes(category.id)}
                onClick={() => actions.toggleEventCategory(category.id)}
              >
                <CategoryTag category={category} />
              </button>
            ))}
          </div>
          <button type="button" onClick={actions.showAllEventPriorities}>
            Reset filters
          </button>
        </div>
        <button
          type="button"
          aria-label="Calendar lock"
          aria-pressed={locked}
          onClick={actions.toggleCalendarLock}
        >
          <span aria-hidden="true">{locked ? '🔒' : '🔓'}</span> {locked ? 'Locked' : 'Unlocked'}
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => actions.openDialog({ kind: 'event', mode: 'create', defaults: {} })}
        >
          + Event
        </button>
      </div>
    </div>
  );
}
