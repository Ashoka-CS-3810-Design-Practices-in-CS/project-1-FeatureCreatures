// UI-only preferences (theme, last view) live in localStorage, not in Settings (PROJECT_SCHEMA
// §3.2). Storage can be blocked (private mode, site settings), so every access is guarded and a
// failure just means the preference is not remembered.

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
