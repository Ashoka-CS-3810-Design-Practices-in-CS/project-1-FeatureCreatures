import { useEffect, useId, useRef, useState } from 'react';
import type { BarredOverlap } from '@/shared/types';
import { unkeptBarredOverlaps } from '@/shared/barredSlots';
import { fmtDuration, fmtRange } from '../../format/time';
import { useAppStore } from '../../store/appStore';
import { FixedTag } from '../FixedTag/FixedTag';
import { upcomingOverlaps } from '../../store/selectors';

// PRE:  warnings are upcoming records from the current snapshot; kept chooses the group/actions;
//       reads snapshot.events and uses openEventAlternatives/setBarredKept
//       + additional props from: FixedTag
// POST: shows complete event/slot/range rows with Keep here or Stop keeping; unkept rows retain Suggest
function BarredRows({ warnings, kept }: { warnings: readonly BarredOverlap[]; kept: boolean }) {
  const events = useAppStore((state) => state.snapshot.events);
  const actions = useAppStore((state) => state.actions);
  const hintPrefix = useId();
  const byId = new Map(events.map((event) => [event.id, event]));
  return (
    <ul aria-label={kept ? 'Kept barred-slot overlap list' : 'Barred-slot overlap list'}>
      {warnings.map((warning, index) => {
        const event = byId.get(warning.eventId);
        const title = event?.title ?? warning.eventId;
        const action = kept ? 'Stop keeping' : 'Keep here';
        return (
          <li key={`${warning.eventId}-${warning.slotId}-${warning.overlap.start}`}>
            <strong>
              {title} · {warning.label}
            </strong>
            {event?.flexible ? (
              <span className="tag">Flexible</span>
            ) : (
              <FixedTag descriptionId={`${hintPrefix}-${index}`} />
            )}
            <span>
              {fmtRange(warning.overlap)} ({fmtDuration(warning.minutes)})
            </span>
            {!kept && (
              <button
                type="button"
                aria-label={`Suggest alternatives for ${title} in ${warning.label}`}
                onClick={() => actions.openEventAlternatives(warning.eventId)}
              >
                Suggest alternatives
              </button>
            )}
            <button
              type="button"
              aria-label={`${action}: ${title} in ${warning.label} (${fmtRange(warning.overlap)})`}
              onClick={() =>
                void actions.setBarredKept({
                  eventId: warning.eventId,
                  slotId: warning.slotId,
                  kept: !kept,
                })
              }
            >
              {action}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// PRE:  rendered under StoreProvider; reads currentMinute, snapshot.barredOverlaps/events and barredViewRequest
//       + additional props from: BarredRows
// POST: shows ongoing/future warnings and collapsed Kept history; past records stay out of both;
//       View focuses and scrolls the heading after the native drawer opens
export function BarredOverlapPanel() {
  const records = useAppStore((state) => state.snapshot.barredOverlaps);
  const now = useAppStore((state) => state.currentMinute);
  const events = useAppStore((state) => state.snapshot.events);
  const upcoming = upcomingOverlaps(records, now);
  const warnings = unkeptBarredOverlaps(upcoming, events);
  const shown = new Set(warnings);
  const kept = upcoming.filter((warning) => !shown.has(warning));
  const request = useAppStore((state) => state.barredViewRequest);
  const heading = useRef<HTMLHeadingElement>(null);
  const [keptOpen, setKeptOpen] = useState(false);
  const keptId = useId();
  useEffect(() => {
    if (request === 0) return;
    // Native drawer opening must finish before focus can enter its content.
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
        <BarredRows warnings={warnings} kept={false} />
      )}
      <button
        type="button"
        aria-expanded={keptOpen}
        aria-controls={keptId}
        onClick={() => setKeptOpen(!keptOpen)}
      >
        Kept ({kept.length})
      </button>
      <div id={keptId} hidden={!keptOpen}>
        {keptOpen &&
          (kept.length === 0 ? <p>No kept overlaps</p> : <BarredRows warnings={kept} kept />)}
      </div>
    </section>
  );
}
