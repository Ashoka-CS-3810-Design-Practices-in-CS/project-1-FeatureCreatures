// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { THEME_KEY, nextTheme, useTheme } from './useTheme';
import { makeEngine } from '../../../tests/helpers/engine';
import { storeFor } from '../../../tests/helpers/render';
import { StoreProvider } from '../store/appStore';

// PRE: none
// POST: renders the theme hook over a fresh store using the current persisted preferences
async function renderThemeHook() {
  const store = storeFor((await makeEngine()).engine);
  return {
    store,
    ...renderHook(() => useTheme(), {
      wrapper: ({ children }) => <StoreProvider store={store}>{children}</StoreProvider>,
    }),
  };
}

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('useTheme', () => {
  it('D-13: toggles the resolved theme; System stays available through Appearance', () => {
    expect(nextTheme('system')).toBe('dark');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('system', 'dark')).toBe('light');
  });

  it('T32 (e), D-13: toggles dark/light, then System removes the attribute; localStorage follows', async () => {
    const { result, store } = await renderThemeHook();
    expect(result.current.theme).toBe('system');
    const state = () => [document.documentElement.dataset.theme, localStorage.getItem(THEME_KEY)];

    act(() => result.current.cycleTheme());
    expect(state()).toEqual(['dark', 'dark']);
    act(() => result.current.cycleTheme());
    expect(state()).toEqual(['light', 'light']);
    act(() => store.getState().actions.setTheme('system'));
    expect(state()).toEqual([undefined, 'system']);
  });

  it('starts from the stored choice and applies it, ignoring an unknown value', async () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const { result, unmount } = await renderThemeHook();

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    unmount();

    localStorage.setItem(THEME_KEY, 'neon');
    expect((await renderThemeHook()).result.current.theme).toBe('system');
  });

  it('T57: System follows OS changes while an explicit choice ignores them, and unsubscribes', async () => {
    let systemDark = true;
    const listeners = new Set<() => void>();
    const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      media: query,
      // PRE: none
      // POST: returns the current simulated OS preference
      get matches() {
        return systemDark;
      },
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject | ((event: MediaQueryListEvent) => void),
      ) => listeners.add(listener as () => void),
      removeEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject | ((event: MediaQueryListEvent) => void),
      ) => listeners.delete(listener as () => void),
      dispatchEvent: () => true,
    }));
    try {
      const { result, store, unmount } = await renderThemeHook();
      expect(result.current.resolvedTheme).toBe('dark');
      expect(document.documentElement.dataset.theme).toBeUndefined();
      act(() => {
        systemDark = false;
        listeners.forEach((listener) => listener());
      });
      expect(result.current.resolvedTheme).toBe('light');
      act(() => store.getState().actions.setTheme('light'));
      act(() => {
        systemDark = true;
        listeners.forEach((listener) => listener());
      });
      expect(result.current.resolvedTheme).toBe('light');
      expect(document.documentElement.dataset.theme).toBe('light');
      unmount();
      expect(listeners.size).toBe(0);
    } finally {
      media.mockRestore();
    }
  });
});
