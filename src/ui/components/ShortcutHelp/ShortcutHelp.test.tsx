// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { ShortcutHelp } from './ShortcutHelp';

describe('ShortcutHelp', () => {
  it('T32 (d): lists every key of PROJECT_SCHEMA §7.6, and Close closes it', async () => {
    const store = storeFor((await makeEngine()).engine);
    renderWithStore(<ShortcutHelp />, store);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => store.getState().actions.openDialog({ kind: 'shortcuts' }));

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'KeyAction',
      'NNew event',
      'Shift+NNew task',
      'TGo to today',
      '← / →Previous / next period',
      'D / W / M / LDay / Week / Month / List view',
      'ROpen Replan',
      'Ctrl/Cmd+ZUndo',
      'Ctrl/Cmd+Shift+Z, Ctrl+YRedo',
      '?Shortcut help',
      'EscClose the top dialog',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store.getState().dialog).toBeNull();
  });
});
