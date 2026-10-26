// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { Modal } from './Modal';

// PRE:  none
// POST: resolves after every task queued so far, e.g. a dialog's queued 'close' event, has run
function flushQueuedTasks(): Promise<void> {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

describe('Modal', () => {
  it('opens as a dialog named by its title, closes when open turns false', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open title="Settings" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('Body')).toBeInTheDocument();

    rerender(
      <Modal open={false} title="Settings" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    expect(dialog).not.toHaveAttribute('open');
  });

  it('reports a close the dialog made itself (e.g. Esc)', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Help" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    screen.getByRole<HTMLDialogElement>('dialog', { name: 'Help' }).close();
    await flushQueuedTasks();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('returns focus to its trigger on unmount without reporting a user close', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open title="Edit" onClose={onClose}>
        Body
      </Modal>,
    );

    unmount();

    expect(trigger).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    trigger.remove();
  });

  // WI-35 regression: StrictMode mounts, unmounts and remounts the effect; the cleanup's close()
  // queued a 'close' event that arrived after the remount and closed the dialog under npm run dev.
  it('stays open under StrictMode', async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Modal open title="New event" onClose={onClose}>
          Body
        </Modal>
      </StrictMode>,
    );

    await flushQueuedTasks();

    expect(screen.getByRole('dialog', { name: 'New event' })).toHaveAttribute('open');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still reports Esc under StrictMode', async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Modal open title="New event" onClose={onClose}>
          Body
        </Modal>
      </StrictMode>,
    );
    await flushQueuedTasks();
    const dialog = screen.getByRole<HTMLDialogElement>('dialog', { name: 'New event' });

    // Esc on a modal <dialog> fires 'cancel', then closes it, which queues 'close'.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    dialog.close();
    await flushQueuedTasks();

    expect(onClose).toHaveBeenCalledOnce();
  });
});
