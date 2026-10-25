import { useEffect, useId, useRef, type ReactNode } from 'react';

// PRE:  open says whether the dialog is shown; title names it; onClose is called when the dialog
//       closes itself (Esc or form method="dialog"); children are its content
// POST: renders a native <dialog> opened with showModal() while open (so focus is trapped and the
//       page behind is inert), labelled by its title
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
