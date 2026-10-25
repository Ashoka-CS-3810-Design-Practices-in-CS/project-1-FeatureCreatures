// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev } from '../../tests/helpers/builders';
import { makeEngine } from '../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../tests/helpers/render';
import { App } from './App';

describe('App', () => {
  it('shows the empty state; "Load sample week" loads sparseWeek with 1 conflict', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);

    await userEvent.click(screen.getByRole('button', { name: 'Load sample week' }));

    expect(await screen.findByText(/1 conflict\b/)).toBeInTheDocument();
    expect(screen.getByText(/8 events · 4 tasks/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load sample week' })).not.toBeInTheDocument();
    expect(screen.getByText('Loaded sample: Sparse week.')).toBeInTheDocument();
  });

  it('mounts the settings dialog: Clear all data, confirmed, empties the calendar', async () => {
    const store = storeFor(
      (await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] })).engine,
    );
    renderWithStore(<App />, store);

    act(() => store.getState().actions.openDialog({ kind: 'settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear all data' }));

    expect(await screen.findByText('All data cleared.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load sample week' })).toBeInTheDocument();
  });

  it('shows the degraded-mode banner when storage is unavailable', async () => {
    const store = storeFor((await makeEngine()).engine, { storageWarning: true });
    renderWithStore(<App />, store);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Storage unavailable: changes will be lost when you close this tab.',
    );
  });

  it('shows no banner and no empty state for a calendar with events', async () => {
    const store = storeFor(
      (await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] })).engine,
    );
    renderWithStore(<App />, store);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/1 event · 0 tasks · 0 conflicts/)).toBeInTheDocument();
  });

  it('shows the fatal screen with Retry and Reset local data', async () => {
    const resetStorage = vi.fn(async () => undefined);
    const store = storeFor((await makeEngine()).engine, {
      init: { ok: false, error: { code: 'StorageError', message: 'blocked' } },
      resetStorage,
    });
    renderWithStore(<App />, store);

    expect(
      screen.getByRole('heading', { name: 'The calendar could not start' }),
    ).toBeInTheDocument();
    expect(screen.getByText("Couldn't save your change. Nothing was changed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset local data' }));

    expect(resetStorage).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Load sample week' })).toBeInTheDocument();
  });

  it('Retry on the fatal screen starts the app when init now succeeds', async () => {
    const store = storeFor((await makeEngine()).engine, {
      init: { ok: false, error: { code: 'StorageError', message: 'blocked' } },
    });
    renderWithStore(<App />, store);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', { name: 'Interactive Calendar' }),
    ).toBeInTheDocument();
  });

  it('shows a loading line while starting', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);

    act(() => store.setState({ status: 'loading' }));

    expect(screen.getByRole('status')).toHaveTextContent('Loading your calendar…');
  });
});
