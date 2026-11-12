// @vitest-environment jsdom
// T46 (UI) — stable Move order (#5) and the ER2 / ER3 stretch explanation (#7), WI-45.
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, flexEv, settings, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { SlotPicker } from './SlotPicker';

const moveOrder = () =>
  within(screen.getByRole('group', { name: 'Move' }))
    .getAllByRole('radio')
    .map((radio) => (radio.closest('label')?.textContent ?? '').trim());

const lunch = settings({
  barredSlots: [
    { id: 'l', label: 'Lunch', startMin: 13 * 60, endMin: 14 * 60, days: [1, 2, 3, 4, 5] },
  ],
});

describe('SlotPicker — small UX (T46)', () => {
  it('#5: the Move radios keep the conflict order (aId, then bId) whichever is selected', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' }),
        flexEv('Meeting', 'Mon 11:00', 'Mon 12:00', ['Mon 09:00', 'Mon 18:00']),
      ],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    const conflict = store.getState().snapshot.conflicts[0];
    if (conflict === undefined) throw new Error('no conflict');
    act(() => store.getState().actions.openAlternatives(conflict));
    const expected = [conflict.aId, conflict.bId];

    expect(moveOrder()).toEqual(expected);
    await userEvent.click(screen.getByRole('radio', { name: 'Lecture' }));
    expect(screen.getByRole('radio', { name: 'Lecture' })).toBeChecked();
    expect(moveOrder()).toEqual(expected);
  });

  it('#7: an ER2 lists the available stretches and the barred slot that splits them', async () => {
    const { engine } = await makeEngine({
      settings: lunch,
      tasks: [task('Read', 45, ['Mon 12:30', 'Mon 14:30'], { name: 'Read' })],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);

    act(() => store.getState().actions.openTaskPicker(['Read']));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'the longest stretch available in its window is 30 min',
    );
    expect(
      screen.getByText('Available: 12:30–13:00, 14:00–14:30 — Lunch 13:00–14:00 is barred.'),
    ).toBeInTheDocument();
  });

  it('#7: an ER3 lists the free gaps and the event that splits them', async () => {
    const { engine } = await makeEngine({
      events: [ev('Meeting', 'Mon 10:00', 'Mon 11:00')],
      tasks: [task('Essay', 90, ['Mon 09:00', 'Mon 12:00'], { name: 'Essay' })],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);

    act(() => store.getState().actions.openTaskPicker(['Essay']));

    expect(
      screen.getByText('Available: 09:00–10:00, 11:00–12:00 — "Meeting" 10:00–11:00 is booked.'),
    ).toBeInTheDocument();
  });
});
