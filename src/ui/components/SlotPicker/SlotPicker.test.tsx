// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, flexEv, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import type { AppStore } from '../../store/appStore';
import { SlotPicker } from './SlotPicker';

const slotLabels = () =>
  within(screen.getByRole('group', { name: 'Available slots' }))
    .getAllByRole('radio')
    .map((radio) => (radio.closest('label')?.textContent ?? '').trim());

const texts = (store: AppStore) => store.getState().toasts.map((toast) => toast.text);

describe('SlotPicker — task mode', () => {
  it('shows the T6 summary line and the options as a named radio group', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('E1', 'Mon 09:00', 'Mon 10:00'),
        ev('E2', 'Mon 10:30', 'Mon 12:00'),
        ev('E3', 'Mon 13:00', 'Mon 14:00'),
      ],
      tasks: [task('T', 90, ['Mon 09:00', 'Mon 18:00'], { name: 'Write report' })],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);

    act(() => store.getState().actions.openTaskPicker(['T']));

    expect(
      screen.getByRole('dialog', {
        name: /Find time — "Write report" \(1 h 30 min, Medium\) — Task 1 of 1/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 free gaps in window (30 min, 1 h, 4 h) — 1 fits 1 h 30 min'),
    ).toBeInTheDocument();
    const radios = within(screen.getByRole('group', { name: 'Available slots' })).getAllByRole(
      'radio',
    );
    expect(radios).toHaveLength(1);
    expect(radios[0]).toBeChecked();
    expect(slotLabels()[0]).toContain('1. Mon 2 Nov 14:00–15:30 — Earliest slot that fits.');
    expect(
      screen.getByText('Gap 14:00–18:00 (4 h): after "E3" ends 14:00 → working hours end.'),
    ).toBeInTheDocument();
  });

  it('switching the criterion re-orders the options (T10 data)', async () => {
    const { engine } = await makeEngine({
      events: [ev('X', 'Mon 14:00', 'Mon 15:00')],
      tasks: [task('T', 90, ['Mon 10:00', 'Mon 16:40'])],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['T']));

    expect(slotLabels().map((label) => label.slice(0, 26))).toEqual([
      '1. Mon 2 Nov 10:00–11:30 —',
      '2. Mon 2 Nov 15:00–16:30 —',
    ]);
    await userEvent.click(screen.getByRole('radio', { name: 'Best fit' }));
    expect(slotLabels().map((label) => label.slice(0, 26))).toEqual([
      '1. Mon 2 Nov 15:00–16:30 —',
      '2. Mon 2 Nov 10:00–11:30 —',
    ]);
  });

  it('T17 (UI): the header counts through the queue, and the toast sums it up', async () => {
    const window: [string, string] = ['Mon 09:00', 'Mon 12:00'];
    const { engine } = await makeEngine({
      tasks: [
        task('L1', 60, window, { priority: 'low' }),
        task('H1', 60, window, { priority: 'high' }),
        task('M1', 60, window, { priority: 'medium' }),
      ],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['L1', 'H1', 'M1']));

    expect(screen.getByRole('dialog', { name: /Task 1 of 3/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply selected' }));
    expect(await screen.findByRole('dialog', { name: /"M1".*Task 2 of 3/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply selected' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply selected' }));

    await waitFor(() => expect(store.getState().picker).toBeNull());
    expect(texts(store).at(-1)).toBe('Scheduled 3 of 3 tasks');
    expect(store.getState().snapshot.events.map((event) => [event.title, event.start])).toEqual([
      ['H1', t('Mon 09:00')],
      ['M1', t('Mon 10:00')],
      ['L1', t('Mon 11:00')],
    ]);
  });

  it('T17 (UI, skip variant): skipping M1 puts L1 at 10:00 and the toast counts the skip', async () => {
    const window: [string, string] = ['Mon 09:00', 'Mon 12:00'];
    const { engine } = await makeEngine({
      tasks: [
        task('L1', 60, window, { priority: 'low' }),
        task('H1', 60, window, { priority: 'high' }),
        task('M1', 60, window, { priority: 'medium' }),
      ],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['L1', 'H1', 'M1']));

    await userEvent.click(screen.getByRole('button', { name: 'Apply selected' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply selected' }));

    await waitFor(() => expect(store.getState().picker).toBeNull());
    expect(texts(store).at(-1)).toBe('Scheduled 2 of 3 tasks (1 skipped)');
    expect(store.getState().snapshot.events.find((event) => event.title === 'L1')?.start).toBe(
      t('Mon 10:00'),
    );
  });

  it('shows the ER2 explanation instead of an empty list, with Edit task', async () => {
    const { engine } = await makeEngine({
      tasks: [task('T', 600, ['Mon 09:00', 'Mon 18:00'], { name: 'Write report' })],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['T']));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This needs 10 h, but the longest stretch available in its window is 9 h.',
    );
    expect(screen.getByRole('button', { name: 'Apply selected' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    expect(store.getState()).toMatchObject({
      picker: null,
      dialog: { kind: 'task', mode: 'edit', id: 'T' },
    });
  });

  it('re-searches with a new buffer, and Stop closes with the summary', async () => {
    const { engine } = await makeEngine({
      events: [ev('E', 'Mon 10:00', 'Mon 11:00')],
      tasks: [task('T', 60, ['Mon 09:00', 'Mon 12:00'])],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['T']));

    const buffer = screen.getByLabelText('Buffer (min)');
    await userEvent.clear(buffer);
    await userEvent.type(buffer, '15');
    expect(screen.getByRole('alert')).toHaveTextContent('No free slot of 1 h in this window.');
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(store.getState().picker).toBeNull();
    expect(texts(store).at(-1)).toBe('Scheduled 0 of 1 task');
  });

  it('an apply after the calendar changed refreshes the options (ER7)', async () => {
    const { engine } = await makeEngine({ tasks: [task('T', 60, ['Mon 09:00', 'Mon 12:00'])] });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openTaskPicker(['T']));
    await engine.createEvent({
      title: 'Elsewhere',
      description: '',
      categoryId: 'meeting',
      priority: 'medium',
      start: t('Tue 10:00'),
      end: t('Tue 11:00'),
      flexible: false,
      flexWindow: null,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Apply selected' }));

    expect(store.getState().toasts.at(-1)).toMatchObject({
      tone: 'info',
      text: 'The calendar changed since these options were computed. Refreshing…',
    });
    const picker = store.getState().picker;
    expect(picker?.result.ok && picker.result.value.baseVersion).toBe(engine.snapshot().version);
  });
});

describe('SlotPicker — alternatives mode (T20 data)', () => {
  const lecture = ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' });
  const meeting = flexEv('Meeting', 'Mon 11:00', 'Mon 12:00', ['Mon 09:00', 'Mon 18:00']);

  it('shows the target, states each distance, toggles the target and applies', async () => {
    const { engine } = await makeEngine({ events: [lecture, meeting] });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    const conflict = store.getState().snapshot.conflicts[0];
    if (conflict === undefined) throw new Error('no conflict');

    act(() => store.getState().actions.openAlternatives(conflict));

    expect(
      screen.getByRole('dialog', { name: 'Alternatives for "Meeting" (1 h)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Meeting' })).toBeChecked();
    expect(slotLabels()).toEqual([
      '1. Mon 2 Nov 12:00–13:00 — Closest to the original time (1 h later).',
      '2. Mon 2 Nov 09:00–10:00 — Closest to the original time (2 h earlier).',
    ]);

    await userEvent.click(screen.getByRole('radio', { name: 'Lecture' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Allow moving this event' }));
    expect(
      screen.getByRole('dialog', { name: 'Alternatives for "Lecture" (2 h)' }),
    ).toBeInTheDocument();
    expect(slotLabels()[0]).toBe(
      '1. Mon 2 Nov 09:00–11:00 — Closest to the original time (1 h earlier).',
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Meeting' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(store.getState().picker).toBeNull());
    expect(store.getState().snapshot.conflicts).toEqual([]);
    expect(texts(store).at(-1)).toBe('Moved to Mon 2 Nov 12:00–13:00 — conflict resolved.');
  });

  it('Cancel closes without changes', async () => {
    const { engine } = await makeEngine({ events: [lecture, meeting] });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    const conflict = store.getState().snapshot.conflicts[0];
    if (conflict === undefined) throw new Error('no conflict');
    act(() => store.getState().actions.openAlternatives(conflict));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(store.getState().picker).toBeNull();
    expect(store.getState().snapshot.conflicts).toHaveLength(1);
  });
});
