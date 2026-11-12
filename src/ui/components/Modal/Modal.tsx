import { useEffect, useId, useRef, type ReactNode } from 'react';

// Confirmation replaces its source dialog; its original page trigger must survive that handoff.
let pageTrigger: HTMLElement | null = null;

// PRE:  open says whether the dialog is shown; title names it; onClose is called when the dialog
//       closes itself (Esc or form method="dialog"); children are its content
//       dismissible permits Esc; className/id optionally identify the drawer
// POST: renders a native <dialog> opened with showModal() while open (so focus is trapped and the
//       page behind is inert), labelled by its title; a dismissible dialog also shows a × button
//       named Close that calls onClose exactly as Cancel / Esc do (WI-45, report #11)
export function Modal({
  open,
  title,
  onClose,
  children,
  dismissible = true,
  className,
  id,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
  className?: string;
  id?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const programmaticClose = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || !open) {
      return;
    }
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (trigger !== null && trigger !== document.body && trigger.closest('dialog') === null) {
      pageTrigger = trigger;
    }
    programmaticClose.current = false;
    if (!dialog.open) {
      dialog.showModal();
    }

    return () => {
      programmaticClose.current = true;
      if (dialog.open) {
        dialog.close();
      }
      const target = trigger?.isConnected ? trigger : pageTrigger;
      if (target?.isConnected) {
        target.focus();
      }
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className={className}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      onClose={() => {
        // 'close' is queued, so it can arrive after a StrictMode remount reopened the dialog and
        // reset programmaticClose; an open dialog means that event is stale.
        if (!programmaticClose.current && dialogRef.current?.open !== true) onClose();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      {/* Last in the DOM, so opening still focuses the first field; CSS puts it top-right. */}
      {dismissible && (
        <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      )}
    </dialog>
  );
}
