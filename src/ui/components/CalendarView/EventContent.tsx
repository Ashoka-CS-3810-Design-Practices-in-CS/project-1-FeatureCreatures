import { fmtDuration } from '../../format/time';
import { useEffect, useId, useRef } from 'react';
import { FixedTag } from '../FixedTag/FixedTag';
import type { EventBlockProps } from './toFullCalendar';
import { CategoryTag } from '../Categories/CategoryTag';

const PRIORITY_TAG = { high: '[H]', medium: '[M]', low: '[L]' } as const;

// PRE:  title and timeText come from FullCalendar; the rest from toFullCalendar's extendedProps
//       onOpen opens the event dialog when supplied for a List-view button
//       + additional props from: CategoryTag
// POST: renders an event block: title, time, the priority tag (BR-13, text as well as colour),
//       a Task or Fixed tag, In <label> tags and "⚠ Conflict N min" when the event overlaps another; keeps its
//       FullCalendar button's accessible name and tooltip complete even when the block is clipped;
//       a fixed block is described by the Fixed tag's hint (WI-42)
export function EventContent({
  title,
  category,
  timeText,
  priority,
  flexible,
  isTask,
  conflictMinutes,
  barredLabels,
  label,
  onOpen,
}: EventBlockProps & { title: string; timeText: string; onOpen?: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const kind = isTask ? 'Task' : flexible ? null : 'Fixed';
  useEffect(() => {
    const eventElement = contentRef.current?.closest<HTMLElement>('.ev');
    if (eventElement !== null && eventElement !== undefined) {
      eventElement.setAttribute('aria-label', label);
      eventElement.setAttribute('role', 'button');
      eventElement.title = label;
      if (kind === 'Fixed') {
        eventElement.setAttribute('aria-describedby', hintId);
      } else {
        eventElement.removeAttribute('aria-describedby');
      }
    }
  }, [label, kind, hintId]);
  const content = (
    <>
      {conflictMinutes > 0 && (
        <span className="tag tag-conflict">⚠ Conflict {fmtDuration(conflictMinutes)}</span>
      )}{' '}
      {barredLabels.map((label) => (
        <span key={label} className="tag tag-barred">
          In {label}
        </span>
      ))}{' '}
      <span className="event-time">{timeText}</span>{' '}
      <strong className="event-title">{title}</strong>{' '}
      <span className={`tag prio-${priority}`}>{PRIORITY_TAG[priority]}</span>
      {category !== undefined && <CategoryTag category={category} />}
      {kind === 'Task' && <span className="tag">Task</span>}
      {kind === 'Fixed' && <FixedTag descriptionId={hintId} />}
    </>
  );
  // FullCalendar's List default contains the keyboard anchor; custom content replaces it.
  return onOpen === undefined ? (
    <div className="event-content" ref={contentRef}>
      {content}
    </div>
  ) : (
    <button
      type="button"
      className="event-content event-list-button"
      aria-label={label}
      aria-describedby={kind === 'Fixed' ? hintId : undefined}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {content}
    </button>
  );
}
