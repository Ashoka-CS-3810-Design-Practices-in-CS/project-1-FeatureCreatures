// @vitest-environment jsdom
import type FullCalendar from '@fullcalendar/react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RefObject } from 'react';
import { makeEngine } from '../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../tests/helpers/render';
import { t } from '../../../tests/helpers/time';
import type { AppStore } from '../store/appStore';
import { shortcutFor, useShortcuts, type KeyPress } from './useShortcuts';

// PRE:  key is a KeyboardEvent key; modifiers holds the pressed modifier keys
// POST: returns the key press with every other modifier released
function press(key: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers };
}

const fakeApi = { today: vi.fn(), prev: vi.fn(), next: vi.fn(), changeView: vi.fn() };
// The hook only calls getApi() on the ref, so a stand-in calendar is enough here.
const calendarRef = { current: { getApi: () => fakeApi } } as unknown as RefObject<FullCalendar>;

// PRE:  rendered under StoreProvider
// POST: mounts useShortcuts over the fake calendar, next to a text input to type into
function Harness() {
  useShortcuts(calendarRef);
  return <input aria-label="Notes" type="text" />;
}

// PRE:  none
// POST: renders Harness over a store for a fresh engine and returns the store
async function renderHarness(): Promise<AppStore> {
  const store = storeFor((await makeEngine()).engine);
  renderWithStore(<Harness />, store);
  return store;
}

describe('shortcutFor', () => {
  it.each([
    [press('n'), { kind: 'newEvent' }],
    [press('N', { shiftKey: true }), { kind: 'newTask' }],
    [press('t'), { kind: 'today' }],
    [press('ArrowLeft'), { kind: 'prev' }],
    [press('ArrowRight'), { kind: 'next' }],
    [press('d'), { kind: 'view', view: 'timeGridDay' }],
    [press('w'), { kind: 'view', view: 'timeGridWeek' }],
    [press('m'), { kind: 'view', view: 'dayGridMonth' }],
    [press('l'), { kind: 'view', view: 'listWeek' }],
    [press('r'), { kind: 'replan' }],
    [press('z', { ctrlKey: true }), { kind: 'undo' }],
    [press('z', { metaKey: true }), { kind: 'undo' }],
    [press('Z', { ctrlKey: true, shiftKey: true }), { kind: 'redo' }],
    [press('z', { metaKey: true, shiftKey: true }), { kind: 'redo' }],
    [press('y', { ctrlKey: true }), { kind: 'redo' }],
    [press('?', { shiftKey: true }), { kind: 'help' }],
  ])('maps %j to %j', (keyPress, command) => {
    expect(shortcutFor(keyPress, false, false)).toEqual(command);
  });

  it('ignores other keys, browser shortcuts and Alt combinations', () => {
    expect(shortcutFor(press('x'), false, false)).toBeNull();
    expect(shortcutFor(press('n', { ctrlKey: true }), false, false)).toBeNull();
    expect(shortcutFor(press('r', { metaKey: true }), false, false)).toBeNull();
    expect(shortcutFor(press('n', { altKey: true }), false, false)).toBeNull();
  });

  it('is off in a text field and while a dialog is open, except Esc, which closes the dialog', () => {
    expect(shortcutFor(press('n'), true, false)).toBeNull();
    expect(shortcutFor(press('z', { ctrlKey: true }), true, false)).toBeNull();
    expect(shortcutFor(press('n'), false, true)).toBeNull();
    expect(shortcutFor(press('Escape'), false, true)).toEqual({ kind: 'close' });
    expect(shortcutFor(press('Escape'), true, true)).toEqual({ kind: 'close' });
    expect(shortcutFor(press('Escape'), false, false)).toBeNull();
  });
});

describe('useShortcuts (T32)', () => {
  afterEach(() => vi.clearAllMocks());

  it('(a) N opens the new-event dialog; (b) N while typing in a text input does nothing', async () => {
    const store = await renderHarness();

    await userEvent.type(screen.getByLabelText('Notes'), 'n');
    expect(store.getState().dialog).toBeNull();
    expect(screen.getByLabelText('Notes')).toHaveValue('n');

    screen.getByLabelText('Notes').blur();
    await userEvent.keyboard('n');
    expect(store.getState().dialog).toEqual({ kind: 'event', mode: 'create', defaults: {} });
  });

  it('(c) Ctrl+Z after creating an event removes it and says what was undone', async () => {
    const store = await renderHarness();
    await store.getState().actions.createEvent({
      title: 'Gym',
      description: '',
      category: 'personal',
      priority: 'low',
      start: t('Mon 18:00'),
      end: t('Mon 19:00'),
      flexible: false,
      flexWindow: null,
    });

    await userEvent.keyboard('{Control>}z{/Control}');

    await waitFor(() => expect(store.getState().snapshot.events).toEqual([]));
    expect(store.getState().toasts.at(-1)?.text).toBe('Undid: Create "Gym"');
  });

  it('(d) ? opens the shortcut help; Esc closes the open dialog, and other keys wait meanwhile', async () => {
    const store = await renderHarness();

    await userEvent.keyboard('?');
    expect(store.getState().dialog).toEqual({ kind: 'shortcuts' });
    await userEvent.keyboard('n');
    expect(store.getState().dialog).toEqual({ kind: 'shortcuts' });
    await userEvent.keyboard('{Escape}');
    expect(store.getState().dialog).toBeNull();
  });

  it('Shift+N opens a new task, R opens Replan, and Esc stops an open picker', async () => {
    const store = await renderHarness();

    await userEvent.keyboard('{Shift>}N{/Shift}');
    expect(store.getState().dialog).toEqual({ kind: 'task', mode: 'create' });
    store.getState().actions.closeDialog();
    await userEvent.keyboard('r');
    expect(store.getState().dialog).toEqual({ kind: 'replan' });
    store.getState().actions.closeDialog();

    const pickerStop = vi.spyOn(store.getState().actions, 'pickerStop');
    store.setState({ picker: { mode: 'alternatives' } as never });
    await userEvent.keyboard('{Escape}');
    expect(pickerStop).toHaveBeenCalled();
  });

  it('drives the calendar: T, arrows and D / W / M / L', async () => {
    await renderHarness();

    await userEvent.keyboard('t{ArrowLeft}{ArrowRight}m');

    expect(fakeApi.today).toHaveBeenCalledTimes(1);
    expect(fakeApi.prev).toHaveBeenCalledTimes(1);
    expect(fakeApi.next).toHaveBeenCalledTimes(1);
    expect(fakeApi.changeView).toHaveBeenCalledWith('dayGridMonth');
  });
});
