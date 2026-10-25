// Toast records and their lifetimes (TECH_SPEC §11.1, PROJECT_SCHEMA UX feedback table).

import { TOAST_MS, WARNING_TOAST_MS } from '@/shared/constants';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  tone: ToastTone;
  text: string;
  actions?: ToastAction[];
  sticky?: boolean;
}

// PRE:  toast is a Toast
// POST: returns how long it stays before closing itself, in ms, or null when it stays until
//       dismissed (sticky toasts and every error toast)
export function toastLifetimeMs(toast: Toast): number | null {
  if (toast.sticky === true || toast.tone === 'error') {
    return null;
  }
  return toast.tone === 'warning' ? WARNING_TOAST_MS : TOAST_MS;
}

// PRE:  toasts is the current list; id is any string
// POST: returns toasts without the toast with that id
export function withoutToast(toasts: readonly Toast[], id: string): Toast[] {
  return toasts.filter((toast) => toast.id !== id);
}
