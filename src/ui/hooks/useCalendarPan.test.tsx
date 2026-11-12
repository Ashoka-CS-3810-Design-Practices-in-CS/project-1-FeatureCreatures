// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useCalendarPan } from './useCalendarPan';

// PRE:  locked is the session lock; onOpen handles an ordinary calendar event click
// POST: mounts the pan hook on the same scroller/body nesting used by FullCalendar
function Harness({ locked, onOpen }: { locked: boolean; onOpen: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useCalendarPan(root, locked);
  return (
    <div ref={root}>
      <button type="button">Outside grid</button>
      <div role="region" aria-label="Time grid" className="fc-scroller">
        <div className="fc-timegrid-body">
          <button type="button" onClick={onOpen}>
            Event
          </button>
        </div>
      </div>
    </div>
  );
}

// PRE:  type is a pointer event name; coordinates describe a primary mouse pointer
// POST: returns a bubbling pointer-shaped event with the fields the hook reads
function pointer(type: string, clientX: number, clientY: number, button = 0): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

describe('T50: locked calendar panning', () => {
  it('pans both axes from the initial scroll, captures/releases, and suppresses only the drag click', () => {
    const onOpen = vi.fn();
    render(<Harness locked onOpen={onOpen} />);
    const scroller = screen.getByRole('region', { name: 'Time grid' });
    const event = screen.getByRole('button', { name: 'Event' });
    const capture = vi.fn();
    const release = vi.fn();
    scroller.setPointerCapture = capture;
    scroller.hasPointerCapture = () => capture.mock.calls.length > 0;
    scroller.releasePointerCapture = release;
    scroller.scrollTop = 100;
    scroller.scrollLeft = 50;
    fireEvent(event, pointer('pointerdown', 100, 100));
    fireEvent(event, pointer('pointermove', 80, 60));
    expect(scroller.scrollTop).toBe(140);
    expect(scroller.scrollLeft).toBe(70);
    expect(capture).toHaveBeenCalledWith(1);
    fireEvent(event, pointer('pointerup', 80, 60));
    expect(release).toHaveBeenCalledWith(1);
    fireEvent.click(event);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent(event, pointer('pointerdown', 100, 100));
    fireEvent(event, pointer('pointermove', 102, 101));
    fireEvent(event, pointer('pointerup', 102, 101));
    fireEvent.click(event);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('ignores outside/right-button starts and removes its listeners when unlocked', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<Harness locked onOpen={onOpen} />);
    const scroller = screen.getByRole('region', { name: 'Time grid' });
    const event = screen.getByRole('button', { name: 'Event' });
    fireEvent(
      screen.getByRole('button', { name: 'Outside grid' }),
      pointer('pointerdown', 100, 100),
    );
    fireEvent(event, pointer('pointermove', 80, 60));
    expect(scroller.scrollTop).toBe(0);
    fireEvent(event, pointer('pointerdown', 100, 100, 2));
    fireEvent(event, pointer('pointermove', 80, 60));
    expect(scroller.scrollTop).toBe(0);
    rerender(<Harness locked={false} onOpen={onOpen} />);
    fireEvent(event, pointer('pointerdown', 100, 100));
    fireEvent(event, pointer('pointermove', 80, 60));
    fireEvent.click(event);
    expect(scroller.scrollTop).toBe(0);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
