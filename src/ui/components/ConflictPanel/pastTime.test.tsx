// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev, settings } from '../../../../tests/helpers/builders';
import { capture, makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import { App } from '../../App';
import { ConflictPanel } from './ConflictPanel';

const EVENTS = [
  ev('Past A', 'Mon 09:00', 'Mon 10:00'),
  ev('Past B', 'Mon 09:30', 'Mon 10:00'),
  ev('Current A', 'Mon 10:00', 'Mon 11:00'),
  ev('Current B', 'Mon 10:30', 'Mon 11:30'),
];

describe('T52: past-time panels and calendar (D-08)', () => {
  it('counts upcoming conflicts, starts Past collapsed, and offers no past Suggest action', async () => {
    const { engine, repo } = await makeEngine({ now: 'Mon 10:30', events: EVENTS });
    const before = await capture(engine, repo);
    renderWithStore(<ConflictPanel />, storeFor(engine, { now: () => t('Mon 10:30') }));
    expect(screen.getByRole('heading', { name: 'Conflicts (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upcoming (1)' })).toBeInTheDocument();
    const past = screen.getByRole('button', { name: 'Past (1)' });
    expect(past).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('⚠ Past A ↔ Past B')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Suggest alternatives for Current A ↔ Current B' }),
    ).toBeInTheDocument();
    await userEvent.click(past);
    expect(past).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Past conflict list' });
    expect(within(list).getByRole('listitem')).toHaveTextContent('Past A ↔ Past B');
    expect(list).toHaveTextContent('Mon 2 Nov 09:30–10:00 (30 min)');
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('treats overlap end = now as past and retains an ongoing conflict as upcoming', async () => {
    const { engine } = await makeEngine({ now: 'Mon 10:00', events: EVENTS });
    renderWithStore(<ConflictPanel />, storeFor(engine, { now: () => t('Mon 10:00') }));
    expect(screen.getByRole('heading', { name: 'Upcoming (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Past (1)' })).toBeInTheDocument();
  });

  it('status counts upcoming independently of calendar filters and reports the past count', async () => {
    const { engine } = await makeEngine({ now: 'Mon 10:30', events: EVENTS });
    const store = storeFor(engine, { now: () => t('Mon 10:30') });
    renderWithStore(<App />, store);
    expect(screen.getByText('4 events · 0 tasks · 1 conflict (1 past)')).toBeInTheDocument();
    act(() => store.setState({ eventPriorityFilter: [] }));
    expect(
      screen.getByText('0 events (4 hidden by filter) · 0 tasks · 1 conflict (1 past)'),
    ).toBeInTheDocument();
  });

  it('suppresses past barred rows, tags and settings feedback while retaining ongoing warnings', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 13:30',
      events: [ev('Ended', 'Mon 13:00', 'Mon 13:30'), ev('Running', 'Mon 13:30', 'Mon 14:00')],
    });
    const store = storeFor(engine, { now: () => t('Mon 13:30') });
    renderWithStore(<App />, store);
    await act(async () => {
      await store.getState().actions.updateSettings(
        settings({
          barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
        }),
      );
    });
    expect(screen.getByRole('heading', { name: 'Barred-slot overlaps (1)' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Suggest alternatives for Ended in Lunch' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Suggest alternatives for Running in Lunch' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ended, Mon 2 Nov/ })).not.toHaveAccessibleName(
      /In Lunch/,
    );
    expect(screen.getByRole('button', { name: /^Running, Mon 2 Nov/ })).toHaveAccessibleName(
      /In Lunch/,
    );
    expect(
      store
        .getState()
        .toasts.filter((toast) => toast.tone === 'info')
        .map((toast) => toast.text),
    ).toEqual(['1 event overlaps barred slots']);
    expect(engine.snapshot().barredOverlaps).toHaveLength(2);
  });

  it('marks ended calendar events as past while keeping running events active', async () => {
    const { engine } = await makeEngine({ now: 'Mon 10:30', events: EVENTS });
    renderWithStore(<App />, storeFor(engine, { now: () => t('Mon 10:30') }));
    expect(screen.getByRole('button', { name: /^Past A, Mon 2 Nov/ })).toHaveClass('is-past');
    expect(screen.getByRole('button', { name: /^Current A, Mon 2 Nov/ })).not.toHaveClass(
      'is-past',
    );
  });
});
