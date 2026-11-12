import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';

// The key table of PROJECT_SCHEMA §7.6, in its order.
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'N', action: 'New event' },
  { keys: 'Shift+N', action: 'New task' },
  { keys: 'T', action: 'Go to today' },
  { keys: '← / →', action: 'Previous / next period' },
  { keys: 'D / W / M / L', action: 'Day / Week / Month / List view' },
  { keys: 'R', action: 'Open Replan' },
  { keys: 'Ctrl/Cmd+Z', action: 'Undo' },
  { keys: 'Ctrl/Cmd+Shift+Z, Ctrl+Y', action: 'Redo' },
  { keys: '?', action: 'Shortcut help' },
  { keys: 'Esc', action: 'Close the top dialog' },
];

// PRE:  rendered under StoreProvider; reads dialog (kind 'shortcuts'); uses actions.closeDialog
//       + additional props from: Modal
// POST: while the shortcut help is open, lists every shortcut with its action (B4); the shared
//       Modal's × (Close) or Esc closes it (WI-45 replaced the duplicate Close button)
export function ShortcutHelp() {
  const isOpen = useAppStore((state) => state.dialog?.kind === 'shortcuts');
  const closeDialog = useAppStore((state) => state.actions.closeDialog);
  if (!isOpen) {
    return null;
  }

  return (
    <Modal open title="Keyboard shortcuts" onClose={closeDialog}>
      <table>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((shortcut) => (
            <tr key={shortcut.keys}>
              <td>
                <kbd>{shortcut.keys}</kbd>
              </td>
              <td>{shortcut.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Shortcuts are off while you type in a field or while a dialog is open (except Esc).</p>
    </Modal>
  );
}
