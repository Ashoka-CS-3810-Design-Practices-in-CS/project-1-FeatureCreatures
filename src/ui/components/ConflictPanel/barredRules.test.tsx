// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, settings } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import { App } from '../../App';
import { BarredSlotsPanel } from '../BarredSlotsPanel/BarredSlotsPanel';
import { SettingsDialog } from '../SettingsDialog/SettingsDialog';

const LUNCH = {
  id: 'lunch',
  label: 'Lunch',
  startMin: 780,
  endMin: 840,
  days: [1, 2, 3, 4, 5] as const,
};

describe('T53: soft barred slots UI (D-09)', () => {
  it('Keep here hides the tag/row in collapsed Kept; undo/redo and Stop keeping restore the warning', async () => {
    const { engine } = await makeEngine({
      settings: settings({ barredSlots: [LUNCH] }),
      events: [ev('A', 'Mon 13:00', 'Mon 14:00')],
    });
    const store = storeFor(engine);
    store.setState({ view: { ...store.getState().view, type: 'listWeek' } });
    renderWithStore(<App />, store);
    const block = screen.getByRole('button', { name: /^A, Mon 2 Nov/ });
    expect(block).toHaveAccessibleName(/In Lunch/);
    await userEvent.click(screen.getByRole('button', { name: /^Keep here: A in Lunch/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Barred-slot overlaps (0)' })).toBeInTheDocument(),
    );
    expect(block).not.toHaveAccessibleName(/In Lunch/);
    const kept = screen.getByRole('button', { name: 'Kept (1)' });
    expect(kept).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Stop keeping:/ })).not.toBeInTheDocument();
    await userEvent.click(kept);
    expect(screen.getByRole('list', { name: 'Kept barred-slot overlap list' })).toHaveTextContent(
      'A · Lunch',
    );
    await act(async () => {
      await store.getState().actions.undo();
    });
    expect(block).toHaveAccessibleName(/In Lunch/);
    await act(async () => {
      await store.getState().actions.redo();
    });
    expect(block).not.toHaveAccessibleName(/In Lunch/);
    await userEvent.click(screen.getByRole('button', { name: /^Stop keeping: A in Lunch/ }));
    await waitFor(() => expect(block).toHaveAccessibleName(/In Lunch/));
    expect(engine.snapshot().barredOverlaps).toHaveLength(1);
  });

  it('edits only in the Barred slots region, rejects overlapping rows, and Cancel preserves saved slots', async () => {
    const { engine } = await makeEngine();
    const store = storeFor(engine);
    renderWithStore(
      <>
        <SettingsDialog />
        <BarredSlotsPanel />
      </>,
      store,
    );
    act(() => store.getState().actions.openDialog({ kind: 'settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(
      within(dialog).queryByRole('button', { name: 'Add barred slot' }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const region = screen.getByRole('region', { name: 'Barred slots' });
    await userEvent.click(within(region).getByRole('button', { name: 'Add barred slot' }));
    const first = within(region).getByRole('group', { name: 'Barred slot 1' });
    expect(within(first).getByLabelText('Label')).toHaveFocus();
    await userEvent.clear(within(first).getByLabelText('From'));
    await userEvent.type(within(first).getByLabelText('From'), '13:00');
    await userEvent.clear(within(first).getByLabelText('To'));
    await userEvent.type(within(first).getByLabelText('To'), '14:00');
    await userEvent.click(within(region).getByRole('button', { name: 'Add barred slot' }));
    const second = within(region).getByRole('group', { name: 'Barred slot 2' });
    await userEvent.clear(within(second).getByLabelText('Label'));
    await userEvent.type(within(second).getByLabelText('Label'), 'TT');
    await userEvent.clear(within(second).getByLabelText('From'));
    await userEvent.type(within(second).getByLabelText('From'), '13:30');
    await userEvent.clear(within(second).getByLabelText('To'));
    await userEvent.type(within(second).getByLabelText('To'), '14:30');
    await userEvent.click(within(region).getByRole('button', { name: 'Save barred slots' }));
    expect(
      await within(second).findByText('Overlaps barred slot 1 (Lunch) on Mon, Tue, Wed, Thu, Fri.'),
    ).toBeInTheDocument();
    expect(engine.snapshot().settings.barredSlots).toEqual([]);
    await userEvent.click(
      within(region).getByRole('button', { name: 'Cancel barred slot changes' }),
    );
    expect(within(region).queryByRole('group', { name: 'Barred slot 1' })).not.toBeInTheDocument();
    expect(engine.snapshot().settings.barredSlots).toEqual([]);
  });

  it('explains legacy overlaps and allows unrelated settings changes while preserving every slot', async () => {
    const slots = [LUNCH, { ...LUNCH, id: 'tt', label: 'TT', startMin: 810, endMin: 870 }];
    const { engine } = await makeEngine({ settings: settings({ barredSlots: slots }) });
    const store = storeFor(engine);
    renderWithStore(
      <>
        <SettingsDialog />
        <BarredSlotsPanel />
      </>,
      store,
    );
    expect(
      screen.getByText('Lunch and TT overlap on Mon–Fri. Edit one of them.'),
    ).toBeInTheDocument();
    act(() => store.getState().actions.openDialog({ kind: 'settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Use working hours' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(engine.snapshot().settings).toMatchObject({
      useWorkingHours: false,
      barredSlots: slots,
    });
  });

  it('keeps entirely past overlaps out of the warning and Kept groups', async () => {
    const { engine } = await makeEngine({
      settings: settings({ barredSlots: [LUNCH] }),
      events: [ev('Past', 'Mon 13:00', 'Mon 14:00', { keptInBarred: ['lunch'] })],
    });
    const store = storeFor(engine, { now: () => t('Mon 14:00') });
    renderWithStore(<BarredSlotsPanel />, store);
    expect(screen.getByRole('heading', { name: 'Barred-slot overlaps (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kept (0)' })).toBeInTheDocument();
    expect(engine.snapshot().barredOverlaps).toHaveLength(1);
  });
});
