// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { THEME_KEY, nextTheme, useTheme } from './useTheme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('useTheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });

  it('T32 (e): three clicks set light, dark, then remove the attribute; localStorage follows', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    const state = () => [document.documentElement.dataset.theme, localStorage.getItem(THEME_KEY)];

    act(() => result.current.cycleTheme());
    expect(state()).toEqual(['light', 'light']);
    act(() => result.current.cycleTheme());
    expect(state()).toEqual(['dark', 'dark']);
    act(() => result.current.cycleTheme());
    expect(state()).toEqual([undefined, 'system']);
  });

  it('starts from the stored choice and applies it, ignoring an unknown value', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const { result, unmount } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    unmount();

    localStorage.setItem(THEME_KEY, 'neon');
    expect(renderHook(() => useTheme()).result.current.theme).toBe('system');
  });
});
