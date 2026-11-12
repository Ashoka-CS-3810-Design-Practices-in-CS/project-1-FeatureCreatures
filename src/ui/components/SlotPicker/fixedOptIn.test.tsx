// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ev } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { t } from '../../../../tests/helpers/time';
import { SlotPicker } from './SlotPicker';

describe('T50: fixed-event opt-in picker (D-02)', () => {
  it('starts with no suggestions, searches editable dates only after opt-in, and resets on reopening', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 08:00',
      events: [ev('Lecture', 'Mon 10:00', 'Mon 11:00')],
    });
    const store = storeFor(engine);
    renderWithStore(<SlotPicker />, store);
    act(() => store.getState().actions.openEventAlternatives('Lecture'));
    expect(
      screen.getByText('Lecture is fixed, so no suggestions are made for it.'),
    ).toBeInTheDocument();
    const allow = screen.getByRole('checkbox', { name: 'Allow moving this event' });
    expect(allow).not.toBeChecked();
    expect(screen.queryByRole('group', { name: 'Available slots' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await userEvent.click(allow);
    expect(screen.getByLabelText('From')).toHaveValue('2026-11-02');
    expect(screen.getByLabelText('To')).toHaveValue('2026-11-03');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-05' } });
    const picker = store.getState().picker;
    expect(picker?.result).toMatchObject({
      ok: true,
      value: { searchWindow: { start: t('Thu 00:00'), end: t('Fri 00:00') } },
    });
    expect(screen.getByRole('group', { name: 'Available slots' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    act(() => store.getState().actions.openEventAlternatives('Lecture'));
    expect(screen.getByRole('checkbox', { name: 'Allow moving this event' })).not.toBeChecked();
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
  });
});
