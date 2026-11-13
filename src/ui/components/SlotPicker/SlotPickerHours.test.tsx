// @vitest-environment jsdom
// T42 (UI) — the alternatives picker's search hours and its explanations (WI-41, #3, #4, #9).
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, flexEv } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { SlotPicker } from './SlotPicker';

const FIXED_GIG_NOTE = 'Gig is fixed, so no suggestions are made for it.';

const firstSlotLabel = () =>
  (
    within(screen.getByRole('group', { name: 'Available slots' }))
      .getAllByRole('radio')[0]
      ?.closest('label')?.textContent ?? ''
  ).trim();

describe('SlotPicker — alternatives search hours (T42)', () => {
  it('defaults to Any time for a night event, says it is fixed, and can switch to working hours', async () => {
    const { engine } = await makeEngine({
      events: [ev('Gig', 'Mon 21:00', 'Mon 22:00'), ev('Show', 'Mon 21:30', 'Mon 22:30')],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);

    act(() => store.getState().actions.openEventAlternatives('Gig'));
    expect(screen.getByText(FIXED_GIG_NOTE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Allow moving this event' }));

    const hours = screen.getByRole('group', { name: 'Search hours' });
    expect(within(hours).getByRole('radio', { name: 'Any time' })).toBeChecked();
    expect(firstSlotLabel()).toBe('Closest Mon 2 Nov 20:30–21:30');

    await userEvent.click(within(hours).getByRole('radio', { name: 'Working hours only' }));

    expect(within(hours).getByRole('radio', { name: 'Working hours only' })).toBeChecked();
    expect(firstSlotLabel()).toBe('Closest Mon 2 Nov 17:00–18:00');
  });

  it('defaults to Working hours only inside working hours, with no fixed note for a flexible event', async () => {
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

    expect(screen.getByRole('radio', { name: 'Working hours only' })).toBeChecked();
    expect(screen.queryByText(/is fixed, so no suggestions are made/)).not.toBeInTheDocument();
    expect(firstSlotLabel()).toBe('Closest Mon 2 Nov 12:00–13:00');
  });

  it('names why a working-hours search is empty and points to Any time', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('Hike', 'Sat 10:00', 'Sat 11:00', ['Sat 00:00', 'Sun 00:00'])],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);

    act(() => store.getState().actions.openEventAlternatives('Hike'));
    expect(screen.getByRole('radio', { name: 'Any time' })).toBeChecked();
    expect(firstSlotLabel()).toBe('Closest Sat 7 Nov 10:00–11:00');

    await userEvent.click(screen.getByRole('radio', { name: 'Working hours only' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Its window has no working hours. Choose "Any time" to search outside them.',
    );
  });
});
