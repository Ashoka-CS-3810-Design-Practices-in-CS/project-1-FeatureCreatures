// @vitest-environment jsdom
import type FullCalendar from '@fullcalendar/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RefObject } from 'react';
import { ev } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import type { AppStore } from '../../store/appStore';
import { Toolbar } from './Toolbar';
import { AppBar } from './AppBar';
import { TaskPanel } from '../TaskPanel/TaskPanel';
import { ReplanPanel } from '../ReplanDialog/ReplanPanel';
import { ShortcutHelp } from '../ShortcutHelp/ShortcutHelp';

const fakeApi = { today: vi.fn(), prev: vi.fn(), next: vi.fn(), changeView: vi.fn() };
// The toolbar only calls getApi() on the ref, so a stand-in calendar is enough here.
const calendarRef = { current: { getApi: () => fakeApi } } as unknown as RefObject<FullCalendar>;

// PRE:  store comes from storeFor; onCycleTheme is the theme toggle's callback
// POST: renders the toolbar over store with the System theme
function renderToolbar(store: AppStore, onCycleTheme = vi.fn()): void {
  renderWithStore(
    <>
      <Toolbar calendarRef={calendarRef} />
      <AppBar theme="system" onCycleTheme={onCycleTheme} narrow={false} />
      <TaskPanel />
      <ReplanPanel />
    </>,
    store,
  );
}

describe('Toolbar', () => {
  afterEach(() => vi.clearAllMocks());

  it('WI-33: the ? button opens the existing labelled keyboard shortcut help', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(
      <>
        <Toolbar calendarRef={calendarRef} />
        <AppBar theme="system" onCycleTheme={() => {}} narrow={false} />
        <ShortcutHelp />
      </>,
      store,
    );
    const button = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(button).toHaveTextContent('?');
    await userEvent.click(button);
    const help = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(help).toBeInTheDocument();
    expect(help).toHaveTextContent('New event');
    expect(store.getState().dialog).toEqual({ kind: 'shortcuts' });
  });

  it('names the shown period and marks the active view', async () => {
    const store = storeFor((await makeEngine()).engine);
    store.getState().actions.setView('timeGridWeek', t('Mon 00:00'));
    renderToolbar(store);

    expect(screen.getByRole('heading', { name: 'Week of 2 Nov 2026' })).toBeInTheDocument();
    const views = screen.getByRole('group', { name: 'View' });
    expect(within(views).getByRole('button', { name: 'Week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(views).getByRole('button', { name: 'Day' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('moves and switches the calendar', async () => {
    renderToolbar(storeFor((await makeEngine()).engine));

    await userEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next period' }));
    await userEvent.click(screen.getByRole('button', { name: 'Month' }));

    expect(fakeApi.prev).toHaveBeenCalledTimes(1);
    expect(fakeApi.today).toHaveBeenCalledTimes(1);
    expect(fakeApi.next).toHaveBeenCalledTimes(1);
    expect(fakeApi.changeView).toHaveBeenCalledWith('dayGridMonth');
  });

  it('toggles the priority filter chips (FR6)', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderToolbar(store);
    const chips = screen.getByRole('group', { name: 'Priority filter' });

    await userEvent.click(within(chips).getByRole('button', { name: 'M' }));

    expect(store.getState().eventPriorityFilter).toEqual(['high', 'low']);
    expect(within(chips).getByRole('button', { name: 'M' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('opens the event, task, replan and settings dialogs', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderToolbar(store);
    const opened: unknown[] = [];

    // INVARIANT: opened holds the dialog each visited button opened, in order
    for (const name of ['+ Event', '+ Task', 'Plan…', 'Settings']) {
      await userEvent.click(screen.getByRole('button', { name }));
      opened.push(store.getState().dialog);
    }
    // POST: opened holds the four dialogs

    expect(opened).toEqual([
      { kind: 'event', mode: 'create', defaults: {} },
      { kind: 'task', mode: 'create' },
      { kind: 'replan', strategy: 'balanced' },
      { kind: 'settings' },
    ]);
  });

  it('enables Undo / Redo per the snapshot, with the change label as tooltip', async () => {
    const store = storeFor(
      (await makeEngine({ events: [ev('Gym', 'Mon 18:00', 'Mon 19:00')] })).engine,
    );
    renderToolbar(store);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await store.getState().actions.deleteEvent('Gym');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'title',
      'Undo: Delete "Gym"',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveAttribute(
      'title',
      'Redo: Delete "Gym"',
    );
    expect(store.getState().snapshot.events).toHaveLength(1);
  });

  it('shows the theme choice and cycles it', async () => {
    const onCycleTheme = vi.fn();
    renderToolbar(storeFor((await makeEngine()).engine), onCycleTheme);

    await userEvent.click(screen.getByRole('button', { name: 'Theme: System' }));

    expect(onCycleTheme).toHaveBeenCalledTimes(1);
  });
});
