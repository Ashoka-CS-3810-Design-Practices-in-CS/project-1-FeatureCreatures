// FullCalendar's eventContent callback as a plain function, so tests can call it with fake
// arguments the way calendarHandlers.ts is tested. EventContentInfo is the part of
// FullCalendar's EventContentArg it reads.

import type { ReactNode } from 'react';
import { EventContent } from './EventContent';
import type { EventBlockProps } from './toFullCalendar';

const LIST_VIEW = 'listWeek';

export interface EventContentInfo {
  event: { id: string; title: string; display: string; extendedProps: Record<string, unknown> };
  timeText: string;
  isMirror: boolean;
  view: { type: string };
}

// PRE:  props are any event's extendedProps
// POST: returns true iff props carry what toFullCalendar sets for every snapshot event
function hasBlockProps(
  props: Record<string, unknown>,
): props is Record<string, unknown> & EventBlockProps {
  return typeof props.label === 'string' && Array.isArray(props.barredLabels);
}

// PRE:  info is FullCalendar's eventContent argument; onOpenEvent opens an event's edit dialog
// POST: returns no text for a decorative now guide, a barred slot's label for a background block; only the time for an event
//       without block props (the select mirror); else the EventContent block (a button that
//       calls onOpenEvent(info.event.id) in the List view)
export function renderEventContent(
  info: EventContentInfo,
  onOpenEvent: (id: string) => void,
): ReactNode {
  // Barred-slot backgrounds carry no event props; they only show their label.
  if (info.event.display === 'background') {
    if (info.event.title === '') return null;
    return <span className="barred-label">{info.event.title}</span>;
  }
  // FullCalendar draws the time being selected as a mirror event with no extendedProps
  // (isMirror); a drag mirror of a real event keeps its props and renders in full.
  const props = info.event.extendedProps;
  if (!hasBlockProps(props)) {
    return (
      <div className="event-content">
        <span className="event-time">{info.timeText}</span>
      </div>
    );
  }
  return (
    <EventContent
      {...props}
      title={info.event.title}
      timeText={info.timeText}
      onOpen={info.view.type === LIST_VIEW ? () => onOpenEvent(info.event.id) : undefined}
    />
  );
}
