import { useEffect, useState } from 'react';
import { readPreference, writePreference } from './preferences';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'fc-theme';
const THEME_CYCLE: Record<ThemeChoice, ThemeChoice> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

// PRE:  theme is a theme choice
// POST: returns the choice after it in the toggle's cycle, system → light → dark → system (B3)
export function nextTheme(theme: ThemeChoice): ThemeChoice {
  return THEME_CYCLE[theme];
}

// PRE:  none
// POST: returns the stored theme choice, or 'system' when none (or an unknown one) is stored
function storedTheme(): ThemeChoice {
  const stored = readPreference(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

// PRE:  theme is a theme choice
// POST: <html data-theme> is theme, or absent for 'system' (the CSS then follows the OS setting)
function applyTheme(theme: ThemeChoice): void {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

// PRE:  called in a React component (App)
// POST: returns the current theme choice and cycleTheme, which moves to the next choice, applies it
//       to <html> and stores it in localStorage['fc-theme'] (TECH_SPEC §11.4)
export function useTheme(): { theme: ThemeChoice; cycleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // PRE:  none
  // POST: the theme is the next choice, and that choice is stored
  function cycleTheme(): void {
    const next = nextTheme(theme);
    writePreference(THEME_KEY, next);
    setTheme(next);
  }

  return { theme, cycleTheme };
}
