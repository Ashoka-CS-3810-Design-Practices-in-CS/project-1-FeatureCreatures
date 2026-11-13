// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, flexEv, iv, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { SlotPicker } from './SlotPicker';

describe('T51: shared suggestion layout (D-06)', () => {
  it('shows deduplicated named picks and time chips with one selected radio, hiding details by default', async () => {
    const { engine } = await makeEngine({
      tasks: [task('Report', 60, ['Mon 09:00', 'Mon 18:00'])],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['Report']));

    const picks = screen.getByRole('region', { name: 'Top picks' });
    expect(within(picks).getAllByRole('radio')).toHaveLength(1);
    expect(within(picks).getByRole('radio', { name: /Earliest.*09:00–10:00/ })).toBeChecked();
    const days = screen.getByRole('region', { name: 'All options by day' });
    expect(within(days).getByRole('heading', { name: 'Mon 2 Nov' })).toBeInTheDocument();
    expect(within(days).getAllByRole('radio')).toHaveLength(8);
    expect(screen.queryByLabelText('Buffer (min)')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Window:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/free gaps in window/)).not.toBeInTheDocument();
    await userEvent.click(within(days).getByRole('button', { name: 'Show 8 more' }));
    expect(within(days).getAllByRole('radio')).toHaveLength(16);
    await userEvent.click(within(days).getByRole('radio', { name: '17:00–18:00' }));
    expect(
      within(screen.getByRole('group', { name: 'Available slots' })).getAllByRole('radio', {
        checked: true,
      }),
    ).toHaveLength(1);
    expect(within(picks).getByRole('radio')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByLabelText('Buffer (min)')).toHaveValue(0);
    expect(screen.getByText(/^Window:/)).toBeInTheDocument();
    expect(screen.getByText(/1 free gap in window/)).toBeInTheDocument();
    expect(screen.getByText(/^Gap 09:00–18:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply selected' }));
    expect(engine.snapshot().events).toHaveLength(1);
    expect(engine.snapshot().events[0]).toMatchObject({
      ...iv('Mon 17:00', 'Mon 18:00'),
      title: 'Report',
      flexible: true,
      taskId: 'Report',
    });
  });

  it('Rank by changes the preselected pick while day chips stay in time order', async () => {
    const { engine } = await makeEngine({
      events: [ev('Busy', 'Mon 14:00', 'Mon 15:00')],
      tasks: [task('Report', 90, ['Mon 10:00', 'Mon 16:40'])],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['Report']));
    const picks = screen.getByRole('region', { name: 'Top picks' });
    const days = screen.getByRole('region', { name: 'All options by day' });
    const before = within(days)
      .getAllByRole('radio')
      .map((radio) => radio.closest('label')?.textContent?.trim());
    expect(before).toEqual([
      '10:30–12:00',
      '11:00–12:30',
      '11:30–13:00',
      '12:00–13:30',
      '12:30–14:00',
      '15:10–16:40',
    ]);
    expect(within(picks).getByRole('radio', { name: /Earliest/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Best fit' }));
    expect(within(picks).getByRole('radio', { name: /Tightest fit.*15:00–16:30/ })).toBeChecked();
    expect(
      within(days)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent?.trim()),
    ).toEqual(before);
  });

  it('alternatives name distinct Closest, Same day and Lightest day picks with short reasons', async () => {
    const { engine } = await makeEngine({
      events: [
        flexEv('Study', 'Mon 11:00', 'Mon 12:00', ['Mon 09:00', 'Tue 18:00']),
        ev('Busy', 'Mon 10:30', 'Mon 18:00'),
      ],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openEventAlternatives('Study'));
    const picks = screen.getByRole('region', { name: 'Top picks' });
    expect(
      within(picks).getByRole('radio', { name: /Closest.*Mon 2 Nov 09:30–10:30/ }),
    ).toBeChecked();
    expect(within(picks).queryByRole('radio', { name: /Same day/ })).not.toBeInTheDocument();
    expect(
      within(picks).getByRole('radio', { name: /Lightest day.*Tue 3 Nov 09:00–10:00/ }),
    ).toBeInTheDocument();
    expect(within(picks).getByText('1 h 30 min earlier')).toBeInTheDocument();
    expect(within(picks).getByText('Tue has 0 min booked')).toBeInTheDocument();
    expect(screen.queryByText(/Closest to the original time/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByLabelText('Buffer (min)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    act(() => store.getState().actions.openEventAlternatives('Study'));
    expect(screen.queryByLabelText('Buffer (min)')).not.toBeInTheDocument();
  });

  it('keeps an empty-result explanation visible while Details is closed', async () => {
    const { engine } = await makeEngine({
      tasks: [task('Report', 600, ['Mon 09:00', 'Mon 18:00'])],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['Report']));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This needs 10 h, but the longest stretch available in its window is 9 h.',
    );
    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByLabelText('Buffer (min)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply selected' })).toBeDisabled();
  });

  it('shows Same day separately when the closest alternative starts tomorrow', async () => {
    const { engine } = await makeEngine({
      events: [
        flexEv('Night', 'Mon 23:00', 'Tue 00:00', ['Mon 09:00', 'Tue 03:00']),
        ev('Busy', 'Mon 10:30', 'Tue 00:00'),
      ],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openEventAlternatives('Night'));
    const picks = screen.getByRole('region', { name: 'Top picks' });
    expect(
      within(picks).getByRole('radio', { name: /Closest.*Tue 3 Nov 00:00–01:00/ }),
    ).toBeChecked();
    expect(
      within(picks).getByRole('radio', { name: /Same day.*Mon 2 Nov 09:30–10:30/ }),
    ).toBeInTheDocument();
    expect(within(picks).getByText('13 h 30 min earlier, same day')).toBeInTheDocument();
    expect(within(picks).queryByRole('radio', { name: /Lightest day/ })).not.toBeInTheDocument();
  });

  it.each(['high', 'medium', 'low'] as const)(
    'Priority-aware preselects the %s priority pick',
    async (priority) => {
      const { engine } = await makeEngine({
        events: [ev('Busy', 'Mon 10:00', 'Mon 18:00')],
        tasks: [task('Report', 60, ['Mon 09:00', 'Tue 18:00'], { priority })],
      });
      const store = storeFor(engine);
      renderWithStore(<SlotPicker />, store);
      act(() => store.getState().actions.openTaskPicker(['Report']));
      await userEvent.click(screen.getByRole('radio', { name: 'Priority-aware' }));
      const picks = screen.getByRole('region', { name: 'Top picks' });
      expect(
        within(picks).getByRole('radio', {
          name: priority === 'low' ? /Lightest day/ : /Earliest/,
        }),
      ).toBeChecked();
      expect(
        screen.getByText(
          `Priority-aware: ${priority === 'high' ? 'High priority → earliest slot' : priority === 'medium' ? 'Medium priority → tightest fit' : 'Low priority → lightest day'}`,
        ),
      ).toBeInTheDocument();
    },
  );

  it('labels chips crossing midnight with both days and reveals the selected gap and day load', async () => {
    const { engine } = await makeEngine({
      tasks: [task('Night', 120, ['Mon 23:00', 'Tue 03:00'], { useWorkingHours: false })],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['Night']));
    const days = screen.getByRole('region', { name: 'All options by day' });
    const chip = within(days).getByRole('radio', { name: 'Mon 2 Nov 23:30 – Tue 3 Nov 01:30' });
    await userEvent.click(chip);
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Selected: Mon 2 Nov 23:30 – Tue 3 Nov 01:30')).toBeInTheDocument();
    expect(screen.getByText('Leaves 2 h unused. Day load 0 min.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.queryByLabelText('Buffer (min)')).not.toBeInTheDocument();
    expect(chip).toBeChecked();
  });
});
