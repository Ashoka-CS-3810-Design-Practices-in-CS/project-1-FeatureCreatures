// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Engine } from '@/engine';
import { MAX_DESCRIPTION_LENGTH } from '@/shared/constants';
import { flexEv, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import type { AppStore } from '../../store/appStore';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { TaskDialog } from './TaskDialog';

const WEEK: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE:  engine is initialised
// POST: renders the task and confirm dialogs over a store for engine and returns the store
function renderDialogs(engine: Engine): AppStore {
  const store = storeFor(engine);
  renderWithStore(
    <>
      <TaskDialog />
      <ConfirmDialog />
    </>,
    store,
  );
  return store;
}

const buttonNames = () => screen.getAllByRole('button').map((button) => button.textContent);

describe('TaskDialog', () => {
  it('defaults to Working hours only and saves Any time as useWorkingHours false', async () => {
    const { engine } = await makeEngine();
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'create' }));
    expect(screen.getByRole('group', { name: 'Scheduling hours' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Working hours only' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Any time' }));
    await userEvent.click(screen.getByRole('radio', { name: '[L] Low' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Read');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.tasks[0]).toMatchObject({
      useWorkingHours: false,
      priority: 'low',
    });
    const savedTask = store.getState().snapshot.tasks[0];
    act(() =>
      store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: savedTask?.id ?? '' }),
    );
    expect(screen.getByRole('radio', { name: 'Any time' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Working hours only' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.tasks[0]?.useWorkingHours).toBe(true);
  });

  it('creates a task with hours + minutes mapped to durationMin', async () => {
    const { engine } = await makeEngine();
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'create' }));

    await userEvent.type(screen.getByLabelText('Name'), 'Write report');
    await userEvent.clear(screen.getByLabelText('Minutes'));
    await userEvent.type(screen.getByLabelText('Minutes'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.tasks).toEqual([
      expect.objectContaining({ name: 'Write report', durationMin: 90, status: 'unscheduled' }),
    ]);
  });

  // AUDIT A09: the resolver blocked Save but nothing said why.
  it('a description over the limit shows its message under Description', async () => {
    const { engine } = await makeEngine();
    const createTask = vi.spyOn(engine, 'createTask');
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'create' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Read');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Description can be at most 1000 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('T31 (UI): an empty duration shows "Duration must be a number." under Duration', async () => {
    const { engine } = await makeEngine();
    const createTask = vi.spyOn(engine, 'createTask');
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'create' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Read');
    await userEvent.clear(screen.getByLabelText('Hours'));
    await userEvent.clear(screen.getByLabelText('Minutes'));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Duration must be a number.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hours')).toHaveAttribute('aria-invalid', 'true');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('shows Find time / Unschedule / Delete only in edit mode, as the status allows', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { title: 'S', taskId: 'S' })],
      tasks: [
        task('U', 60, WEEK),
        task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' }),
      ],
    });
    const store = renderDialogs(engine);

    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'create' }));
    // The shared Modal adds its × (Close) last (WI-45).
    expect(buttonNames()).toEqual(['Save', 'Cancel', '×']);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'U' }));
    expect(buttonNames()).toEqual(['Save', 'Cancel', 'Find time', 'Delete', '×']);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'S' }));
    expect(buttonNames()).toEqual(['Save', 'Cancel', 'Unschedule', 'Delete', '×']);
  });

  it('Find time opens the picker for the task; Unschedule unschedules and closes', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { title: 'S', taskId: 'S' })],
      tasks: [
        task('U', 60, WEEK),
        task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' }),
      ],
    });
    const store = renderDialogs(engine);

    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'U' }));
    await userEvent.click(screen.getByRole('button', { name: 'Find time' }));
    expect(store.getState().picker).toMatchObject({ mode: 'task', queue: ['U'] });
    expect(store.getState().dialog).toBeNull();

    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'S' }));
    await userEvent.click(screen.getByRole('button', { name: 'Unschedule' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.events).toEqual([]);
  });

  it('deletes a scheduled task only after confirming', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { title: 'S', taskId: 'S' })],
      tasks: [task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' })],
    });
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'S' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      screen.getByText('Delete "S" and its scheduled event? You can undo this.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(store.getState().snapshot.tasks).toEqual([]));
    expect(store.getState().snapshot.events).toEqual([]);
  });

  it('edits a task, and shows nothing for a task that is gone', async () => {
    const { engine } = await makeEngine({ tasks: [task('U', 60, WEEK)] });
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'U' }));

    await userEvent.click(screen.getByRole('radio', { name: '[H] High' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.tasks[0]?.priority).toBe('high');

    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'missing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
