// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Engine } from '@/engine';
import { ev, flexEv, settings } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { ReplanDialog } from './ReplanDialog';
import { t } from '../../../../tests/helpers/time';

const WINDOW: [string, string] = ['Mon 09:00', 'Wed 18:00'];

// PRE: engine is initialised
// POST: renders only the Replan dialog over a ready store and opens a fresh form
function renderOpen(engine: Engine) {
  const store = storeFor(engine);
  renderWithStore(<ReplanDialog />, store);
  act(() => store.getState().actions.openDialog({ kind: 'replan' }));
  return store;
}

describe('T55: compact Replan dialog (D-15)', () => {
  it('offers all five strategies, keeps Buffer behind Details and starts fresh on reopen', async () => {
    const store = renderOpen((await makeEngine()).engine);
    const strategy = screen.getByLabelText('Strategy');
    expect(strategy).toHaveValue('balanced');
    expect(
      within(strategy)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Balanced week',
      'Cluster by category',
      'Vary categories',
      'Front-load',
      'Fewer fragments',
    ]);
    expect(screen.queryByLabelText('Buffer (min)')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByLabelText('Buffer (min)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buffer (min)'), { target: { value: '15' } });
    await userEvent.selectOptions(strategy, 'frontLoad');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    act(() => store.getState().actions.openDialog({ kind: 'replan' }));
    expect(screen.getByLabelText('Strategy')).toHaveValue('balanced');
    expect(screen.queryByLabelText('Buffer (min)')).not.toBeInTheDocument();
  });

  it('shows compact strategy cards/day groups/tags, hides full explanations until Details and applies the selected strategy', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('Move', 'Tue 14:00', 'Tue 15:00', WINDOW)],
    });
    const store = renderOpen(engine);
    await userEvent.selectOptions(screen.getByLabelText('Strategy'), 'frontLoad');
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    const minimal = screen.getByRole('region', { name: 'Minimal change' });
    const second = screen.getByRole('region', { name: 'Front-load' });
    expect(minimal).toHaveTextContent('0 moves · conflicts 0 → 0');
    expect(second).toHaveTextContent('1 move · conflicts 0 → 0');
    expect(within(second).getByText('Mon 2 Nov')).toBeInTheDocument();
    expect(within(second).getByText('Move', { selector: 'strong' })).toBeInTheDocument();
    expect(within(second).getByText('[M]')).toBeInTheDocument();
    expect(within(second).getByText('Meeting')).toBeInTheDocument();
    expect(second).toHaveTextContent('Tue 3 Nov 14:00 → Mon 2 Nov 09:00');
    expect(screen.queryByText(/Total shift:/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(second).toHaveTextContent('Total shift: 29 h');
    expect(second).toHaveTextContent('Unplaced: 0');
    await userEvent.click(within(second).getByRole('button', { name: 'Apply Front-load' }));
    expect(store.getState().dialog).toBeNull();
    expect(engine.snapshot().events[0]?.start).toBe(t('Mon 09:00'));
  });

  it('drops computed plans when strategy or hidden buffer changes', async () => {
    renderOpen(
      (await makeEngine({ events: [flexEv('Move', 'Tue 14:00', 'Tue 15:00', WINDOW)] })).engine,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    expect(screen.getByRole('region', { name: 'Balanced week' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Strategy'), 'clusterByCategory');
    expect(screen.queryByRole('region', { name: 'Balanced week' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    expect(screen.getByRole('region', { name: 'Cluster by category' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.change(screen.getByLabelText('Buffer (min)'), { target: { value: '10' } });
    expect(screen.queryByRole('region', { name: 'Cluster by category' })).not.toBeInTheDocument();
  });

  it('shows one collapsed deduplicated Not moved list below the cards and reuses alternatives', async () => {
    const store = renderOpen(
      (
        await makeEngine({
          events: [
            ev('Lunch event', 'Mon 13:00', 'Mon 14:00'),
            flexEv('Move', 'Tue 14:00', 'Tue 15:00', WINDOW),
          ],
          settings: settings({
            barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
          }),
        })
      ).engine,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Compute plans' }));
    const toggle = screen.getByRole('button', { name: 'Not moved by Replan (1)' });
    expect(screen.queryByRole('list', { name: 'Replan not moved' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    const list = screen.getByRole('list', { name: 'Replan not moved' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('Lunch event');
    expect(list).toHaveTextContent('Fixed event');
    expect(
      screen.getAllByRole('button', { name: 'Suggest alternatives for Lunch event' }),
    ).toHaveLength(1);
    await userEvent.click(
      within(list).getByRole('button', { name: 'Suggest alternatives for Lunch event' }),
    );
    expect(store.getState().picker).toMatchObject({ mode: 'alternatives', eventId: 'Lunch event' });
  });
});
