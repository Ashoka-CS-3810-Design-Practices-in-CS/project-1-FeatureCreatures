// @vitest-environment jsdom
// T46 (#11) — every dismissible dialog has a visible × close button (WI-45).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal close button (#11)', () => {
  it('shows × named Close that closes the dialog exactly like Esc / Cancel', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Edit event" onClose={onClose}>
        <label>
          Title <input />
        </label>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit event' });
    const close = within(dialog).getByRole('button', { name: 'Close' });

    expect(close).toHaveTextContent('×');
    await userEvent.click(close);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('comes last in the dialog, so opening still focuses the first field and Tab order is unchanged', () => {
    render(
      <Modal open title="Edit event" onClose={() => undefined}>
        <label>
          Title <input />
        </label>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit event' });

    expect(dialog.lastElementChild).toBe(within(dialog).getByRole('button', { name: 'Close' }));
  });

  it('a dialog that cannot be dismissed (the loading overlay) has no ×', () => {
    render(
      <Modal open title="Loading calendar" dismissible={false} onClose={() => undefined}>
        <p>Loading…</p>
      </Modal>,
    );

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});
