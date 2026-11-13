import { ACCENT_OPTIONS } from '@/shared/constants';
import { readPreference } from './preferences';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<ThemeChoice, 'system'>;
export type AccentChoice = (typeof ACCENT_OPTIONS)[number]['id'];
export const THEME_KEY = 'fc-theme';
export const ACCENT_KEY = 'fc-accent';

// PRE: none
// POST: returns the remembered Light/Dark choice or System for missing/invalid/blocked storage
export function storedTheme(): ThemeChoice {
  const stored = readPreference(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

// PRE: none
// POST: returns a curated remembered accent, or neutral for missing/invalid/blocked storage
export function storedAccent(): AccentChoice {
  const stored = readPreference(ACCENT_KEY);
  return ACCENT_OPTIONS.find((accent) => accent.id === stored)?.id ?? 'neutral';
}
