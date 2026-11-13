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
  it('T53 D-09: keeps four Settings sections and edits barred slots in its separate region', async () => {
    await renderSettings();

    const headings = within(screen.getByRole('dialog', { name: 'Settings' }))
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Working time', 'Scheduling defaults', 'Categories', 'Data']);

    const workingTime = screen.getByRole('region', { name: 'Working time' });
    expect(within(workingTime).getByRole('group', { name: 'Working days' })).toBeInTheDocument();
    expect(within(workingTime).getByLabelText('Working hours from')).toBeInTheDocument();
    expect(within(workingTime).getByLabelText('Working hours to')).toBeInTheDocument();
    const defaults = screen.getByRole('region', { name: 'Scheduling defaults' });
    expect(within(defaults).getByLabelText('Default buffer (min)')).toBeInTheDocument();
    expect(within(defaults).getByLabelText('Default ranking')).toBeInTheDocument();
    const barred = screen.getByRole('region', { name: 'Barred slots' });
    expect(within(barred).getAllByRole('group', { name: /^Barred slot \d$/ })).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Data' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Categories' })).toBeInTheDocument();
  });

  it('shows each barred slot as one compact row: label, from–to, day chips and a remove ×', async () => {
    await renderSettings(false);

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
    expect(
      within(screen.getByRole('group', { name: 'Barred slot 1' })).getByLabelText('Label'),
    ).toHaveValue('Lunch');
  });
});
