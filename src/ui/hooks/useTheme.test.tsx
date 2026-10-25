// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { readPreference, writePreference } from './preferences';
import { THEME_KEY, nextTheme, useTheme } from './useTheme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('preferences', () => {
  it('reads back what was written, and null for a missing key', () => {
    writePreference('fc-test', 'on');

    expect(readPreference('fc-test')).toBe('on');
    expect(readPreference('fc-missing')).toBeNull();
  });

  it('survives a localStorage that throws (private mode, blocked storage)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readPreference('fc-test')).toBeNull();
    expect(() => writePreference('fc-test', 'on')).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
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
