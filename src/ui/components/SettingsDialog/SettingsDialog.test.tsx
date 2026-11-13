// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Engine } from '@/engine';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { ev, settings, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import type { AppStore } from '../../store/appStore';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { SettingsDialog } from './SettingsDialog';
import { BarredSlotsPanel } from '../BarredSlotsPanel/BarredSlotsPanel';

// PRE:  engine is initialised
// POST: renders the inline barred editor outside Settings (D-09)
function renderBarred(engine: Engine): AppStore {
  const store = storeFor(engine);
  renderWithStore(<BarredSlotsPanel />, store);
  return store;
}

// PRE:  engine is initialised
// POST: renders the settings dialog (opened) and the confirm dialog over a store for engine
function renderOpen(engine: Engine): AppStore {
  const store = storeFor(engine);
  renderWithStore(
    <>
      <SettingsDialog />
      <ConfirmDialog />
    </>,
    store,
  );
  act(() => store.getState().actions.openDialog({ kind: 'settings' }));
  return store;
}

// PRE:  text is the content of the file to pick
// POST: picks it as a JSON file in the "Import JSON" file input
async function pickImportFile(text: string): Promise<void> {
  const file = new File([text], 'backup.json', { type: 'application/json' });
  await userEvent.upload(screen.getByLabelText('Import JSON'), file);
}

