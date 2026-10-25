import { fmtDuration } from '../../format/time';
import type { EventBlockProps } from './toFullCalendar';

const PRIORITY_TAG = { high: '[H]', medium: '[M]', low: '[L]' } as const;

// PRE:  title and timeText come from FullCalendar; the rest from toFullCalendar's extendedProps
// POST: renders an event block: title, time, the priority tag (BR-13, text as well as colour),
//       a Task or Fixed tag, and "⚠ Conflict N min" when the event overlaps another
export function EventContent({
  title,
  timeText,
  priority,
  flexible,
  isTask,
  conflictMinutes,
}: EventBlockProps & { title: string; timeText: string }) {
  const kind = isTask ? 'Task' : flexible ? null : 'Fixed';
  return (
    <div className="event-content">
      {conflictMinutes > 0 && (
        <span className="tag tag-conflict">⚠ Conflict {fmtDuration(conflictMinutes)}</span>
      )}{' '}
      <span className="event-time">{timeText}</span>{' '}
      <strong className="event-title">{title}</strong>{' '}
      <span className={`tag prio-${priority}`}>{PRIORITY_TAG[priority]}</span>
      {kind !== null && <span className="tag">{kind}</span>}
    </div>
  );
}
