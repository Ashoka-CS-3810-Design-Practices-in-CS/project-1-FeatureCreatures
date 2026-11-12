// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CalendarEvent } from '@/shared/types';
import { ev, iv } from '../../../../tests/helpers/builders';
import { capture, makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { App } from '../../App';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';

const LECTURE = ev('Lecture', 'Mon 10:00', 'Mon 11:00', { categoryId: 'class' });

// PRE:  events are valid stored events with distinct ids and seeded category references
// POST: renders the app over those events and returns its engine, repository and UI store
async function renderCalendar(events: CalendarEvent[] = []) {
  const fixture = await makeEngine({ events });
  const store = storeFor(fixture.engine);
  renderWithStore(<App />, store);
  return { ...fixture, store };
}

describe('T50: scheduling model and calendar lock (D-01–D-05)', () => {
  it.each([
    { state: 'empty', events: [], locked: false, text: 'Unlocked' },
    { state: 'populated', events: [LECTURE], locked: true, text: 'Locked' },
  ])('starts $state calendars with lock=$locked', async ({ events, locked, text }) => {
    const { engine, repo } = await renderCalendar(events);
    const before = await capture(engine, repo);
    const lock = screen.getByRole('button', { name: 'Calendar lock' });
    expect(lock).toHaveAttribute('aria-pressed', String(locked));
    expect(lock).toHaveTextContent(text);
    await userEvent.click(lock);
    expect(lock).toHaveAttribute('aria-pressed', String(!locked));
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('K toggles the session lock; + Event still opens while locked and typing K does not toggle it', async () => {
    const { engine, repo } = await renderCalendar();
    const before = await capture(engine, repo);
    const lock = screen.getByRole('button', { name: 'Calendar lock' });
    await userEvent.keyboard('k');
    expect(lock).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '+ Event' }));
    expect(screen.getByRole('dialog', { name: 'New event' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), 'Keyboard draft k');
    expect(lock).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('k');
    expect(lock).toHaveAttribute('aria-pressed', 'false');
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('uses one Fixed/Flexible radio pair whose choice survives category changes', async () => {
    await renderCalendar();
    await userEvent.click(screen.getByRole('button', { name: '+ Event' }));
    const fixed = screen.getByRole('radio', { name: 'Fixed — the planner leaves it alone' });
    const flexible = screen.getByRole('radio', {
      name: 'Flexible — the planner may move it within its window',
    });
    expect(fixed).toBeChecked();
    expect(flexible).not.toBeChecked();
    expect(screen.queryByLabelText('Window start')).not.toBeInTheDocument();
    await userEvent.click(flexible);
    expect(screen.getByLabelText('Window start')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'assignment');
    expect(flexible).toBeChecked();
    await userEvent.click(fixed);
    expect(screen.queryByLabelText('Window start')).not.toBeInTheDocument();
  });

  it('keeps List separate from Day/Week/Month and restores the last Calendar view', async () => {
    const { store } = await renderCalendar();
    const views = screen.getByRole('group', { name: 'View' });
    expect(
      within(views)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Day', 'Week', 'Month']);
    const calendar = screen.getByRole('button', { name: 'Calendar' });
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(store.getState().view.type).toBe('listWeek');
    expect(calendar).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(calendar);
    expect(store.getState().view.type).toBe('timeGridWeek');
    await userEvent.click(within(views).getByRole('button', { name: 'Day' }));
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    await userEvent.click(calendar);
    expect(store.getState().view.type).toBe('timeGridDay');
  });

  it.each([
    {
      kind: 'move',
      to: iv('Mon 15:00', 'Mon 16:00'),
      question: '"Lecture" is fixed. Move it to Mon 2 Nov 15:00–16:00?',
      confirm: 'Move',
    },
    {
      kind: 'resize',
      to: iv('Mon 10:00', 'Mon 11:30'),
      question: '"Lecture" is fixed. Change it to 1 h 30 min (10:00–11:30)?',
      confirm: 'Change',
    },
  ])(
    'T43 D-03: the fixed $kind question describes the proposed action',
    async ({ to, question, confirm }) => {
      const { engine, repo } = await makeEngine({ events: [LECTURE] });
      const store = storeFor(engine);
      renderWithStore(<ConfirmDialog />, store);
      const before = await capture(engine, repo);
      const revert = vi.fn();
      await act(async () => {
        await store.getState().actions.dragEvent(LECTURE.id, to, revert);
      });
      const dialog = screen.getByRole('dialog', { name: question });
      expect(within(dialog).getByRole('button', { name: confirm })).toBeInTheDocument();
      expect(await capture(engine, repo)).toEqual(before);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
      expect(revert).toHaveBeenCalledOnce();
      expect(await capture(engine, repo)).toEqual(before);
    },
  );
});
