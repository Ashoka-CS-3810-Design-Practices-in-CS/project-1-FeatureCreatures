import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import type { ThemeChoice, ResolvedTheme } from './appearance';
import { useMediaQuery } from './useMediaQuery';

export { THEME_KEY, type ThemeChoice } from './appearance';
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';

// PRE: theme is a theme choice; systemTheme is the current operating-system theme
// POST: returns the opposite of the resolved theme; System is selected through Appearance
export function nextTheme(theme: ThemeChoice, systemTheme: ResolvedTheme = 'light'): ResolvedTheme {
  const resolved = theme === 'system' ? systemTheme : theme;
  return resolved === 'light' ? 'dark' : 'light';
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

// PRE: called under StoreProvider in a mounted component; window.matchMedia exists
// POST: applies the stored theme, follows OS changes under System and returns a Light/Dark toggle
export function useTheme(): {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  cycleTheme: () => void;
} {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.actions.setTheme);
  const systemTheme = useMediaQuery(DARK_THEME_QUERY) ? 'dark' : 'light';
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // PRE:  none
  // POST: stores the opposite of the currently resolved theme without changing calendar data
  function cycleTheme(): void {
    setTheme(nextTheme(theme, systemTheme));
  }

  return { theme, resolvedTheme, cycleTheme };
}
