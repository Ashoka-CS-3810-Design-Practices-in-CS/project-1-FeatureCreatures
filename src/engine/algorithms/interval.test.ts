import {
  clamp,
  contains,
  expand,
  intersect,
  length,
  maxLength,
  overlapOf,
  overlaps,
} from './interval';

describe('interval', () => {
  it('length is end − start', () => {
    expect(length({ start: 10, end: 25 })).toBe(15);
  });

  it.each([
    ['touching', { start: 0, end: 10 }, { start: 10, end: 20 }, false],
    ['nested', { start: 0, end: 30 }, { start: 10, end: 20 }, true],
    ['identical', { start: 5, end: 15 }, { start: 5, end: 15 }, true],
    ['disjoint', { start: 0, end: 5 }, { start: 8, end: 12 }, false],
    ['partial', { start: 0, end: 10 }, { start: 5, end: 15 }, true],
  ])('overlaps for %s intervals is %s both ways (BR-2)', (_label, first, second, expected) => {
    expect(overlaps(first, second)).toBe(expected);
    expect(overlaps(second, first)).toBe(expected);
  });

  it('overlapOf gives the shared part, or null when touching or disjoint', () => {
    expect(overlapOf({ start: 0, end: 10 }, { start: 5, end: 15 })).toEqual({ start: 5, end: 10 });
    expect(overlapOf({ start: 0, end: 10 }, { start: 10, end: 20 })).toBeNull();
    expect(overlapOf({ start: 0, end: 5 }, { start: 8, end: 12 })).toBeNull();
    expect(intersect).toBe(overlapOf);
  });

  it('contains includes both edges and rejects a one-minute overhang', () => {
    const outer = { start: 10, end: 20 };

    expect(contains(outer, { start: 10, end: 20 })).toBe(true);
    expect(contains(outer, { start: 12, end: 18 })).toBe(true);
    expect(contains(outer, { start: 9, end: 20 })).toBe(false);
    expect(contains(outer, { start: 10, end: 21 })).toBe(false);
  });

  it('expand widens both sides', () => {
    expect(expand({ start: 60, end: 120 }, 15)).toEqual({ start: 45, end: 135 });
  });

  it('clamp keeps a value inside [low, high]', () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(15, 10, 20)).toBe(15);
    expect(clamp(25, 10, 20)).toBe(20);
  });

  it('maxLength is the longest interval, 0 for none', () => {
    expect(maxLength([])).toBe(0);
    expect(
      maxLength([
        { start: 0, end: 5 },
        { start: 10, end: 40 },
        { start: 50, end: 60 },
      ]),
    ).toBe(30);
  });
});
