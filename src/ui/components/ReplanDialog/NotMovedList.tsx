import type { ReplanNotMoved } from '@/shared/types';

const REASON_TEXT: Record<ReplanNotMoved['reason'], string> = {
  fixed: 'Fixed event',
  started: 'Already started',
  outsideFlexWindow: 'Outside its flex window',
  noSlot: 'No free slot',
};

// PRE:  entries is this plan's remaining-problem list; planName names its card;
//       onSuggest opens the existing alternatives flow for an entry's event
// POST: lists each event with its exclusion reason and unresolved problems plus Suggest alternatives
export function NotMovedList({
  entries,
  planName,
  onSuggest,
}: {
  entries: readonly ReplanNotMoved[];
  planName: string;
  onSuggest: (eventId: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="replan-not-moved">
      <h4>Not moved by Replan</h4>
      <ul aria-label={`${planName} not moved`}>
        {entries.map((entry) => (
          <li key={entry.eventId}>
            <strong>&quot;{entry.title}&quot;</strong> — {REASON_TEXT[entry.reason]}
            {entry.barredLabels.length > 0 && <p>Overlaps {entry.barredLabels.join(', ')}.</p>}
            {entry.conflictTitles.length > 0 && (
              <p>Conflicts with {entry.conflictTitles.map((title) => `"${title}"`).join(', ')}.</p>
            )}
            <button
              type="button"
              aria-label={`Suggest alternatives for ${entry.title}`}
              onClick={() => onSuggest(entry.eventId)}
            >
              Suggest alternatives
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
