import { useId } from 'react';
import { ACCENT_OPTIONS } from '@/shared/constants';
import { useAppStore } from '../../store/appStore';

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

// PRE: StoreProvider supplies the UI theme/accent choices and their setters
// POST: offers immediate persisted theme and curated accent choices, outside the calendar settings form
export function AppearanceSection() {
  const theme = useAppStore((state) => state.theme);
  const accent = useAppStore((state) => state.accent);
  const actions = useAppStore((state) => state.actions);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>Appearance</h3>
      <fieldset role="radiogroup" aria-label="Theme">
        <legend>Theme</legend>
        {THEMES.map((choice) => (
          <label key={choice.id}>
            <input
              type="radio"
              name="theme"
              value={choice.id}
              checked={choice.id === theme}
              onChange={() => actions.setTheme(choice.id)}
            />
            {choice.label}
          </label>
        ))}
      </fieldset>
      <fieldset role="radiogroup" aria-label="Accent" className="accent-options">
        <legend>Accent</legend>
        {ACCENT_OPTIONS.map((choice) => (
          <label key={choice.id}>
            <input
              type="radio"
              name="accent"
              aria-label={choice.label}
              value={choice.id}
              checked={choice.id === accent}
              onChange={() => actions.setAccent(choice.id)}
            />
            <span
              className="accent-swatch"
              style={{ backgroundColor: `var(--accent-${choice.id})` }}
              aria-hidden="true"
            />
            {choice.label}
          </label>
        ))}
      </fieldset>
      <p className="hint">Appearance changes apply immediately on this device.</p>
    </section>
  );
}
