// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev } from '../../tests/helpers/builders';
import { makeEngine } from '../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../tests/helpers/render';
import { App } from './App';

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('below 1024 px opens one copy of the panels in a drawer and returns focus when closed', async () => {
    const media = window.matchMedia('(max-width: 1023px)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true });
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);
    const trigger = screen.getByRole('button', { name: 'Tasks and conflicts' });
    expect(screen.queryByRole('heading', { name: 'Tasks' })).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Tasks and conflicts' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Tasks' })).toHaveLength(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Close panels' }));
    expect(screen.queryByRole('dialog', { name: 'Tasks and conflicts' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows a non-dismissible loading overlay while loading a sample', async () => {
    const { engine } = await makeEngine();
    let finishImport: (() => void) | undefined;
    const completed = engine.importData.bind(engine);
    vi.spyOn(engine, 'importData').mockImplementation(async (json) => {
      await new Promise<void>((resolve) => {
        finishImport = resolve;
      });
      return completed(json);
    });
    const store = storeFor(engine);
    renderWithStore(<App />, store);

    await userEvent.click(screen.getByRole('button', { name: 'Load sample week' }));

    const overlay = await screen.findByRole('dialog', { name: 'Loading calendar' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading sample calendar…');
    fireEvent(overlay, new Event('cancel', { cancelable: true }));
    expect(overlay).toHaveAttribute('open');
    await waitFor(() => expect(finishImport).toBeDefined());
    await act(async () => finishImport?.());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Loading calendar' })).not.toBeInTheDocument(),
    );
  });

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

  it('the toolbar and the shortcuts drive the real calendar', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);
    expect(await screen.findByRole('heading', { name: 'Week of 2 Nov 2026' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next period' }));
    expect(await screen.findByRole('heading', { name: 'Week of 9 Nov 2026' })).toBeInTheDocument();
    await userEvent.keyboard('m');
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(store.getState().view.type).toBe('dayGridMonth');
  });

  it('T32 (a, d): N opens the event dialog, ? the shortcut help', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);

    await userEvent.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'New event' })).toBeInTheDocument();
    act(() => store.getState().actions.closeDialog());
    await userEvent.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
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
