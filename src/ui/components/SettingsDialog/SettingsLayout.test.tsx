// @vitest-environment jsdom
// T47 — the Settings panel redesign (WI-46): sections, compact barred rows, focus on a new slot.
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { settings } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { SettingsDialog } from './SettingsDialog';
import { BarredSlotsPanel } from '../BarredSlotsPanel/BarredSlotsPanel';

const TWO_SLOTS = settings({
  barredSlots: [
    { id: 'l', label: 'Lunch', startMin: 13 * 60, endMin: 14 * 60, days: [1, 2, 3, 4, 5] },
    { id: 'g', label: 'Gym', startMin: 18 * 60, endMin: 19 * 60, days: [2, 4] },
  ],
});

// PRE:  showDialog says whether Settings is opened
// POST: renders Settings and the separate barred region over TWO_SLOTS, preserving the requested modal state
async function renderSettings(showDialog = true) {
  const store = storeFor((await makeEngine({ settings: TWO_SLOTS })).engine);
  renderWithStore(
    <>
      <SettingsDialog />
      <BarredSlotsPanel />
    </>,
    store,
  );
  if (showDialog) act(() => store.getState().actions.openDialog({ kind: 'settings' }));
  return store;
}

describe('T47: Settings layout', () => {
  it('T63: saved barred rows are summaries and Edit/Cancel restore the saved slot', async () => {
    await renderSettings(false);
    expect(screen.getByText('Lunch · 13:00–14:00 · Mon–Fri')).toBeInTheDocument();
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit barred slot Lunch' }));
    const row = screen.getByRole('group', { name: 'Barred slot 1' });
    expect(within(row).getByLabelText('Label')).toHaveValue('Lunch');
    await userEvent.clear(within(row).getByLabelText('Label'));
    await userEvent.type(within(row).getByLabelText('Label'), 'Draft');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel barred slot changes' }));
    expect(screen.getByText('Lunch · 13:00–14:00 · Mon–Fri')).toBeInTheDocument();
  });
  it('T53 D-09, D-13: keeps separate barred editing and adds Appearance to Settings', async () => {
    await renderSettings();

    const headings: (string | null)[] = [];
    // INVARIANT: headings contains every section heading of each visited tab, in tab order
    for (const tab of ['Scheduling', 'Categories', 'Appearance', 'Data']) {
      await userEvent.click(screen.getByRole('tab', { name: tab }));
      headings.push(
        ...within(screen.getByRole('tabpanel', { name: tab }))
          .getAllByRole('heading', { level: 3 })
          .map((heading) => heading.textContent),
      );
    }
    // POST: all five original section headings are retained across the four tabs
    expect(headings).toEqual([
      'Working time',
      'Scheduling defaults',
      'Categories',
      'Appearance',
      'Data',
    ]);

    await userEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    const workingTime = screen.getByRole('region', { name: 'Working time' });
    expect(within(workingTime).getByRole('group', { name: 'Working days' })).toBeInTheDocument();
    expect(within(workingTime).getByLabelText('Working hours from')).toBeInTheDocument();
    expect(within(workingTime).getByLabelText('Working hours to')).toBeInTheDocument();
    const defaults = screen.getByRole('region', { name: 'Scheduling defaults' });
    expect(within(defaults).getByLabelText('Default buffer (min)')).toBeInTheDocument();
    expect(within(defaults).getByLabelText('Default ranking')).toBeInTheDocument();
    const barred = screen.getByRole('region', { name: /^Barred slots \(/ });
    expect(within(barred).getAllByRole('group', { name: /^Barred slot \d$/ })).toHaveLength(2);
    await userEvent.click(screen.getByRole('tab', { name: 'Data' }));
    expect(screen.getByRole('region', { name: 'Data' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Categories' }));
    expect(screen.getByRole('region', { name: 'Categories' })).toBeInTheDocument();
  });

  it('shows each barred slot as one compact row: label, from–to, day chips and a remove ×', async () => {
    await renderSettings(false);
    await userEvent.click(screen.getByRole('button', { name: 'Edit barred slot Gym' }));

    const gym = screen.getByRole('group', { name: 'Barred slot 2' });
    expect(gym).toHaveClass('barred-row');
    expect(within(gym).getByLabelText('Label')).toHaveValue('Gym');
    expect(within(gym).getByLabelText('From')).toHaveValue('18:00');
    expect(within(gym).getByLabelText('To')).toHaveValue('19:00');
    expect(within(gym).getByRole('checkbox', { name: 'Tue' })).toBeChecked();
    expect(within(gym).getByRole('checkbox', { name: 'Mon' })).not.toBeChecked();
    const remove = within(gym).getByRole('button', { name: 'Remove barred slot 2' });
    expect(remove).toHaveTextContent('×');
  });

  it('adds a new slot at the end and moves focus to its label', async () => {
    await renderSettings(false);

    await userEvent.click(screen.getByRole('button', { name: 'Add barred slot' }));

    const added = screen.getByRole('group', { name: 'Barred slot 3' });
    expect(within(added).getByLabelText('Label')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Edit barred slot Lunch' }));
    expect(
      within(screen.getByRole('group', { name: 'Barred slot 1' })).getByLabelText('Label'),
    ).toHaveValue('Lunch');
  });
});
