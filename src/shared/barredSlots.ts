import { MIN_BARRED_RANGE_DAYS, WEEKDAY_NAMES, WEEKDAY_ORDER } from './constants';
import type { BarredOverlap, BarredSlot, CalendarEvent, Weekday } from './types';
import { toClockTime } from './clockText';

// PRE: first/second are valid clashing barred slots; days are their shared weekdays in display order
// POST: names the first slot by label/time; exact duplicate days/times get the D-20 duplicate message
export function barredClashText(
  first: BarredSlot,
  second: BarredSlot,
  days: readonly Weekday[],
): string {
  const name = `"${first.label}" (${toClockTime(first.startMin)}–${toClockTime(first.endMin)})`;
  const duplicate =
    first.startMin === second.startMin &&
    first.endMin === second.endMin &&
    first.days.length === second.days.length &&
    first.days.every((day) => second.days.includes(day));
  return duplicate
    ? `Same days and times as ${name}.`
    : `Overlaps ${name} on ${barredDaysText(days)}.`;
}

export interface BarredSlotClash {
  firstIndex: number;
  secondIndex: number;
  days: Weekday[];
}

// PRE:  slots have valid weekday sets and half-open minute-of-day intervals
// POST: returns every overlapping pair with shared days in Monday-first order; touching is allowed
export function barredSlotClashes(slots: readonly BarredSlot[]): BarredSlotClash[] {
  const clashes: BarredSlotClash[] = [];
  // INVARIANT: 1 ≤ secondIndex ≤ max(1, slots.length); every pair ending before secondIndex was considered once
  for (let secondIndex = 1; secondIndex < slots.length; secondIndex += 1) {
    const second = slots[secondIndex] as BarredSlot;
    // INVARIANT: 0 ≤ firstIndex ≤ secondIndex; pairs ending at secondIndex before firstIndex are considered
    for (let firstIndex = 0; firstIndex < secondIndex; firstIndex += 1) {
      const first = slots[firstIndex] as BarredSlot;
      const days = WEEKDAY_ORDER.filter(
        (day) => first.days.includes(day) && second.days.includes(day),
      );
      if (days.length > 0 && first.startMin < second.endMin && second.startMin < first.endMin) {
        clashes.push({ firstIndex, secondIndex, days });
      }
    }
    // POST: every pair ending at secondIndex is considered
  }
  // POST: every unordered pair is considered exactly once
  return clashes;
}

// PRE:  days are weekdays in the desired display order
// POST: returns short names, compacting a contiguous run of at least three days when requested
export function barredDaysText(days: readonly Weekday[], compact = false): string {
  if (
    compact &&
    days.length >= MIN_BARRED_RANGE_DAYS &&
    days.every(
      (day, index) =>
        index === 0 ||
        WEEKDAY_ORDER.indexOf(day) === WEEKDAY_ORDER.indexOf(days[index - 1] as Weekday) + 1,
    )
  ) {
    return `${WEEKDAY_NAMES[days[0] as Weekday]}–${WEEKDAY_NAMES[days.at(-1) as Weekday]}`;
  }
  return days.map((day) => WEEKDAY_NAMES[day]).join(', ');
}

// PRE:  warnings and events belong to the same valid snapshot
// POST: returns warning records whose event has not explicitly kept that slot, in input order
export function unkeptBarredOverlaps(
  warnings: readonly BarredOverlap[],
  events: readonly CalendarEvent[],
): BarredOverlap[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return warnings.filter(
    (warning) => !byId.get(warning.eventId)?.keptInBarred.includes(warning.slotId),
  );
}

// PRE:  slots are structurally valid barred slots
// POST: returns stable content including labels/order, independent of each weekday array's order
function slotContents(slots: readonly BarredSlot[]): string {
  return JSON.stringify(slots.map((slot) => ({ ...slot, days: slot.days.toSorted() })));
}

// PRE:  first and second are structurally valid barred slot lists
// POST: true iff they contain the same ordered records, ignoring only weekday ordering
export function sameBarredSlots(
  first: readonly BarredSlot[],
  second: readonly BarredSlot[],
): boolean {
  return slotContents(first) === slotContents(second);
}

// PRE:  before/after are valid slot lists with stable ids
// POST: returns ids deleted or changed in times/days; label changes and day reordering are ignored
export function invalidatedBarredIds(
  before: readonly BarredSlot[],
  after: readonly BarredSlot[],
): Set<string> {
  const byId = new Map(after.map((slot) => [slot.id, slot]));
  return new Set(
    before
      .filter((slot) => {
        const next = byId.get(slot.id);
        return (
          next === undefined ||
          slot.startMin !== next.startMin ||
          slot.endMin !== next.endMin ||
          JSON.stringify(slot.days.toSorted()) !== JSON.stringify(next.days.toSorted())
        );
      })
      .map((slot) => slot.id),
  );
}

// PRE:  event is valid; invalidIds lists slot identities invalidated by a settings change
// POST: returns event unchanged when possible, otherwise removes invalid keeps without changing time
export function clearInvalidKeeps(
  event: CalendarEvent,
  invalidIds: ReadonlySet<string>,
): CalendarEvent {
  const keptInBarred = event.keptInBarred.filter((id) => !invalidIds.has(id));
  return keptInBarred.length === event.keptInBarred.length ? event : { ...event, keptInBarred };
}
