// @vitest-environment jsdom
import { makeEngine } from '../../../tests/helpers/engine';
import { storeFor } from '../../../tests/helpers/render';
import { t } from '../../../tests/helpers/time';
import {
  CALENDAR_VIEW_KEY,
  VIEW_KEY,
  readPreference,
  rememberView,
  storedCalendarView,
  storedView,
  writePreference,
} from './preferences';

afterEach(() => localStorage.clear());

describe('preferences', () => {
  it('T50: reads only valid Calendar return views', () => {
    expect(storedCalendarView()).toBeUndefined();
    localStorage.setItem(CALENDAR_VIEW_KEY, 'timeGridDay');
    expect(storedCalendarView()).toBe('timeGridDay');
    localStorage.setItem(CALENDAR_VIEW_KEY, 'listWeek');
    expect(storedCalendarView()).toBeUndefined();
    localStorage.setItem(CALENDAR_VIEW_KEY, 'yearGrid');
    expect(storedCalendarView()).toBeUndefined();
  });

  it('T50: List persists its active side while retaining the last Calendar view', async () => {
    const store = storeFor((await makeEngine()).engine);
    const stop = rememberView(store);
    store.getState().actions.setView('timeGridDay', t('Mon 00:00'));
    store.getState().actions.setView('listWeek', t('Mon 00:00'));
    expect(storedView()).toBe('listWeek');
    expect(storedCalendarView()).toBe('timeGridDay');
    expect(store.getState().lastCalendarView).toBe('timeGridDay');
    stop();
  });
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

  it('storedView returns a remembered view, and undefined for none or an unknown one', () => {
    expect(storedView()).toBeUndefined();
    localStorage.setItem(VIEW_KEY, 'listWeek');
    expect(storedView()).toBe('listWeek');
    localStorage.setItem(VIEW_KEY, 'yearGrid');
    expect(storedView()).toBeUndefined();
  });

  it('rememberView keeps localStorage in step with the view type until stopped', async () => {
    const store = storeFor((await makeEngine()).engine);
    const stop = rememberView(store);

    store.getState().actions.setView('dayGridMonth', t('2026-11-01 00:00'));
    expect(localStorage.getItem(VIEW_KEY)).toBe('dayGridMonth');
    stop();
    store.getState().actions.setView('timeGridDay', t('Mon 00:00'));
    expect(localStorage.getItem(VIEW_KEY)).toBe('dayGridMonth');
  });
});
