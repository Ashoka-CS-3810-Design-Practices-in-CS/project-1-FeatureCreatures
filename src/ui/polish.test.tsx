// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, task } from '../../tests/helpers/builders';
import { makeEngine } from '../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../tests/helpers/render';
import { t } from '../../tests/helpers/time';
import { App } from './App';

// PRE: controls are mounted in one document; their sequence names the expected order
// POST: asserts every consecutive pair follows that source/keyboard order
function expectControlOrder(controls: HTMLElement[]): void {
  let previous: HTMLElement | undefined;
  // INVARIANT: previous is the last visited control; all visited pairs follow the expected order
  for (const control of controls) {
    if (previous !== undefined) {
      expect(previous.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
        0,
      );
    }
    previous = control;
  }
  // POST: all consecutive controls follow the required source/keyboard order
}

describe('T58: dialog and format polish (D-16)', () => {
  it('orders event fields Title, Priority, Category, times, Scheduling and Description', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);
    act(() => store.getState().actions.openDialog({ kind: 'event', mode: 'create', defaults: {} }));
    const dialog = within(screen.getByRole('dialog', { name: 'New event' }));
    expectControlOrder([
      dialog.getByLabelText('Title'),
      dialog.getByRole('group', { name: 'Priority' }),
      dialog.getByLabelText('Category'),
      dialog.getByLabelText('Start'),
      dialog.getByLabelText('End'),
      dialog.getByRole('group', { name: 'Scheduling' }),
      dialog.getByLabelText('Description'),
    ]);
  });

  it('retains task order Name, Duration, Priority, Category, window, hours and Description', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'create' }));
    const dialog = within(screen.getByRole('dialog', { name: 'New task' }));
    expectControlOrder([
      dialog.getByLabelText('Name'),
      dialog.getByRole('group', { name: 'Duration' }),
      dialog.getByRole('group', { name: 'Priority' }),
      dialog.getByLabelText('Category'),
      dialog.getByLabelText('Window from'),
      dialog.getByLabelText('Window to'),
      dialog.getByRole('group', { name: 'Scheduling hours' }),
      dialog.getByLabelText('Description'),
    ]);
  });

  it('uses one compact weekday/date/year List heading and 24-hour event time', async () => {
    const store = storeFor(
      (await makeEngine({ events: [ev('Study', 'Mon 15:00', 'Mon 16:00')] })).engine,
    );
    store.getState().actions.setView('listWeek', t('Mon 00:00'));
    renderWithStore(<App />, store);
    expect(await screen.findByText('Mon 2 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByText('November 2, 2026')).not.toBeInTheDocument();
    expect(screen.getByText('15:00–16:00')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Study, Mon 2 Nov 15:00–16:00/ }),
    ).toBeInTheDocument();
  });

  it('offers a styled Import JSON button while preserving the named file input', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<App />, store);
    act(() => store.getState().actions.openDialog({ kind: 'settings' }));
    expect(screen.getByRole('button', { name: 'Import JSON' })).toBeInTheDocument();
    expect(screen.getByLabelText('Import JSON')).toHaveAttribute('type', 'file');
  });

  it.each([1, 2])(
    'Stop on a %i-task queue preserves data and only a multi-task queue gets a summary',
    async (count) => {
      const tasks = [
        task('A', 60, ['Mon 09:00', 'Mon 18:00']),
        task('B', 60, ['Mon 09:00', 'Mon 18:00']),
      ].slice(0, count);
      const engine = (await makeEngine({ tasks })).engine;
      const store = storeFor(engine);
      const before = engine.snapshot();
      renderWithStore(<App />, store);
      act(() => store.getState().actions.openTaskPicker(tasks.map((item) => item.id)));
      await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(store.getState().picker).toBeNull();
      expect(store.getState().toasts.map((toast) => toast.text)).toEqual(
        count === 1 ? [] : ['Scheduled 0 of 2 tasks'],
      );
      expect(engine.snapshot()).toEqual(before);
    },
  );
});
