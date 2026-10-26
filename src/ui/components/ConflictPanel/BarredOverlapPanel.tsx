import { useEffect, useRef } from 'react';
import { fmtDuration, fmtRange } from '../../format/time';
import { useAppStore } from '../../store/appStore';

// PRE:  rendered under StoreProvider; reads snapshot.barredOverlaps/events and barredViewRequest;
//       uses openEventAlternatives for each warning's event
// POST: shows every barred overlap separately from event-pair conflicts, with a reused alternatives
//       action; a View request focuses and scrolls the heading after the drawer has opened
export function BarredOverlapPanel() {
  const warnings = useAppStore((state) => state.snapshot.barredOverlaps);
  const events = useAppStore((state) => state.snapshot.events);
  const request = useAppStore((state) => state.barredViewRequest);
  const openAlternatives = useAppStore((state) => state.actions.openEventAlternatives);
  const heading = useRef<HTMLHeadingElement>(null);
  const byId = new Map(events.map((event) => [event.id, event]));

  useEffect(() => {
    if (request === 0) return;
    // The native drawer's opening effect must finish before focus can enter its content.
    const timer = setTimeout(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView?.({ block: 'nearest' });
    }, 0);
    return () => clearTimeout(timer);
  }, [request]);

  return (
    <section
      id="barred-overlap-panel"
      className="barred-overlaps"
      aria-labelledby="barred-overlap-title"
    >
      <h3 id="barred-overlap-title" tabIndex={-1} ref={heading}>
        Barred-slot overlaps ({warnings.length})
      </h3>
      {warnings.length === 0 ? (
        <p>No barred-slot overlaps</p>
      ) : (
        <ul aria-label="Barred-slot overlap list">
          {warnings.map((warning, index) => (
            <li key={index}>
              <strong>
                {byId.get(warning.eventId)?.title ?? warning.eventId} · {warning.label}
              </strong>
              <span>
                {fmtRange(warning.overlap)} ({fmtDuration(warning.minutes)})
              </span>
              <button
                type="button"
                aria-label={`Suggest alternatives for ${byId.get(warning.eventId)?.title ?? warning.eventId} in ${warning.label}`}
                onClick={() => openAlternatives(warning.eventId)}
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