describe('SettingsDialog', () => {
  it('shows the current settings', async () => {
    renderOpen((await makeEngine({ settings: settings({ bufferMin: 15 }) })).engine);

    expect(screen.getByRole('checkbox', { name: 'Mon' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sun' })).not.toBeChecked();
    expect(screen.getByLabelText('Working hours from')).toHaveValue('09:00');
    expect(screen.getByLabelText('Working hours to')).toHaveValue('18:00');
    expect(screen.getByLabelText('Default buffer (min)')).toHaveValue(15);
    expect(screen.getByLabelText('Default ranking')).toHaveValue('earliest');
  });

  it('rejects work end ≤ start inline and keeps the dialog open', async () => {
    const { engine } = await makeEngine();
    const updateSettings = vi.spyOn(engine, 'updateSettings');
    const store = renderOpen(engine);

    await userEvent.clear(screen.getByLabelText('Working hours to'));
    await userEvent.type(screen.getByLabelText('Working hours to'), '08:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Working hours must end after they start.')).toBeInTheDocument();
    expect(screen.getByLabelText('Working hours to')).toHaveAttribute('aria-invalid', 'true');
    expect(updateSettings).not.toHaveBeenCalled();
    expect(store.getState().dialog).toEqual({ kind: 'settings' });
  });

  it('saves valid changes and closes', async () => {
    const { engine } = await makeEngine();
    const store = renderOpen(engine);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Sat' }));
    await userEvent.clear(screen.getByLabelText('Default buffer (min)'));
    await userEvent.type(screen.getByLabelText('Default buffer (min)'), '10');
    await userEvent.selectOptions(screen.getByLabelText('Default ranking'), 'Best fit');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(engine.snapshot().settings).toEqual(
      settings({ workDays: [1, 2, 3, 4, 5, 6], bufferMin: 10, defaultCriterion: 'bestFit' }),
    );
  });

  it('adds and removes a barred slot', async () => {
    const { engine } = await makeEngine();
    const store = renderBarred(engine);

    await userEvent.click(screen.getByRole('button', { name: 'Add barred slot' }));
    const slot = screen.getByRole('group', { name: 'Barred slot 1' });
    expect(within(slot).getByLabelText('Label')).toHaveValue('Lunch');
    expect(within(slot).getByRole('checkbox', { name: 'Fri' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save barred slots' }));
    await waitFor(() => expect(engine.snapshot().settings.barredSlots).toHaveLength(1));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(engine.snapshot().settings.barredSlots).toMatchObject([
      { label: 'Lunch', startMin: 720, endMin: 780, days: [1, 2, 3, 4, 5] },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove barred slot 1' }));
    expect(screen.queryByRole('group', { name: 'Barred slot 1' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save barred slots' }));
    await waitFor(() => expect(engine.snapshot().settings.barredSlots).toEqual([]));
  });

  it('shows a barred-slot error on its row', async () => {
    renderBarred((await makeEngine()).engine);

    await userEvent.click(screen.getByRole('button', { name: 'Add barred slot' }));
    const slot = screen.getByRole('group', { name: 'Barred slot 1' });
    await userEvent.clear(within(slot).getByLabelText('Label'));
    await userEvent.click(screen.getByRole('button', { name: 'Save barred slots' }));

    expect(await within(slot).findByText('Label is required.')).toBeInTheDocument();
  });

  it('T44: a duplicate barred slot is shown inline on the later row and nothing is saved', async () => {
    const { engine } = await makeEngine();
    const store = renderBarred(engine);

    await userEvent.click(screen.getByRole('button', { name: 'Add barred slot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add barred slot' }));
    await userEvent.clear(
      within(screen.getByRole('group', { name: 'Barred slot 2' })).getByLabelText('Label'),
    );
    await userEvent.type(
      within(screen.getByRole('group', { name: 'Barred slot 2' })).getByLabelText('Label'),
      'Break',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save barred slots' }));

    const second = screen.getByRole('group', { name: 'Barred slot 2' });
    expect(
      await within(second).findByText('Overlaps barred slot 1 (Lunch) on Mon, Tue, Wed, Thu, Fri.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Barred slot 1' })).queryByText(
        /Overlaps barred slot/,
      ),
    ).not.toBeInTheDocument();
    expect(store.getState().dialog).toBeNull();
    expect(screen.getByRole('region', { name: 'Barred slots' })).toBeInTheDocument();
    expect(engine.snapshot().settings.barredSlots).toEqual([]);
  });

  it('Export downloads calendar-export-YYYY-MM-DD.json', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:export');
    const revokeObjectURL = vi.fn();
    // jsdom has no object URLs; the dialog only needs these two.
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderOpen((await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] })).engine);

    await userEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(JSON.parse(await blob.text())).toMatchObject({ events: [{ id: 'A' }] });
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('calendar-export-2026-11-02.json');
    expect(link.href).toBe('blob:export');
    click.mockRestore();
  });

  it('Import asks for confirmation, then replaces everything', async () => {
    const source = await makeEngine({
      events: [ev('A', 'Mon 10:00', 'Mon 11:00')],
      tasks: [task('T', 60, ['Mon 09:00', 'Fri 18:00'])],
    });
    const store = renderOpen((await makeEngine()).engine);

    await pickImportFile(source.engine.exportData());
    expect(
      await screen.findByText('This replaces all your events, tasks and settings.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(store.getState().snapshot.events).toHaveLength(1));
    expect(store.getState().dialog).toBeNull();
    expect(store.getState().toasts.at(-1)?.text).toBe('Imported 1 event and 1 task.');
  });

  it('Import of an invalid file shows the ER6 toast and asks nothing', async () => {
    const { engine } = await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] });
    const store = renderOpen(engine);

    await pickImportFile('not json');

    await waitFor(() =>
      expect(store.getState().toasts.at(-1)?.text).toBe(
        "That file isn't a valid calendar export: Not valid JSON.",
      ),
    );
    expect(store.getState().dialog).toEqual({ kind: 'settings' });
    expect(engine.snapshot().events).toHaveLength(1);
  });

  it('loads a sample at once into an empty calendar, and asks first otherwise', async () => {
    const empty = renderOpen((await makeEngine()).engine);

    await userEvent.selectOptions(screen.getByLabelText('Load sample calendar'), 'Back-to-back');
    await userEvent.click(screen.getByRole('button', { name: 'Load sample' }));

    await waitFor(() =>
      expect(empty.getState().toasts.at(-1)?.text).toBe('Loaded sample: Back-to-back.'),
    );
    expect(empty.getState().dialog).toBeNull();

    act(() => empty.getState().actions.openDialog({ kind: 'settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(empty.getState().dialog).toMatchObject({ kind: 'confirm', confirmLabel: 'Load sample' });
  });

  it('Clear all data asks first, then empties the calendar and resets the settings', async () => {
    const { engine } = await makeEngine({
      events: [ev('A', 'Mon 10:00', 'Mon 11:00')],
      settings: settings({ bufferMin: 30 }),
    });
    const store = renderOpen(engine);

    await userEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
    expect(store.getState().dialog).toMatchObject({ kind: 'confirm', title: 'Clear all data?' });
    await userEvent.click(screen.getByRole('button', { name: 'Clear all data' }));

    await waitFor(() => expect(store.getState().snapshot.events).toEqual([]));
    expect(store.getState().snapshot.settings).toEqual(DEFAULT_SETTINGS);
  });
});
