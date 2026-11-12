// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Engine } from '@/engine';
import { MAX_DESCRIPTION_LENGTH } from '@/shared/constants';
import { ev, flexEv, iv, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import type { AppStore } from '../../store/appStore';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { EventDialog } from './EventDialog';

const WEEK: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE:  engine is initialised
// POST: renders the event and confirm dialogs over a store for engine and returns the store
function renderDialogs(engine: Engine): AppStore {
  const store = storeFor(engine);
  renderWithStore(
    <>
      <EventDialog />
      <ConfirmDialog />
    </>,
    store,
  );
  return store;
}

// PRE:  store is rendered
// POST: opens the create dialog for Mon 10:00–11:00
function openCreate(store: AppStore): void {
  act(() =>
    store.getState().actions.openDialog({
      kind: 'event',
      mode: 'create',
      defaults: iv('Mon 10:00', 'Mon 11:00'),
    }),
  );
}

describe('EventDialog', () => {
  it('offers tagged priority radios in a named fieldset and saves the selected priority', async () => {
    const { engine } = await makeEngine();
    const store = renderDialogs(engine);
    openCreate(store);
    expect(screen.getByRole('group', { name: 'Priority' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '[M] Medium' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '[L] Low' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: '[H] High' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Important');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.events[0]?.priority).toBe('high');
  });

  it('creates an event and closes', async () => {
    const { engine } = await makeEngine();
    const store = renderDialogs(engine);
    openCreate(store);

    await userEvent.type(screen.getByLabelText('Title'), 'Standup');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.events).toEqual([
      expect.objectContaining({
        title: 'Standup',
        ...iv('Mon 10:00', 'Mon 11:00'),
        flexible: false,
      }),
    ]);
  });

  it('T49 D-11: category changes preserve the deliberate scheduling choice', async () => {
    const { engine } = await makeEngine();
    const store = renderDialogs(engine);
    openCreate(store);
    const flexible = screen.getByRole('radio', { name: /Flexible/ });

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'assignment');
    expect(flexible).not.toBeChecked();
    expect(screen.queryByLabelText('Window start')).not.toBeInTheDocument();
    await userEvent.click(flexible);
    expect(flexible).toBeChecked();
    expect(screen.getByLabelText('Window start')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'class');
    expect(flexible).toBeChecked();
    expect(screen.getByLabelText('Window start')).toBeInTheDocument();
  });

  it('T5 (UI): end before start shows the message under End, keeps the values and skips the engine', async () => {
    const { engine } = await makeEngine();
    const createEvent = vi.spyOn(engine, 'createEvent');
    const store = renderDialogs(engine);
    openCreate(store);
    await userEvent.type(screen.getByLabelText('Title'), 'Standup');
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-11-02T09:00' } });

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const end = screen.getByLabelText('End');
    expect(await screen.findByText('End time must be after the start time.')).toBeInTheDocument();
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(end).toHaveValue('2026-11-02T09:00');
    expect(screen.getByLabelText('Title')).toHaveValue('Standup');
    expect(store.getState().dialog).not.toBeNull();
    expect(createEvent).not.toHaveBeenCalled();
  });

  // AUDIT A09: the resolver blocked Save but nothing said why.
  it('a description over the limit shows its message under Description and skips the engine', async () => {
    const { engine } = await makeEngine();
    const createEvent = vi.spyOn(engine, 'createEvent');
    const store = renderDialogs(engine);
    openCreate(store);
    await userEvent.type(screen.getByLabelText('Title'), 'Standup');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Description can be at most 1000 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().dialog).not.toBeNull();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('edits an existing event', async () => {
    const { engine } = await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] });
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'event', mode: 'edit', id: 'A' }));

    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(store.getState().snapshot.events[0]?.title).toBe('Renamed');
  });

  it('asks for confirmation before deleting', async () => {
    const { engine } = await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] });
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'event', mode: 'edit', id: 'A' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.getState().snapshot.events).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Delete event?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(store.getState().snapshot.events).toEqual([]));
    expect(store.getState().dialog).toBeNull();
  });

  it('Cancel in the confirmation keeps the event', async () => {
    const { engine } = await makeEngine({ events: [ev('A', 'Mon 10:00', 'Mon 11:00')] });
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'event', mode: 'edit', id: 'A' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(store.getState().dialog).toBeNull();
    expect(store.getState().snapshot.events).toHaveLength(1);
  });

  it('disables the flexible toggle for a task-linked event', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { title: 'T', taskId: 'T' })],
      tasks: [task('T', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' })],
    });
    const store = renderDialogs(engine);
    act(() => store.getState().actions.openDialog({ kind: 'event', mode: 'edit', id: 'E' }));

    expect(screen.getByRole('radio', { name: /Flexible/ })).toBeDisabled();
    expect(screen.getByText('Events of scheduled tasks always stay flexible.')).toBeInTheDocument();
  });

  it('shows nothing for an edit dialog whose event is gone', async () => {
    const { engine } = await makeEngine();
    const store = renderDialogs(engine);

    act(() => store.getState().actions.openDialog({ kind: 'event', mode: 'edit', id: 'missing' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open when the engine refuses the change', async () => {
    const { engine } = await makeEngine();
    vi.spyOn(engine, 'createEvent').mockResolvedValue({
      ok: false,
      error: { code: 'StorageError', message: 'full' },
    });
    const store = renderDialogs(engine);
    openCreate(store);
    await userEvent.type(screen.getByLabelText('Title'), 'Standup');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().toasts).toHaveLength(1));
    expect(store.getState().dialog).not.toBeNull();
  });
});
