// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { ev, iv } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { CalendarView } from './CalendarView';

describe('CalendarView', () => {
  it('renders the week of the store date with its events and reports the visible range', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Lecture', 'Mon 10:00', 'Mon 11:30', { priority: 'high' }),
        ev('Gym', 'Wed 18:00', 'Wed 19:00'),
      ],
    });
    const store = storeFor(engine);

    renderWithStore(<CalendarView calendarRef={createRef()} />, store);

    expect(await screen.findByText('Lecture')).toBeInTheDocument();
    expect(screen.getByText('Gym')).toBeInTheDocument();
    expect(screen.getAllByText('Fixed').length).toBeGreaterThanOrEqual(2);
    await waitFor(() =>
      expect(store.getState().view.activeRange).toEqual(iv('Mon 00:00', '2026-11-09 00:00')),
    );
  });
});
