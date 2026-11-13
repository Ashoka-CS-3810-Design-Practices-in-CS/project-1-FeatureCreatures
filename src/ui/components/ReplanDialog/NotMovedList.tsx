import { useId, useState } from 'react';
import type { ReplanNotMoved } from '@/shared/types';
import type { PlanDiagnostic } from './replanView';

const REASON_TEXT: Record<ReplanNotMoved['reason'], string> = {
  fixed: 'Fixed event',
  started: 'Already started',
  outsideFlexWindow: 'Outside its flex window',
  noSlot: 'No free slot',
};

// PRE:  entries is the combined remaining-problem list with affected plan names; details shows full problems;
//       onSuggest opens the existing alternatives flow for an entry's event
// POST: shows one collapsed list; expanded entries have reason chips and alternatives, with problems in Details
export function NotMovedList({
  entries,
  details,
  onSuggest,
}: {
  entries: readonly PlanDiagnostic[];
  details: boolean;
  onSuggest: (eventId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (entries.length === 0) return null;
  return (
    <section className="replan-not-moved" aria-label="Not moved by Replan">
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          Not moved by Replan ({entries.length})
        </button>
      </h4>
      {open && (
        <ul id={listId} aria-label="Replan not moved">
          {entries.map((entry) => (
            <li key={entry.eventId}>
              <strong>&quot;{entry.title}&quot;</strong> —{' '}
              <span className="tag">{REASON_TEXT[entry.reason]}</span>
              {entry.planNames.length === 1 && (
                <span className="muted"> ({entry.planNames[0]})</span>
              )}
              {details && entry.barredLabels.length > 0 && (
                <p>Overlaps {entry.barredLabels.join(', ')}.</p>
              )}
              {details && entry.conflictTitles.length > 0 && (
                <p>
                  Conflicts with {entry.conflictTitles.map((title) => `"${title}"`).join(', ')}.
                </p>
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
      )}
    </section>
  );
}
