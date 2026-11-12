// @vitest-environment jsdom
// T43 — dragging or resizing a fixed event asks first (peer report #1, WI-42).
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fromMinute } from '@/shared/time';
import { ev, flexEv, iv } from '../../../../tests/helpers/builders';
import { capture, makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { createCalendarHandlers, type ChangedEventInfo } from './calendarHandlers';

const lecture = ev('Lecture', 'Mon 10:00', 'Mon 11:00', { category: 'class' });
const study = flexEv('Study', 'Mon 13:00', 'Mon 14:00', ['Mon 09:00', 'Mon 18:00']);

// PRE:  id names a seeded event; from and to are valid t() specs
// POST: returns a fake FullCalendar change of that event to [t(from), t(to)) with a spy revert
function change(id: string, from: string, to: string): ChangedEventInfo {
  return {
    event: { id, start: fromMinute(t(from)), end: fromMinute(t(to)) },
    revert: vi.fn(),
  };
}

// PRE:  none
// POST: returns an engine over Lecture (fixed) and Study (flexible), its store with ConfirmDialog
//       rendered, the handlers and the repository
async function setUp() {
  const { engine, repo } = await makeEngine({ events: [lecture, study] });
  const store = storeFor(engine);
  renderWithStore(<ConfirmDialog />, store);
  return { engine, repo, store, handlers: createCalendarHandlers(store.getState().actions) };
}

describe('T43: a fixed event asks before a manual drag or resize', () => {
  it('a drop of a fixed event asks "<title> is fixed. Move it anyway?" and moves nothing yet', async () => {
    const { engine, repo, handlers } = await setUp();
    const before = await capture(engine, repo);
    const info = change('Lecture', 'Mon 15:00', 'Mon 16:00');

    await handlers.onDrop(info);

    const dialog = screen.getByRole('dialog', { name: 'Lecture is fixed. Move it anyway?' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
    expect(info.revert).not.toHaveBeenCalled();
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('Keep it reverts the block and writes nothing, adding no history', async () => {
    const { engine, repo, store, handlers } = await setUp();
    const before = await capture(engine, repo);
    const info = change('Lecture', 'Mon 15:00', 'Mon 16:00');
    await handlers.onDrop(info);

    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(info.revert).toHaveBeenCalledOnce();
    expect(store.getState().dialog).toBeNull();
    expect(await capture(engine, repo)).toEqual(before);
    expect(store.getState().snapshot.canUndo).toBe(false);
  });

  it('Esc also reverts and writes nothing', async () => {
    const { engine, repo, handlers } = await setUp();
    const before = await capture(engine, repo);
    const info = change('Lecture', 'Mon 10:00', 'Mon 11:30');
    await handlers.onResize(info);
    expect(screen.getByRole('dialog', { name: 'Lecture is fixed. Move it anyway?' })).toBeVisible();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(info.revert).toHaveBeenCalledOnce());
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('Move commits through moveEvent, as one undoable step', async () => {
    const { store, handlers } = await setUp();
    const info = change('Lecture', 'Mon 15:00', 'Mon 16:00');
    await handlers.onDrop(info);

    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() =>
      expect(
        store.getState().snapshot.events.find((event) => event.id === 'Lecture'),
      ).toMatchObject(iv('Mon 15:00', 'Mon 16:00')),
    );
    expect(info.revert).not.toHaveBeenCalled();
    expect(store.getState().snapshot.undoLabel).toBe('Move "Lecture"');
  });

  it('a flexible event drags exactly as before: no dialog, moved at once', async () => {
    const { store, handlers } = await setUp();
    const info = change('Study', 'Mon 15:00', 'Mon 16:00');

    await handlers.onDrop(info);

    expect(store.getState().dialog).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store.getState().snapshot.events.find((event) => event.id === 'Study')).toMatchObject(
      iv('Mon 15:00', 'Mon 16:00'),
    );
  });

  it('dialog edits, alternatives, undo and redo never ask', async () => {
    const { store } = await setUp();
    const { actions } = store.getState();

    await actions.updateEvent('Lecture', {
      title: 'Lecture',
      description: '',
      category: 'class',
      priority: 'medium',
      start: t('Tue 10:00'),
      end: t('Tue 11:00'),
      flexible: false,
      flexWindow: null,
    });
    await actions.applyAlternative('Lecture', iv('Tue 12:00', 'Tue 13:00'));
    await actions.undo();
    await actions.redo();

    expect(store.getState().dialog).toBeNull();
    expect(store.getState().snapshot.events.find((event) => event.id === 'Lecture')).toMatchObject(
      iv('Tue 12:00', 'Tue 13:00'),
    );
  });
});
