// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

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

  it('reports a close the dialog made itself (e.g. Esc)', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Help" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    fireEvent(screen.getByRole('dialog', { name: 'Help' }), new Event('close'));

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
});
