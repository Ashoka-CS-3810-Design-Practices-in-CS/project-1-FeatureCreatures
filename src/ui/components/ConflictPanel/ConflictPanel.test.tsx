// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONFLICT_LIST_LIMIT } from '@/shared/constants';
import type { CalendarEvent } from '@/shared/types';
import { ev, flexEv } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import { ConflictPanel } from './ConflictPanel';

const EXTRA_CONFLICTS = 5;
const SPACING_MIN = 10;
const SHORT_EVENT_MIN = 5;

describe('ConflictPanel', () => {
  it('T14: lists the overlap of a dropped event with its date, time and minutes', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('A', 'Mon 10:00', 'Mon 11:30', { priority: 'high' }),
        ev('B', 'Mon 11:00', 'Mon 12:00'),
      ],
    });
    renderWithStore(<ConflictPanel />, storeFor(engine));

    expect(screen.getByRole('heading', { name: 'Conflicts (1)' })).toBeInTheDocument();
    expect(screen.getByText('⚠ A ↔ B')).toBeInTheDocument();
    expect(screen.getByText('Mon 2 Nov 11:00–11:30 (30 min)')).toBeInTheDocument();
  });

  it('T30: a conflict of filtered-out events stays listed, tagged "(hidden by filter)"', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('H', 'Mon 09:00', 'Mon 10:00', { priority: 'high' }),
        ev('L1', 'Mon 11:00', 'Mon 12:00', { priority: 'low' }),
        ev('L2', 'Mon 11:30', 'Mon 12:30', { priority: 'low' }),
      ],
    });
    const store = storeFor(engine);
    renderWithStore(<ConflictPanel />, store);

    act(() => store.setState({ eventPriorityFilter: ['high'] }));

    const row = within(screen.getByRole('list', { name: 'Conflict list' })).getByRole('listitem');
    expect(row).toHaveTextContent('L1 ↔ L2');
    expect(row).toHaveTextContent('(hidden by filter)');
  });

  it('Suggest alternatives opens the picker for the BR-10 target', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' }),
        flexEv('Meeting', 'Mon 11:00', 'Mon 12:00', ['Mon 09:00', 'Mon 18:00']),
      ],
    });
    const store = storeFor(engine);
    renderWithStore(<ConflictPanel />, store);

    await userEvent.click(
      screen.getByRole('button', { name: 'Suggest alternatives for Lecture ↔ Meeting' }),
    );

    expect(store.getState().picker).toMatchObject({
      mode: 'alternatives',
      eventId: 'Meeting',
      otherEventId: 'Lecture',
    });
  });

  it('says "No conflicts" when there are none', async () => {
    renderWithStore(<ConflictPanel />, storeFor((await makeEngine()).engine));

    expect(screen.getByText('No conflicts')).toBeInTheDocument();
  });

  it(`shows the first ${CONFLICT_LIST_LIMIT} and counts the rest`, async () => {
    const events: CalendarEvent[] = [ev('Base', 'Mon 00:00', 'Mon 23:00')];
    // INVARIANT: events holds Base plus index short events inside it, each conflicting with Base
    for (let index = 0; index < CONFLICT_LIST_LIMIT + EXTRA_CONFLICTS; index += 1) {
      const start = t('Mon 00:00') + index * SPACING_MIN;
      events.push(
        ev(`E${index}`, 'Mon 00:00', 'Mon 00:00', { start, end: start + SHORT_EVENT_MIN }),
      );
    }
    // POST: Base conflicts with every other event, and those never overlap each other
    renderWithStore(
      <ConflictPanel />,
      storeFor((await makeEngine({ events })).engine, { now: () => t('Mon 00:00') }),
    );

    expect(
      within(screen.getByRole('list', { name: 'Conflict list' })).getAllByRole('listitem'),
    ).toHaveLength(CONFLICT_LIST_LIMIT);
    expect(screen.getByText(`and ${EXTRA_CONFLICTS} more`)).toBeInTheDocument();
  });
});
