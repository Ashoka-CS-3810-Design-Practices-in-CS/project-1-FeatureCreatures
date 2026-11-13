// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { App } from '../../App';
import { toFullCalendar } from '../CalendarView/toFullCalendar';

describe('T49: category filters (D-11)', () => {
  it('combines category and priority filters for calendar/counts while preserving conflicts and tasks; reset restores all', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Lecture', 'Mon 10:00', 'Mon 11:00', { categoryId: 'class', priority: 'high' }),
        ev('Meeting', 'Mon 10:30', 'Mon 11:30'),
      ],
      tasks: [task('Report', 60, ['Mon 09:00', 'Fri 18:00'])],
    });
    const store = storeFor(engine);
    renderWithStore(<App />, store);
    const filters = screen.getByRole('group', { name: 'Category filter' });
    expect(within(filters).getByRole('button', { name: 'Class' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(filters).getByRole('button', { name: 'Class' }));
    expect(
      screen.getByText('1 event (1 hidden by filter) · 1 task · 1 conflict'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Conflict list' })).getByText('(hidden by filter)'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Task list' })).getByText('Report'),
    ).toBeInTheDocument();
    act(() => store.getState().actions.toggleEventPriority('medium'));
    expect(
      screen.getByText('0 events (2 hidden by filter) · 1 task · 1 conflict'),
    ).toBeInTheDocument();
    expect(
      toFullCalendar(
        engine.snapshot(),
        store.getState().eventPriorityFilter,
        null,
        [],
        store.getState().currentMinute,
        store.getState().hiddenCategoryIds,
      ),
    ).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(store.getState().hiddenCategoryIds).toEqual([]);
    expect(store.getState().eventPriorityFilter).toEqual(['high', 'medium', 'low']);
    expect(screen.getByText('2 events · 1 task · 1 conflict')).toBeInTheDocument();
  });

  it('List explains category-hidden events, Show all restores them, and renamed tags reach accessible names', async () => {
    const { engine } = await makeEngine({
      events: [ev('Lecture', 'Mon 10:00', 'Mon 11:00', { categoryId: 'class' })],
    });
    const store = storeFor(engine);
    act(() => store.setState({ view: { ...store.getState().view, type: 'listWeek' } }));
    renderWithStore(<App />, store);
    expect(await screen.findByRole('button', { name: /Lecture,.*Class/ })).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Category filter' })).getByRole('button', {
        name: 'Class',
      }),
    );
    expect(
      await screen.findByText('All events in this range are hidden by the calendar filters'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(await screen.findByRole('button', { name: /Lecture,.*Class/ })).toBeInTheDocument();
    await act(async () => {
      await store
        .getState()
        .actions.updateCategory('class', { name: 'Seminar', colour: '#577d35' });
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Lecture,.*Seminar/ })).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole('group', { name: 'Category filter' })).getByRole('button', {
        name: 'Seminar',
      }),
    ).toBeInTheDocument();
  });
});
