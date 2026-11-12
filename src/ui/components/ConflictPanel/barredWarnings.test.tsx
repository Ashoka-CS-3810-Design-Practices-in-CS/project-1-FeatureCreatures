// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAMPLES } from '@/data/samples';
import { ev, flexEv, settings } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { BASE_MONDAY } from '../../../../tests/helpers/time';
import { App } from '../../App';
import { SlotPicker } from '../SlotPicker/SlotPicker';
import { ConflictPanel } from './ConflictPanel';

const LUNCH = { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] as const };

describe('T38 barred warning UI', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([false, true])(
    'marks barred rows as Fixed or Flexible (flexible=%s)',
    async (flexible) => {
      const event = flexible
        ? flexEv('Study', 'Mon 13:00', 'Mon 14:00', ['Mon 09:00', 'Mon 18:00'])
        : ev('Class', 'Mon 13:00', 'Mon 14:00');
      const { engine } = await makeEngine({
        events: [event],
        settings: settings({ barredSlots: [LUNCH] }),
      });
      renderWithStore(<ConflictPanel />, storeFor(engine));
      const section = screen.getByRole('region', { name: 'Barred-slot overlaps (1)' });
      expect(
        within(section).getByText(flexible ? 'Flexible' : 'Fixed', { exact: true }),
      ).toBeInTheDocument();
    },
  );

  it('shows a text tag and separate section, reusing alternatives for that event without a toggle', async () => {
    const { engine } = await makeEngine({
      events: [ev('A', 'Mon 12:30', 'Mon 13:30')],
      settings: settings({ barredSlots: [LUNCH] }),
    });
    const suggest = vi.spyOn(engine, 'suggestAlternatives');
    const store = storeFor(engine);
    renderWithStore(<App />, store);
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(await screen.findByText('In Lunch')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Barred-slot overlaps (1)' });
    expect(section).toHaveTextContent('A');
    expect(section).toHaveTextContent('Lunch');
    expect(section).toHaveTextContent('Mon 2 Nov 13:00–13:30 (30 min)');
    expect(screen.getByRole('heading', { name: 'Conflicts (0)' })).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: /Suggest alternatives/ }));
    expect(suggest).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'A' }));
    expect(store.getState().picker).toMatchObject({
      mode: 'alternatives',
      eventId: 'A',
      otherEventId: null,
    });
    expect(screen.queryByRole('group', { name: 'Move' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Allow moving this event' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(
      await screen.findByRole('heading', { name: 'Barred-slot overlaps (0)' }),
    ).toBeInTheDocument();
  });

  it('new settings warnings count events, and View opens the narrow drawer and focuses the section', async () => {
    const media = window.matchMedia('(max-width: 1023px)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true });
    const { engine } = await makeEngine({
      events: [ev('A', 'Mon 13:00', 'Mon 14:00'), ev('B', 'Mon 13:15', 'Mon 13:45')],
    });
    const store = storeFor(engine);
    renderWithStore(<App />, store);
    await act(async () => {
      await store.getState().actions.updateSettings(settings({ barredSlots: [LUNCH] }));
    });
    expect(screen.getByText('2 events overlap barred slots')).toBeInTheDocument();
    expect(
      store.getState().toasts.find((toast) => toast.text === '2 events overlap barred slots')?.tone,
    ).toBe('info');
    await userEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByRole('dialog', { name: 'Tasks and conflicts' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Barred-slot overlaps (2)' })).toHaveFocus(),
    );
    expect(screen.getByRole('heading', { name: 'Conflicts (1)' })).toBeInTheDocument();
  });

  it('the sparseWeek 10-hour task displays the ER2 explanation rather than NoSlotFound', async () => {
    const sample = SAMPLES.sparseWeek.build(BASE_MONDAY);
    const { engine } = await makeEngine({
      events: [...sample.events],
      tasks: [...sample.tasks],
      settings: sample.settings,
    });
    const store = storeFor(engine);
    store.getState().actions.openTaskPicker(['sparse-thesis']);
    renderWithStore(<SlotPicker />, store);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This needs 10 h, but the longest stretch available in its window is 4 h. Shorten the task or widen the window.',
    );
    expect(screen.queryByText(/^No free slot/)).not.toBeInTheDocument();
  });
});
