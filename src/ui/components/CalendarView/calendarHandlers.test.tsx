// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { fromMinute } from '@/shared/time';
import { ev, iv } from '../../../../tests/helpers/builders';
import { capture, makeEngine } from '../../../../tests/helpers/engine';
import { FailingRepository } from '../../../../tests/helpers/failingRepository';
import { storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import { createCalendarHandlers, type ChangedEventInfo } from './calendarHandlers';
import { EventContent } from './EventContent';
import { toFullCalendar, type EventBlockProps } from './toFullCalendar';

const seed = [
  ev('A', 'Mon 10:00', 'Mon 11:30', { priority: 'high' }),
  ev('B', 'Mon 13:00', 'Mon 14:00', { priority: 'medium' }),
];

// PRE:  from and to are valid t() specs
// POST: returns a fake drop of event B to [t(from), t(to)) with a spy revert
function dropB(from: string, to: string): ChangedEventInfo {
  return {
    event: { id: 'B', start: fromMinute(t(from)), end: fromMinute(t(to)) },
    revert: vi.fn(),
  };
}

describe('calendar handlers ↔ engine (T14, ER4, ER5)', () => {
  it('a drop into a conflict saves, flags both events and warns', async () => {
    const { engine } = await makeEngine({ events: seed });
    const store = storeFor(engine);
    const handlers = createCalendarHandlers(store.getState().actions);
    const info = dropB('Mon 11:00', 'Mon 12:00');

    await handlers.onDrop(info);

    expect(info.revert).not.toHaveBeenCalled();
    const { snapshot, toasts } = store.getState();
    expect(
      snapshot.conflicts.map(({ key, overlap, minutes }) => ({ key, overlap, minutes })),
    ).toEqual([{ key: 'A|B', overlap: iv('Mon 11:00', 'Mon 11:30'), minutes: 30 }]);
    expect(toasts.at(-1)?.text).toMatch(/^Saved with a conflict/);

    const entries = toFullCalendar(snapshot, ['high', 'medium', 'low'], null, []);
    render(
      <>
        {entries.map((entry) => (
          <EventContent
            key={entry.id}
            title={entry.title ?? ''}
            timeText=""
            {...(entry.extendedProps as EventBlockProps)}
          />
        ))}
      </>,
    );
    expect(screen.getAllByText('⚠ Conflict 30 min')).toHaveLength(2);
    expect(screen.getByText('[H]')).toBeInTheDocument();
    expect(screen.getByText('[M]')).toBeInTheDocument();
  });

  it('a drop the repository rejects snaps back, says so, and changes nothing', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({ events: seed, repo });
    const store = storeFor(engine);
    const before = await capture(engine, repo);
    const handlers = createCalendarHandlers(store.getState().actions);
    const info = dropB('Mon 11:00', 'Mon 12:00');
    repo.failNextApply();

    await handlers.onResize(info);

    expect(info.revert).toHaveBeenCalledOnce();
    expect(store.getState().toasts.at(-1)?.text).toBe(
      "Couldn't save your change. Nothing was changed.",
    );
    expect(store.getState().snapshot).toEqual(before.snapshot);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('reverts a change FullCalendar reports without both ends', async () => {
    const { engine } = await makeEngine({ events: seed });
    const handlers = createCalendarHandlers(storeFor(engine).getState().actions);
    const info: ChangedEventInfo = { event: { id: 'B', start: null, end: null }, revert: vi.fn() };

    await handlers.onDrop(info);

    expect(info.revert).toHaveBeenCalledOnce();
  });

  it('select opens the create dialog; click opens edit unless it is a background block', async () => {
    const { engine } = await makeEngine({ events: seed });
    const store = storeFor(engine);
    const handlers = createCalendarHandlers(store.getState().actions);
    const unselect = vi.fn();

    handlers.onSelect({
      start: fromMinute(t('Tue 10:00')),
      end: fromMinute(t('Tue 11:00')),
      view: { calendar: { unselect } },
    });
    expect(store.getState().dialog).toEqual({
      kind: 'event',
      mode: 'create',
      defaults: iv('Tue 10:00', 'Tue 11:00'),
    });
    expect(unselect).toHaveBeenCalledOnce();

    store.getState().actions.closeDialog();
    handlers.onClick({ event: { id: 'barred-1', display: 'background' } });
    expect(store.getState().dialog).toBeNull();
    handlers.onClick({ event: { id: 'A', display: 'auto' } });
    expect(store.getState().dialog).toEqual({ kind: 'event', mode: 'edit', id: 'A' });
  });

  it('datesSet records the visible range', async () => {
    const { engine } = await makeEngine();
    const store = storeFor(engine);

    createCalendarHandlers(store.getState().actions).onDatesSet({
      start: fromMinute(t('Mon 00:00')),
      end: fromMinute(t('2026-11-09 00:00')),
      view: { type: 'listWeek', currentStart: fromMinute(t('Mon 00:00')) },
    });

    expect(store.getState().view).toEqual({
      type: 'listWeek',
      date: t('Mon 00:00'),
      activeRange: iv('Mon 00:00', '2026-11-09 00:00'),
    });
  });

  it('EventContent shows a Task tag, and no kind tag for a plain flexible event', () => {
    render(
      <>
        <EventContent
          title="Essay"
          timeText="09:00"
          priority="low"
          category="assignment"
          flexible
          isTask
          conflictMinutes={0}
        />
        <EventContent
          title="Walk"
          timeText="10:00"
          priority="low"
          category="personal"
          flexible
          isTask={false}
          conflictMinutes={0}
        />
      </>,
    );

    expect(screen.getAllByText('Task')).toHaveLength(1);
    expect(screen.queryByText('Fixed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Conflict/)).not.toBeInTheDocument();
  });
});
