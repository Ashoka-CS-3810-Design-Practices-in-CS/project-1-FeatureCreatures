// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Engine } from '@/engine';
import { ev, flexEv, iv, settings } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { t } from '../../../../tests/helpers/time';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import type { AppStore, ViewType } from '../../store/appStore';
import { ReplanDialog } from './ReplanDialog';

const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];
const t22Events = [
  ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' }),
  flexEv('Study', 'Mon 11:00', 'Mon 12:00', WINDOW, { priority: 'low' }),
  flexEv('Gym', 'Tue 15:00', 'Tue 16:00', WINDOW, { priority: 'medium' }),
];

// PRE:  engine is initialised
// POST: renders the replan dialog, opened, over a store for engine (visible range Mon–Sun)
function renderOpen(engine: Engine, withRange = true): AppStore {
  const store = storeFor(engine);
  if (withRange) {
    store.getState().actions.setActiveRange(iv('Mon 00:00', '2026-11-09 00:00'));
  }
  renderWithStore(<ReplanDialog />, store);
  act(() => store.getState().actions.openDialog({ kind: 'replan' }));
  return store;
}

describe('ReplanDialog', () => {
  it('defaults to the visible week', async () => {
    renderOpen((await makeEngine()).engine);

    expect(screen.getByLabelText('From')).toHaveValue('2026-11-02');
    expect(screen.getByLabelText('To')).toHaveValue('2026-11-08');
  });

  it('defaults to the week of the calendar date when no range is known yet', async () => {
    renderOpen((await makeEngine()).engine, false);

    expect(screen.getByLabelText('From')).toHaveValue('2026-11-02');
    expect(screen.getByLabelText('To')).toHaveValue('2026-11-08');
  });

  // AUDIT A10: Month's visible grid (35–42 days) was copied into the defaults and then rejected,
  // because a replan range is at most 14 days.
  it.each([
    ['timeGridDay', 'Tue 00:00', ['Tue 00:00', 'Wed 00:00'], '2026-11-03', '2026-11-03'],
    ['timeGridWeek', 'Mon 00:00', ['Mon 00:00', '2026-11-09 00:00'], '2026-11-02', '2026-11-08'],
    ['listWeek', 'Mon 00:00', ['Mon 00:00', '2026-11-09 00:00'], '2026-11-02', '2026-11-08'],
    // November 2026 starts on a Sunday; its first full week is 2–8 November.
    [
      'dayGridMonth',
      '2026-11-01 00:00',
      ['2026-10-26 00:00', '2026-12-07 00:00'],
      '2026-11-02',
      '2026-11-08',
    ],
  ] as const)('%s defaults to a valid range', async (type, date, range, from, to) => {
    const store = storeFor((await makeEngine({ events: t22Events })).engine);
    store.getState().actions.setView(type as ViewType, t(date));
    store.getState().actions.setActiveRange(iv(range[0], range[1]));
    renderWithStore(<ReplanDialog />, store);
    act(() => store.getState().actions.openDialog({ kind: 'replan' }));

    expect(screen.getByLabelText('From')).toHaveValue(from);
    expect(screen.getByLabelText('To')).toHaveValue(to);
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the two plan cards with their metrics and moves (T22 data)', async () => {
    renderOpen((await makeEngine({ events: t22Events })).engine);

    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));

    const minimal = screen.getByRole('region', { name: 'Minimal change' });
    const balanced = screen.getByRole('region', { name: 'Balanced week' });
    expect(minimal).toHaveTextContent('Moved: 1');
    expect(minimal).toHaveTextContent('Total shift: 1 h');
    expect(minimal).toHaveTextContent('Conflicts: 1 → 0');
    expect(minimal).toHaveTextContent('Day-load spread: 3 h → 3 h');
    expect(
      within(minimal).getByText(
        '"Study" Mon 2 Nov 11:00–12:00 → Mon 2 Nov 12:00–13:00 — conflicts with "Lecture"',
      ),
    ).toBeInTheDocument();
    expect(balanced).toHaveTextContent('Total shift: 46 h');
    expect(balanced).toHaveTextContent('Day-load spread: 3 h → 2 h');
  });

  it('Apply calls applyReplan, closes the dialog and reports the moves', async () => {
    const { engine } = await makeEngine({ events: t22Events });
    const applyReplan = vi.spyOn(engine, 'applyReplan');
    const store = renderOpen(engine);
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));

    await userEvent.click(screen.getByRole('button', { name: 'Apply Balanced week' }));

    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(applyReplan).toHaveBeenCalledWith({ baseVersion: 0, planId: 'balanced' });
    expect(store.getState().toasts.at(-1)?.text).toBe('Plan applied: 1 event moved');
  });

  // AUDIT A08: the old cards stayed applicable after the inputs changed, so Apply used a plan
  // computed for other parameters than those shown.
  it.each([
    ['Buffer (min)', '30'],
    ['From', '2026-11-03'],
    ['To', '2026-11-06'],
  ])('editing %s hides the computed plans until Compute runs again', async (label, value) => {
    renderOpen((await makeEngine({ events: t22Events })).engine);
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    expect(screen.getByRole('button', { name: 'Apply Balanced week' })).toBeInTheDocument();

    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    await userEvent.type(field, value);

    expect(screen.queryByRole('region', { name: 'Balanced week' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apply / })).not.toBeInTheDocument();
  });

  it('says "No flexible events in this range" when nothing can move', async () => {
    renderOpen((await makeEngine({ events: [ev('Lecture', 'Mon 10:00', 'Mon 12:00')] })).engine);

    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));

    expect(screen.getByText('No flexible events in this range')).toBeInTheDocument();
  });

  it('explains unresolved conflicts instead of saying No changes needed and reuses alternatives', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('S', 'Mon 10:00', 'Mon 10:30'),
        flexEv('X', 'Mon 10:00', 'Mon 11:00', ['Mon 10:00', 'Mon 11:00'], { priority: 'high' }),
        flexEv('Read', 'Wed 14:00', 'Wed 15:00', WINDOW),
      ],
    });
    const store = renderOpen(engine);

    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));

    const minimal = screen.getByRole('region', { name: 'Minimal change' });
    expect(minimal).toHaveTextContent('"X" — No free slot');
    expect(minimal).toHaveTextContent('Conflicts with "S".');
    expect(minimal).toHaveTextContent('No moves in this plan — 2 events still need attention.');
    expect(
      within(minimal).getByRole('heading', { name: 'Not moved by Replan' }),
    ).toBeInTheDocument();
    expect(minimal).toHaveTextContent('Fixed event');
    expect(minimal).toHaveTextContent('No free slot');
    expect(screen.queryByText('No changes needed')).not.toBeInTheDocument();
    expect(
      within(minimal).queryByRole('button', { name: 'Apply Minimal change' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(minimal).getByRole('button', { name: 'Suggest alternatives for S' }),
    );
    expect(store.getState().picker).toMatchObject({
      mode: 'alternatives',
      eventId: 'S',
      otherEventId: null,
    });
    expect(store.getState().dialog).toBeNull();
  });

  it('shows fixed and started barred overlaps even with zero movable events', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 13:15',
      settings: settings({
        barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
      }),
      events: [
        ev('Class', 'Mon 13:00', 'Mon 14:00'),
        flexEv('Study', 'Mon 13:00', 'Mon 14:00', WINDOW),
      ],
    });
    renderOpen(engine);
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    const minimal = screen.getByRole('region', { name: 'Minimal change' });
    expect(minimal).toHaveTextContent('Fixed event');
    expect(minimal).toHaveTextContent('Already started');
    expect(minimal).toHaveTextContent('Overlaps Lunch');
    expect(minimal).toHaveTextContent('No moves in this plan — 2 events still need attention.');
    expect(screen.queryByText('No changes needed')).not.toBeInTheDocument();
    expect(
      within(minimal).getAllByRole('button', { name: /^Suggest alternatives for/ }),
    ).toHaveLength(2);
  });

  it('retains No changes needed for a healthy plan without unresolved items', async () => {
    renderOpen(
      (await makeEngine({ events: [flexEv('Read', 'Wed 14:00', 'Wed 15:00', WINDOW)] })).engine,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    const minimal = screen.getByRole('region', { name: 'Minimal change' });
    expect(within(minimal).getByText('No changes needed')).toBeInTheDocument();
    expect(
      within(minimal).queryByRole('heading', { name: 'Not moved by Replan' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['Outside its flex window', ['2026-11-09 09:00', '2026-11-09 10:00']],
    ['No free slot', ['Wed 13:00', 'Wed 14:00']],
  ] as const)('shows %s with a singular remaining-event message', async (reason, window) => {
    const { engine } = await makeEngine({
      settings: settings({
        barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [3] }],
      }),
      events: [flexEv('Study', 'Wed 13:00', 'Wed 14:00', [...window])],
    });
    renderOpen(engine);
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    const minimal = screen.getByRole('region', { name: 'Minimal change' });
    expect(minimal).toHaveTextContent(reason);
    expect(minimal).toHaveTextContent('No moves in this plan — 1 event still needs attention.');
    expect(
      within(minimal).getByRole('button', { name: 'Suggest alternatives for Study' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No changes needed')).not.toBeInTheDocument();
  });

  it('reports a bad range, and uses a buffer override', async () => {
    const { engine } = await makeEngine({ events: t22Events });
    const planReplan = vi.spyOn(engine, 'planReplan');
    renderOpen(engine);

    await userEvent.clear(screen.getByLabelText('From'));
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The replan range must be 1 to 14 days long.',
    );

    await userEvent.type(screen.getByLabelText('From'), '2026-11-02');
    await userEvent.type(screen.getByLabelText('Buffer (min)'), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    expect(planReplan).toHaveBeenLastCalledWith(expect.objectContaining({ bufferMin: 15 }));
  });

  it('recomputes when the calendar changed before applying (ER7)', async () => {
    const { engine } = await makeEngine({ events: t22Events });
    const store = renderOpen(engine);
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    await engine.deleteEvent('Gym');

    await userEvent.click(screen.getByRole('button', { name: 'Apply Minimal change' }));

    expect(store.getState().dialog).toEqual({ kind: 'replan' });
    expect(store.getState().toasts.at(-1)?.tone).toBe('info');
  });
});
