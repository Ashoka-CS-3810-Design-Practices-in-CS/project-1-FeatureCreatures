// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TOAST_MS, WARNING_TOAST_MS } from '@/shared/constants';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { Toasts } from './Toasts';

describe('Toasts (live region)', () => {
  it('announces errors assertively and everything else politely', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<Toasts />, store);

    act(() => {
      store.getState().actions.pushToast({ tone: 'error', text: 'Broken' });
      store.getState().actions.pushToast({ tone: 'success', text: 'Event created' });
    });

    const assertive = screen.getByLabelText('Errors');
    const polite = screen.getByLabelText('Notifications');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(within(assertive).getByText('Broken')).toBeInTheDocument();
    expect(within(polite).getByText('Event created')).toBeInTheDocument();
  });

  it('keeps the sticky ER5 toast until Retry runs it, then removes it', async () => {
    const store = storeFor((await makeEngine()).engine);
    const retry = vi.fn();
    renderWithStore(<Toasts />, store);
    act(() => {
      store.getState().actions.pushToast({
        tone: 'error',
        text: "Couldn't save your change. Nothing was changed.",
        sticky: true,
        actions: [{ label: 'Retry', run: retry }],
      });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
  });

  it('closes a success toast after TOAST_MS, and on Dismiss', async () => {
    vi.useFakeTimers();
    try {
      const store = storeFor((await makeEngine()).engine);
      renderWithStore(<Toasts />, store);
      act(() => {
        store.getState().actions.pushToast({ tone: 'success', text: 'Saved' });
        store.getState().actions.pushToast({ tone: 'error', text: 'Stays' });
      });

      act(() => {
        vi.advanceTimersByTime(TOAST_MS);
      });
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();
      expect(screen.getByText('Stays')).toBeInTheDocument();

      act(() => {
        screen.getByRole('button', { name: 'Dismiss' }).click();
      });
      expect(screen.queryByText('Stays')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses a timed toast while it is hovered', async () => {
    vi.useFakeTimers();
    try {
      const store = storeFor((await makeEngine()).engine);
      renderWithStore(<Toasts />, store);
      act(() => {
        store.getState().actions.pushToast({ tone: 'warning', text: 'Saved with a conflict' });
      });
      const toast = screen.getByText('Saved with a conflict').parentElement as HTMLElement;

      fireEvent.mouseEnter(toast);
      act(() => {
        vi.advanceTimersByTime(WARNING_TOAST_MS * 2);
      });
      expect(screen.getByText('Saved with a conflict')).toBeInTheDocument();

      fireEvent.mouseLeave(toast);
      act(() => {
        vi.advanceTimersByTime(WARNING_TOAST_MS);
      });
      expect(screen.queryByText('Saved with a conflict')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
