import type { CalendarEvent } from '@/shared/types';
import {
  compareEvents,
  eventsIntersecting,
  insertSorted,
  lowerBound,
  removeById,
} from './sortedArray';

const HOUR = 60;
const DAY = 24 * HOUR;
const MONDAY = 10 * DAY; // any day boundary works: these tests only compare minutes

// PRE:  id is non-empty; start < end are integer minutes
// POST: returns a fixed medium-priority meeting [start, end) with that id (WI-07 adds shared builders)
function event(id: string, start: number, end: number): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    category: 'meeting',
    priority: 'medium',
    start,
    end,
    flexible: false,
    flexWindow: null,
    taskId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('compareEvents', () => {
  it('orders by start, then end, then id', () => {
    const early = event('z', 10, 50);
    const shorter = event('y', 20, 30);
    const longer = event('a', 20, 40);
    const sameAsLongerButLaterId = event('b', 20, 40);
    const sorted = [sameAsLongerButLaterId, longer, early, shorter].toSorted(compareEvents);

    expect(sorted.map((item) => item.id)).toEqual(['z', 'y', 'a', 'b']);
    expect(compareEvents(longer, longer)).toBe(0);
    expect(compareEvents(longer, sameAsLongerButLaterId)).toBeLessThan(0);
    expect(compareEvents(sameAsLongerButLaterId, longer)).toBeGreaterThan(0);
  });
});

describe('lowerBound', () => {
  const values = [1, 3, 3, 5, 8];

  it('finds the first index where a monotone predicate turns true', () => {
    expect(lowerBound(values, (value) => value >= 3)).toBe(1);
    expect(lowerBound(values, (value) => value >= 4)).toBe(3);
  });

  it('returns 0 when all match and length when none match', () => {
    expect(lowerBound(values, () => true)).toBe(0);
    expect(lowerBound(values, () => false)).toBe(values.length);
    expect(lowerBound([], () => true)).toBe(0);
  });
});

describe('insertSorted', () => {
  it('keeps the order, places ties after equal keys, and does not mutate its input', () => {
    const original = [event('a', 10, 20), event('c', 30, 40)];
    const snapshot = [...original];
    const inserted = insertSorted(original, event('b', 10, 25));

    expect(inserted.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(original).toEqual(snapshot);
    expect(insertSorted([], event('x', 0, 1)).map((item) => item.id)).toEqual(['x']);
    expect(insertSorted(original, event('d', 50, 60)).map((item) => item.id)).toEqual([
      'a',
      'c',
      'd',
    ]);
  });
});

describe('removeById', () => {
  it('removes the matching item without mutating its input', () => {
    const original = [event('a', 0, 1), event('b', 1, 2)];

    expect(removeById(original, 'a').map((item) => item.id)).toEqual(['b']);
    expect(removeById(original, 'missing')).toEqual(original);
    expect(original).toHaveLength(2);
  });
});

describe('eventsIntersecting', () => {
  const window = { start: MONDAY + 9 * HOUR, end: MONDAY + 12 * HOUR };
  const fromYesterday = event('overnight', MONDAY - 1 * HOUR, MONDAY + 10 * HOUR); // Sun 23:00 → Mon 10:00
  const touchingStart = event('beforeWindow', MONDAY + 8 * HOUR, MONDAY + 9 * HOUR);
  const inside = event('inside', MONDAY + 10 * HOUR, MONDAY + 11 * HOUR);
  const touchingEnd = event('afterWindow', MONDAY + 12 * HOUR, MONDAY + 13 * HOUR);
  const muchEarlier = event('earlier', MONDAY - 2 * DAY, MONDAY - 2 * DAY + HOUR);
  const sorted = [muchEarlier, fromYesterday, touchingStart, inside, touchingEnd].toSorted(
    compareEvents,
  );

  it('includes an event from 23:00 the day before that ends inside the window', () => {
    expect(eventsIntersecting(sorted, window).map((item) => item.id)).toEqual([
      'overnight',
      'inside',
    ]);
  });

  it('excludes events touching either window edge', () => {
    const ids = eventsIntersecting(sorted, window).map((item) => item.id);

    expect(ids).not.toContain('beforeWindow');
    expect(ids).not.toContain('afterWindow');
  });

  it('returns nothing for an empty array', () => {
    expect(eventsIntersecting([], window)).toEqual([]);
  });
});
