// UI-only preferences (theme, last view) live in localStorage, not in Settings (PROJECT_SCHEMA
// §3.2). Storage can be blocked (private mode, site settings), so every access is guarded and a
// failure just means the preference is not remembered.

import type { AppStore, ViewType } from '../store/appStore';

export const VIEW_KEY = 'fc-view';
const VIEW_TYPES: readonly string[] = ['timeGridDay', 'timeGridWeek', 'dayGridMonth', 'listWeek'];

// PRE:  key is a localStorage key
// POST: returns the stored value, or null when it is missing or storage cannot be read
export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// PRE:  key is a localStorage key; value is the text to keep
// POST: stores value under key when storage allows; never throws
export function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering a preference is harmless; the app keeps working.
  }
}

// PRE:  none
// POST: returns the view remembered from the last visit, or undefined when none (or an unknown
//       one) is stored
export function storedView(): ViewType | undefined {
  const stored = readPreference(VIEW_KEY);
  return stored !== null && VIEW_TYPES.includes(stored) ? (stored as ViewType) : undefined;
}

// PRE:  store comes from createAppStore
// POST: from now on, every change of the store's view type is written to localStorage['fc-view'];
//       returns the function that stops this
export function rememberView(store: AppStore): () => void {
  return store.subscribe((state, previous) => {
    if (state.view.type !== previous.view.type) {
      writePreference(VIEW_KEY, state.view.type);
    }
  });
}
