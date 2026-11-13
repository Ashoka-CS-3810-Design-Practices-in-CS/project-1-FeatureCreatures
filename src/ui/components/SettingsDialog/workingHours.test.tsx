// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flexEv, settings, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { SettingsDialog } from './SettingsDialog';
import { TaskDialog } from '../TaskDialog/TaskDialog';
import { SlotPicker } from '../SlotPicker/SlotPicker';

describe('T53: working-time controls (D-10)', () => {
  it('disables working days/hours while off, saves them unchanged, and restores them when switched on', async () => {
    const { engine } = await makeEngine({
      settings: settings({ workStartMin: 600, workEndMin: 1020, workDays: [1, 2, 3, 4] }),
    });
    const store = storeFor(engine);
    renderWithStore(<SettingsDialog />, store);
    act(() => store.getState().actions.openDialog({ kind: 'settings' }));
    const toggle = screen.getByRole('switch', { name: 'Use working hours' });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(screen.getByLabelText('Working hours from')).toBeDisabled();
    expect(screen.getByLabelText('Working hours to')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Mon' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(engine.snapshot().settings).toMatchObject({
      useWorkingHours: false,
      workStartMin: 600,
      workEndMin: 1020,
      workDays: [1, 2, 3, 4],
    });
    act(() => store.getState().actions.openDialog({ kind: 'settings' }));
    expect(screen.getByRole('switch', { name: 'Use working hours' })).not.toBeChecked();
    expect(screen.getByLabelText('Working hours from')).toHaveValue('10:00');
    expect(screen.getByRole('checkbox', { name: 'Fri' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('switch', { name: 'Use working hours' }));
    expect(screen.getByLabelText('Working hours from')).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Mon' })).toBeEnabled();
    expect(screen.getByLabelText('Working hours to')).toHaveValue('17:00');
  });

  it('hides task Scheduling hours while off, preserves its preference, and describes the effective search as any time', async () => {
    const { engine } = await makeEngine({
      settings: settings({ useWorkingHours: false }),
      tasks: [task('Weekend', 60, ['Sat 00:00', 'Sun 00:00'])],
    });
    const store = storeFor(engine);
    renderWithStore(
      <>
        <TaskDialog />
        <SlotPicker />
      </>,
      store,
    );
    act(() => store.getState().actions.openDialog({ kind: 'task', mode: 'edit', id: 'Weekend' }));
    expect(screen.queryByRole('group', { name: 'Scheduling hours' })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Name', { exact: true }));
    await userEvent.type(screen.getByLabelText('Name', { exact: true }), 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().dialog).toBeNull());
    expect(engine.snapshot().tasks[0]?.useWorkingHours).toBe(true);
    act(() => store.getState().actions.openTaskPicker(['Weekend']));
    const picker = screen.getByRole('dialog', { name: /^Find time/ });
    expect(within(picker).getByRole('region', { name: 'Top picks' })).toBeInTheDocument();
    await userEvent.click(within(picker).getByRole('button', { name: 'Details' }));
    expect(within(picker).getByText(/Window:.*any time$/)).toBeInTheDocument();
    expect(within(picker).queryByText(/working hours only/)).not.toBeInTheDocument();
  });

  it('hides alternatives Search hours while off and restores the control when global hours are on', async () => {
    const { engine } = await makeEngine({
      settings: settings({ useWorkingHours: false }),
      events: [flexEv('Night', 'Mon 21:00', 'Mon 22:00', ['Mon 00:00', 'Tue 00:00'])],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openEventAlternatives('Night'));
    expect(screen.queryByRole('group', { name: 'Search hours' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Top picks' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      await store.getState().actions.updateSettings(settings());
    });
    act(() => store.getState().actions.openEventAlternatives('Night'));
    expect(screen.getByRole('group', { name: 'Search hours' })).toBeInTheDocument();
  });
});
