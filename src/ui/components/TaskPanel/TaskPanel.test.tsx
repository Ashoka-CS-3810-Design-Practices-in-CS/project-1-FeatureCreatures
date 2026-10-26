// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
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
  it('lists tasks by priority, re-sorts by window end and filters by priority', async () => {
    const store = storeFor((await makeEngine({ tasks })).engine);
    renderWithStore(<TaskPanel />, store);

    expect(rowNames()).toEqual(['D', 'B', 'C', 'A']);
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'windowEnd');
    expect(rowNames()).toEqual(['D', 'C', 'B', 'A']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'High' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Low' }));
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

    expect(rowNames()).toEqual(['U']);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'all');
    expect(screen.getByText('Scheduled Tue 3 Nov 10:00–11:00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select S' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'scheduled');
    expect(rowNames()).toEqual(['S']);
  });

  it('"Find time for N selected" opens the picker for the ticked tasks', async () => {
    const store = storeFor((await makeEngine({ tasks })).engine);
    renderWithStore(<TaskPanel />, store);
    const findSelected = () => screen.getByRole('button', { name: /^Find time for \d+ selected$/ });

    expect(findSelected()).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select A' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select B' }));
    expect(findSelected()).toHaveTextContent('Find time for 2 selected');
    await userEvent.click(findSelected());

    expect(store.getState().picker).toMatchObject({ mode: 'task', queue: ['B', 'A'] });
  });

  it('row buttons open the picker or the edit dialog; New task opens the create dialog', async () => {
    const store = storeFor((await makeEngine({ tasks: tasks.slice(0, 1) })).engine);
    renderWithStore(<TaskPanel />, store);

    await userEvent.click(screen.getByRole('button', { name: 'Find time' }));
    expect(store.getState().picker).toMatchObject({ queue: ['A'] });
    await userEvent.click(screen.getByRole('button', { name: 'Edit A' }));
    expect(store.getState().dialog).toEqual({ kind: 'task', mode: 'edit', id: 'A' });
    await userEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(store.getState().dialog).toEqual({ kind: 'task', mode: 'create' });
  });

  it('says so when no task matches', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<TaskPanel />, store);

    expect(screen.getByText('No tasks to show.')).toBeInTheDocument();
  });
});
