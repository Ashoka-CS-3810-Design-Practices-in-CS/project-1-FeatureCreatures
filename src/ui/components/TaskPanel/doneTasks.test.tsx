// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { flexEv, task } from '../../../../tests/helpers/builders';
import { capture, makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { TaskDialog } from '../TaskDialog/TaskDialog';
import { TaskPanel } from './TaskPanel';

const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE: none
// POST: returns valid linked scheduled, unscheduled and done tasks at the inclusive cutoff
async function setup() {
  const ready = await makeEngine({
    now: 'Mon 08:00',
    tasks: [
      task('Scheduled', 60, WINDOW, { status: 'scheduled', scheduledEventId: 'E' }),
      task('Unscheduled', 30, ['Mon 09:00', 'Mon 11:00']),
      task('Later', 30, ['Mon 09:00', 'Mon 11:01']),
      task('Finished', 30, WINDOW, { status: 'done', doneAt: t('Mon 07:00') }),
    ],
    events: [
      flexEv('E', 'Mon 10:00', 'Mon 11:00', WINDOW, {
        title: 'Scheduled',
        taskId: 'Scheduled',
        categoryId: 'assignment',
      }),
    ],
  });
  return { ...ready, store: storeFor(ready.engine) };
}

describe('T54: task completion controls', () => {
  it('defaults to Open, completes a scheduled row and exposes only Reopen/Edit/Delete on done rows', async () => {
    const { store } = await setup();
    renderWithStore(
      <>
        <TaskPanel />
        <TaskDialog />
        <ConfirmDialog />
      </>,
      store,
    );
    expect(screen.getByLabelText('Show')).toHaveValue('open');
    expect(screen.getByText('Scheduled', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText('Finished', { selector: 'strong' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark Scheduled done' }));
    await waitFor(() => expect(store.getState().snapshot.events).toEqual([]));
    expect(screen.queryByText('Scheduled', { selector: 'strong' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'done');
    const row = screen.getByText('Scheduled', { selector: 'strong' }).closest('li') as HTMLElement;
    expect(row).toHaveClass('task-done');
    expect(within(row).getByText('✓ Done')).toBeInTheDocument();
    expect(
      within(row)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Reopen', 'Edit', 'Delete']);
    await userEvent.click(within(row).getByRole('button', { name: 'Reopen Scheduled' }));
    await waitFor(() =>
      expect(store.getState().snapshot.tasks[0]).toMatchObject({
        status: 'unscheduled',
        doneAt: null,
      }),
    );
    expect(store.getState().snapshot.events).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Finished' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete task?' })).getByRole('button', {
        name: 'Delete',
        exact: true,
      }),
    );
    await waitFor(() =>
      expect(store.getState().snapshot.tasks.some((task) => task.id === 'Finished')).toBe(false),
    );
  });

  it('completes from the task dialog, edits a done task without reopening, then reopens from the dialog', async () => {
    const { store } = await setup();
    renderWithStore(
      <>
        <TaskDialog />
        <ConfirmDialog />
      </>,
      store,
    );
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'Scheduled' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.events).toEqual([]);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'Scheduled' }));
    expect(screen.queryByRole('button', { name: 'Find time' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unschedule' })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Edited done');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.tasks[0]).toMatchObject({
      name: 'Edited done',
      status: 'done',
      doneAt: t('Mon 08:00'),
    });
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'Scheduled' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.tasks[0]).toMatchObject({
      status: 'unscheduled',
      doneAt: null,
    });
  });

  it('opens the Tasks menu bulk dialog, previews exact membership, resets on cutoff edit, and Cancel never writes', async () => {
    const { engine, repo, store } = await setup();
    renderWithStore(<App />, store);
    const before = await capture(engine, repo);
    await userEvent.click(screen.getByRole('button', { name: 'Tasks menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark done before…' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark done before…' });
    expect(within(dialog).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Before'), {
      target: { value: '2026-11-02T11:00' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preview', exact: true }));
    expect(within(dialog).getByText('2 tasks will be marked done.')).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining('Scheduled'), expect.stringContaining('Unscheduled')]);
    expect(within(dialog).queryByText('Later')).not.toBeInTheDocument();
    expect(await capture(engine, repo)).toEqual(before);
    fireEvent.change(within(dialog).getByLabelText('Before'), {
      target: { value: '2026-11-02T11:01' },
    });
    expect(within(dialog).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }));
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('applies a preview as one undo step and requires a fresh preview after any change', async () => {
    const { store } = await setup();
    renderWithStore(<App />, store);
    await userEvent.click(screen.getByRole('button', { name: 'Tasks menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark done before…' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark done before…' });
    fireEvent.change(within(dialog).getByLabelText('Before'), {
      target: { value: '2026-11-02T11:00' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preview', exact: true }));
    await act(async () => {
      await store
        .getState()
        .actions.updateTask('Later', {
          ...task('Later', 30, ['Mon 09:00', 'Mon 11:01']),
          name: 'Later edited',
        });
    });
    expect(within(dialog).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    expect(
      within(dialog).getByText('Tasks changed. Preview again before applying.'),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preview', exact: true }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply', exact: true }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.tasks.filter((task) => task.status === 'done')).toHaveLength(
      3,
    );
    expect(store.getState().snapshot.events).toEqual([]);
    await act(async () => {
      await store.getState().actions.undo();
    });
    expect(store.getState().snapshot.tasks.filter((task) => task.status === 'done')).toHaveLength(
      1,
    );
    expect(store.getState().snapshot.events.map((event) => event.id)).toEqual(['E']);
    expect(store.getState().snapshot.tasks[2]?.name).toBe('Later edited');
  });
});
