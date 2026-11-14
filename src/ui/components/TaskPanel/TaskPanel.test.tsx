// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flexEv, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { TaskPanel } from './TaskPanel';

const tasks = [
  task('A', 60, ['Mon 09:00', 'Fri 18:00'], { priority: 'low' }),
  task('B', 60, ['Mon 09:00', 'Thu 18:00'], { priority: 'high' }),
  task('C', 60, ['Mon 09:00', 'Wed 18:00'], { priority: 'medium' }),
  task('D', 60, ['Mon 09:00', 'Wed 18:00'], { priority: 'high' }),
];

const rowNames = () =>
  within(screen.getByRole('list', { name: 'Task list' }))
    .getAllByRole('listitem')
    .map((row) => row.querySelector('strong')?.textContent);

describe('TaskPanel (T30 UI, FR6)', () => {
  it('T63: task names edit and the action menu exposes completion, reopen, edit and delete', async () => {
    const store = storeFor((await makeEngine({ tasks: tasks.slice(0, 1) })).engine);
    renderWithStore(<TaskPanel />, store);
    await userEvent.click(screen.getByRole('button', { name: 'Edit A' }));
    expect(store.getState().dialog).toEqual({ kind: 'task', mode: 'edit', id: 'A' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for A' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit A' }));
    expect(store.getState().dialog).toEqual({ kind: 'task', mode: 'edit', id: 'A' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for A' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'More actions for A' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for A' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark A done' }));
    await waitFor(() => expect(store.getState().snapshot.tasks[0]?.status).toBe('done'));
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'done');
    await userEvent.click(screen.getByRole('button', { name: 'More actions for A' }));
    expect(screen.getByRole('menuitem', { name: 'Edit A' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete A' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reopen A' }));
    await waitFor(() => expect(store.getState().snapshot.tasks[0]?.status).toBe('unscheduled'));
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'open');
    await userEvent.click(screen.getByRole('button', { name: 'More actions for A' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete A' }));
    expect(store.getState().dialog).toMatchObject({ kind: 'confirm', title: 'Delete task?' });
  });
  it('T56: shows both window dates with the full time range available on the row', async () => {
    const store = storeFor((await makeEngine({ tasks: tasks.slice(0, 1) })).engine);
    renderWithStore(<TaskPanel />, store);

    expect(screen.getByText('Mon 2–Fri 6 Nov')).toHaveAttribute(
      'title',
      'Mon 2 Nov 09:00 – Fri 6 Nov 18:00',
    );
  });

  it('lists tasks by priority, re-sorts by window end and filters by priority', async () => {
    const store = storeFor((await makeEngine({ tasks })).engine);
    renderWithStore(<TaskPanel />, store);

    expect(rowNames()).toEqual(['D', 'B', 'C', 'A']);
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'windowEnd');
    expect(rowNames()).toEqual(['D', 'C', 'B', 'A']);
    act(() => store.getState().actions.setTaskPanel({ priorities: ['medium'] }));
    expect(rowNames()).toEqual(['C']);
    expect(store.getState().snapshot.tasks).toHaveLength(4);
  });

  it('shows status and filters by it', async () => {
    const week: [string, string] = ['Mon 09:00', 'Fri 18:00'];
    const store = storeFor(
      (
        await makeEngine({
          events: [flexEv('E', 'Tue 10:00', 'Tue 11:00', week, { title: 'S', taskId: 'S' })],
          tasks: [
            task('U', 30, week),
            task('S', 60, week, { status: 'scheduled', scheduledEventId: 'E' }),
          ],
        })
      ).engine,
    );
    renderWithStore(<TaskPanel />, store);

    expect(rowNames()).toEqual(['S', 'U']);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'unscheduled');
    expect(rowNames()).toEqual(['U']);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'all');
    expect(screen.getByText('Scheduled Tue 10:00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select S' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'scheduled');
    expect(rowNames()).toEqual(['S']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for S' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unschedule S' }));
    await waitFor(() =>
      expect(store.getState().snapshot.tasks.find((task) => task.id === 'S')?.status).toBe(
        'unscheduled',
      ),
    );
    expect(store.getState().snapshot.events).toEqual([]);
  });

  it('"Find time (N)" opens the picker for the ticked tasks', async () => {
    const store = storeFor((await makeEngine({ tasks })).engine);
    renderWithStore(<TaskPanel />, store);
    const findSelected = () => screen.getByRole('button', { name: /^Find time \(\d+\)$/ });

    expect(screen.queryByRole('button', { name: /^Find time \(\d+\)$/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select A' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select B' }));
    expect(findSelected()).toHaveTextContent('Find time (2)');
    await userEvent.click(findSelected());

    expect(store.getState().picker).toMatchObject({ mode: 'task', queue: ['B', 'A'] });
  });

  it('row buttons open the picker or the edit dialog; + Task opens the create dialog', async () => {
    const store = storeFor((await makeEngine({ tasks: tasks.slice(0, 1) })).engine);
    renderWithStore(<TaskPanel />, store);

    await userEvent.click(screen.getByRole('button', { name: 'Find time' }));
    expect(store.getState().picker).toMatchObject({ queue: ['A'] });
    await userEvent.click(screen.getByRole('button', { name: 'Edit A' }));
    expect(store.getState().dialog).toEqual({ kind: 'task', mode: 'edit', id: 'A' });
    await userEvent.click(screen.getByRole('button', { name: '+ Task' }));
    expect(store.getState().dialog).toEqual({ kind: 'task', mode: 'create' });
  });

  it('says so when no task matches', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<TaskPanel />, store);

    expect(screen.getByText('No tasks to show.')).toBeInTheDocument();
  });
});
