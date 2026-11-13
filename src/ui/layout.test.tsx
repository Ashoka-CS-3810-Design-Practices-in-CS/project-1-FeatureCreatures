// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, settings, task } from '../../tests/helpers/builders';
import { makeEngine } from '../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../tests/helpers/render';
import { TaskPanel } from './components/TaskPanel/TaskPanel';
import { App } from './App';

// PRE: none
// POST: returns a ready store with two open tasks, one upcoming conflict and one barred slot
async function layoutStore() {
  const { engine } = await makeEngine({
    tasks: [
      task('Read', 60, ['Mon 09:00', 'Fri 18:00']),
      task('Write', 30, ['Mon 09:00', 'Fri 18:00']),
    ],
    events: [ev('A', 'Mon 10:00', 'Mon 11:00'), ev('B', 'Mon 10:30', 'Mon 11:30')],
    settings: settings({
      barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
    }),
  });
  return storeFor(engine);
}

describe('T56: five-region ownership (D-14)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps one creation control in each region and separates Conflicts, Replan and Barred slots', async () => {
    const store = await layoutStore();
    renderWithStore(<App />, store);
    const appBar = screen.getByRole('banner');
    const calendar = screen.getByRole('region', { name: 'Calendar' });
    const tasks = screen.getByRole('region', { name: 'Tasks (2)' });
    const conflicts = screen.getByRole('region', { name: 'Conflicts (1)' });
    const replan = screen.getByRole('region', { name: 'Replan' });
    const barred = screen.getByRole('region', { name: 'Barred slots (1)' });
    expect(conflicts.contains(replan)).toBe(false);
    expect(conflicts.contains(barred)).toBe(false);
    expect(within(appBar).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(within(appBar).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(within(appBar).queryByRole('button', { name: '+ Event' })).not.toBeInTheDocument();
    expect(within(appBar).queryByRole('button', { name: '+ Task' })).not.toBeInTheDocument();
    expect(within(calendar).getByRole('button', { name: '+ Event' })).toHaveClass('primary');
    expect(within(tasks).getByRole('button', { name: '+ Task' })).toHaveClass('primary');
    expect(screen.getAllByRole('button', { name: '+ Task' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    await userEvent.click(within(replan).getByRole('button', { name: 'Plan…' }));
    expect(screen.getByRole('dialog', { name: 'Replan' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: 'Replan' })).getByLabelText('From'),
    ).toHaveValue('2026-11-02');
    expect(
      within(screen.getByRole('dialog', { name: 'Replan' })).getByLabelText('Strategy'),
    ).toHaveValue('balanced');
  });

  it('removes duplicate task-priority controls and shows the selection action only for a nonempty selection', async () => {
    const store = await layoutStore();
    renderWithStore(<TaskPanel />, store);
    const tasks = screen.getByRole('region', { name: /^Tasks/ });
    expect(within(tasks).queryByRole('group', { name: 'Priorities' })).not.toBeInTheDocument();
    expect(within(tasks).getByLabelText('Show')).toHaveValue('open');
    expect(within(tasks).getByLabelText('Sort by')).toHaveValue('priority');
    expect(within(tasks).queryByRole('button', { name: /^Find time \(/ })).not.toBeInTheDocument();
    await userEvent.click(within(tasks).getByRole('checkbox', { name: 'Select Read' }));
    await userEvent.click(within(tasks).getByRole('button', { name: 'Find time (1)' }));
    expect(store.getState().picker).toMatchObject({ mode: 'task', queue: ['Read'] });
  });

  it('keeps calendar filters independent from the task region', async () => {
    const store = await layoutStore();
    renderWithStore(<App />, store);
    const calendar = screen.getByRole('region', { name: 'Calendar' });
    const tasks = screen.getByRole('region', { name: 'Tasks (2)' });
    await userEvent.click(within(calendar).getByRole('button', { name: 'M' }));
    expect(within(tasks).getByText('Read', { selector: 'strong' })).toBeInTheDocument();
    expect(within(tasks).getByText('Write', { selector: 'strong' })).toBeInTheDocument();
    expect(store.getState().snapshot.tasks).toHaveLength(2);
  });

  it('below 1280 px opens separate Tasks and Conflicts drawers and restores their triggers', async () => {
    const media = window.matchMedia('(max-width: 1279px)');
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      ...media,
      media: query,
      matches: query === '(max-width: 1279px)',
    }));
    const store = await layoutStore();
    renderWithStore(<App />, store);
    const tasksTrigger = screen.getByRole('button', { name: 'Tasks (2)' });
    const conflictsTrigger = screen.getByRole('button', { name: 'Conflicts (1)' });
    await userEvent.click(tasksTrigger);
    const tasksDrawer = screen.getByRole('dialog', { name: /^Tasks/ });
    expect(within(tasksDrawer).getByRole('button', { name: '+ Task' })).toBeInTheDocument();
    expect(
      within(tasksDrawer).queryByRole('region', { name: 'Conflicts (1)' }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(tasksDrawer).getByRole('button', { name: 'Close' }));
    expect(tasksTrigger).toHaveFocus();
    await userEvent.click(conflictsTrigger);
    const conflictsDrawer = screen.getByRole('dialog', { name: /^Conflicts/ });
    expect(within(conflictsDrawer).getByRole('region', { name: 'Replan' })).toBeInTheDocument();
    expect(
      within(conflictsDrawer).getByRole('region', { name: 'Barred slots (1)' }),
    ).toBeInTheDocument();
    expect(
      within(conflictsDrawer).queryByRole('region', { name: 'Tasks (2)' }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(conflictsDrawer).getByRole('button', { name: 'Close' }));
    expect(conflictsTrigger).toHaveFocus();
  });
});
