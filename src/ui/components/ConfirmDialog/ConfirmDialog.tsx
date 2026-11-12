import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';

// PRE:  rendered under StoreProvider; reads dialog (kind 'confirm'); uses actions.closeDialog
//       + additional props from: Modal
// POST: while a confirm dialog is open, shows its title, body and the confirm / cancel buttons
//       (cancelLabel, default Cancel); confirming closes it and runs onConfirm; cancelling, Esc or
//       closing closes it and runs onCancel when there is one
export function ConfirmDialog() {
  const dialog = useAppStore((state) => state.dialog);
  const closeDialog = useAppStore((state) => state.actions.closeDialog);
  if (dialog?.kind !== 'confirm') {
    return null;
  }

  const onCancel = dialog.onCancel;

  // PRE:  this confirm dialog is open
  // POST: closes it, then runs its onCancel (when it has one)
  function cancel(): void {
    closeDialog();
    onCancel?.();
  }

  return (
    <Modal open title={dialog.title} onClose={cancel}>
      <p>{dialog.body}</p>
      <div className="dialog-actions">
        <button
          type="button"
          onClick={() => {
            closeDialog();
            dialog.onConfirm();
          }}
        >
          {dialog.confirmLabel}
        </button>
        <button type="button" onClick={cancel}>
          {dialog.cancelLabel ?? 'Cancel'}
        </button>
      </div>
    </Modal>
  );
}
