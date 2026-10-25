import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';

// PRE:  rendered under StoreProvider; reads dialog (kind 'confirm'); uses actions.closeDialog
//       + additional props from: Modal
// POST: while a confirm dialog is open, shows its title, body and the confirm / Cancel buttons;
//       confirming closes it and runs onConfirm, Cancel or Esc just close it
export function ConfirmDialog() {
  const dialog = useAppStore((state) => state.dialog);
  const closeDialog = useAppStore((state) => state.actions.closeDialog);
  if (dialog?.kind !== 'confirm') {
    return null;
  }

  return (
    <Modal open title={dialog.title} onClose={closeDialog}>
      <p>{dialog.body}</p>
      <button
        type="button"
        onClick={() => {
          closeDialog();
          dialog.onConfirm();
        }}
      >
        {dialog.confirmLabel}
      </button>
      <button type="button" onClick={closeDialog}>
        Cancel
      </button>
    </Modal>
  );
}
