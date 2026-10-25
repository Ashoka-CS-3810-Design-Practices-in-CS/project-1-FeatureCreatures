import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { toastLifetimeMs, type Toast } from '../../store/toastSlice';

// PRE:  toast is a Toast; onDismiss removes a toast by id
// POST: shows the toast's text, its action buttons (each runs, then dismisses) and a Dismiss
//       button; a timed toast dismisses itself after its lifetime, paused while hovered or focused
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const lifetime = toastLifetimeMs(toast);
    if (lifetime === null || paused) {
      return undefined;
    }
    const timer = setTimeout(() => onDismiss(toast.id), lifetime);
    return () => clearTimeout(timer);
  }, [toast, paused, onDismiss]);

  return (
    <div
      className={`toast toast-${toast.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p>{toast.text}</p>
      {toast.actions?.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => {
            action.run();
            onDismiss(toast.id);
          }}
        >
          {action.label}
        </button>
      ))}
      <button type="button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}

// PRE:  rendered under StoreProvider; reads toasts and actions.dismissToast
// POST: shows every toast in an ARIA live region: errors in an assertive one, the rest in a polite
//       one, so screen readers announce them (PROJECT_SCHEMA UX feedback)
export function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.actions.dismissToast);
  const errors = toasts.filter((toast) => toast.tone === 'error');
  const others = toasts.filter((toast) => toast.tone !== 'error');

  return (
    <div className="toasts">
      <div aria-live="assertive" aria-label="Errors">
        {errors.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
      <div aria-live="polite" aria-label="Notifications">
        {others.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </div>
  );
}
