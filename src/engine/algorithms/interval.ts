// Half-open interval helpers [start, end) (TECH_SPEC §8.1, BR-2).

import type { Interval } from '@/shared/types';

// PRE:  interval.end ≥ interval.start
// POST: returns interval.end − interval.start
export function length(interval: Interval): number {
  return interval.end - interval.start;
}

// PRE:  first and second are intervals
// POST: returns true iff they share at least one minute (touching intervals do not overlap)
export function overlaps(first: Interval, second: Interval): boolean {
  return first.start < second.end && second.start < first.end;
}

// PRE:  first and second are intervals
// POST: returns [max(starts), min(ends)) when that is non-empty, otherwise null
export function overlapOf(first: Interval, second: Interval): Interval | null {
  const start = Math.max(first.start, second.start);
  const end = Math.min(first.end, second.end);
  return start < end ? { start, end } : null;
}

// PRE:  outer and inner are intervals
// POST: returns true iff inner lies entirely within outer (edges included)
export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

export const intersect = overlapOf;

// PRE:  interval is an interval; by ≥ 0
// POST: returns [interval.start − by, interval.end + by)
export function expand(interval: Interval, by: number): Interval {
  return { start: interval.start - by, end: interval.end + by };
}

// PRE:  low ≤ high
// POST: returns value limited to [low, high]
export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

// PRE:  every element of intervals has end ≥ start
// POST: returns the largest length among intervals, 0 when intervals is empty
export function maxLength(intervals: readonly Interval[]): number {
  return intervals.reduce((longest, interval) => Math.max(longest, length(interval)), 0);
}
