import { useAppStore } from '../../store/appStore';

// PRE:  rendered under StoreProvider; uses actions.loadSample
// POST: tells a first-time visitor the calendar is empty and offers "Load sample week" (B2, W10)
export function EmptyState() {
  const loadSample = useAppStore((state) => state.actions.loadSample);

  return (
    <section aria-labelledby="empty-state-title">
      <h2 id="empty-state-title">Your calendar is empty</h2>
      <p>Add an event or a task, or load a sample week to see conflicts and the planner at work.</p>
      <button type="button" className="primary" onClick={() => void loadSample('sparseWeek')}>
        Load sample week
      </button>
    </section>
  );
}
