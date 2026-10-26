// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderEventContent, type EventContentInfo } from './renderEventContent';
import type { EventBlockProps } from './toFullCalendar';

const BLOCK_PROPS: EventBlockProps = {
  barredLabels: ['Lunch'],
  label: 'Lecture, Mon 2 Nov 10:00–11:00',
  priority: 'high',
  category: 'class',
  flexible: false,
  isTask: false,
  conflictMinutes: 0,
};

// PRE:  overrides replace parts of a timed week-view event argument
// POST: returns a fake eventContent argument for "Lecture" 10:00 - 11:00
function contentInfo(overrides: Partial<EventContentInfo> = {}): EventContentInfo {
  return {
    event: { id: 'e1', title: 'Lecture', display: 'auto', extendedProps: { ...BLOCK_PROPS } },
    timeText: '10:00 - 11:00',
    isMirror: false,
    view: { type: 'timeGridWeek' },
    ...overrides,
  };
}

describe('renderEventContent', () => {
  // WI-35 regression: FullCalendar's select mirror has no extendedProps; rendering it used to
  // throw in barredLabels.map and unmount the whole app.
  it('renders a select-mirror placeholder that has no extendedProps', () => {
    const mirror = contentInfo({
      event: { id: '', title: '', display: 'auto', extendedProps: {} },
      timeText: '10:00 - 10:30',
      isMirror: true,
    });

    render(<>{renderEventContent(mirror, vi.fn())}</>);

    expect(screen.getByText('10:00 - 10:30')).toBeInTheDocument();
  });

  it('renders an event block with its tags', () => {
    render(<>{renderEventContent(contentInfo(), vi.fn())}</>);

    expect(screen.getByText('Lecture')).toBeInTheDocument();
    expect(screen.getByText('In Lunch')).toBeInTheDocument();
    expect(screen.getByText('[H]')).toBeInTheDocument();
  });

  it('keeps the event props on a drag mirror of an existing event', () => {
    render(<>{renderEventContent(contentInfo({ isMirror: true }), vi.fn())}</>);

    expect(screen.getByText('Lecture')).toBeInTheDocument();
  });

  it('shows only the label of a barred background block', () => {
    const barred = contentInfo({
      event: { id: 'barred-1', title: 'Lunch', display: 'background', extendedProps: {} },
    });

    render(<>{renderEventContent(barred, vi.fn())}</>);

    expect(screen.getByText('Lunch')).toHaveClass('barred-label');
  });

  it('opens the event from its List-view button', async () => {
    const onOpenEvent = vi.fn();

    render(<>{renderEventContent(contentInfo({ view: { type: 'listWeek' } }), onOpenEvent)}</>);
    await userEvent.click(screen.getByRole('button', { name: BLOCK_PROPS.label }));

    expect(onOpenEvent).toHaveBeenCalledWith('e1');
  });
});
