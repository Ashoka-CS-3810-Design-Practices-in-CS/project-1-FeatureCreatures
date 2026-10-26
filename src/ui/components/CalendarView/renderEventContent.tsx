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

// PRE:  info is FullCalendar's eventContent argument; onOpenEvent opens an event's edit dialog
// POST: returns a barred slot's label for a background block, else the EventContent block
//       (a button that calls onOpenEvent(info.event.id) in the List view)
export function renderEventContent(
  info: EventContentInfo,
  onOpenEvent: (id: string) => void,
): ReactNode {
  // Barred-slot backgrounds carry no event props; they only show their label.
  if (info.event.display === 'background') {
    return <span className="barred-label">{info.event.title}</span>;
  }
  return (
    <EventContent
      {...(info.event.extendedProps as unknown as EventBlockProps)}
      title={info.event.title}
      timeText={info.timeText}
      onOpen={info.view.type === LIST_VIEW ? () => onOpenEvent(info.event.id) : undefined}
    />
  );
}
