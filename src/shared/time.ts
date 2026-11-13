// The local-time boundary (TECH_SPEC §8.6, BR-1): the only non-UI module that may use date-fns.
// Everything else works in absolute Minutes; DayFrames hand algorithms pre-expanded local days.

import { addDays, parse, set, startOfDay, startOfWeek } from 'date-fns';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, MS_PER_MINUTE } from './constants';
import type { DayFrame, Interval, Minute, Settings, Weekday } from './types';

const LOCAL_DATE_TIME_FORMAT = 'yyyy-MM-dd HH:mm';
const MONDAY = 1; // weeks start on Monday (BR-1)

// PRE:  date is a valid Date
// POST: returns the whole minutes since the Unix epoch at date (seconds are dropped)
export function toMinute(date: Date): Minute {
  return Math.floor(date.getTime() / MS_PER_MINUTE);
}

// PRE:  minute is an integer Minute
// POST: returns the Date at the start of that minute
export function fromMinute(minute: Minute): Date {
  return new Date(minute * MS_PER_MINUTE);
}

// PRE:  minute is an integer; step is a positive integer
// POST: returns the smallest multiple of step that is ≥ minute
export function ceilTo(minute: Minute, step: number): Minute {
  return Math.ceil(minute / step) * step;
}

// PRE:  minute is an integer Minute
// POST: returns the Minute of local midnight at the start of minute's local day
export function startOfLocalDay(minute: Minute): Minute {
  return toMinute(startOfDay(fromMinute(minute)));
}

// PRE:  minute is an integer Minute; dayCount is an integer
// POST: returns the same local wall-clock time dayCount local days later (DST-safe: a local day
//       may be 23–25 h long)
export function addLocalDays(minute: Minute, dayCount: number): Minute {
  return toMinute(addDays(fromMinute(minute), dayCount));
}

// PRE:  date is 'YYYY-MM-DD' and time is 'HH:mm', together a valid local date-time
// POST: returns the Minute of that local date-time
export function atLocal(date: string, time: string): Minute {
  return toMinute(parse(`${date} ${time}`, LOCAL_DATE_TIME_FORMAT, new Date()));
}

// PRE:  minute is an integer Minute
// POST: returns hours × 60 + minutes of minute's local wall-clock time, in 0..1439
export function localMinuteOfDay(minute: Minute): number {
  const date = fromMinute(minute);
  return date.getHours() * MINUTES_PER_HOUR + date.getMinutes();
}

// PRE:  dayStart is a local midnight; dayEnd = addLocalDays(dayStart, 1);
//       minuteOfDay is an integer with 0 ≤ minuteOfDay ≤ MINUTES_PER_DAY
// POST: returns the Minute at local wall-clock minuteOfDay on dayStart's day, or dayEnd when
//       minuteOfDay = MINUTES_PER_DAY
function atMinuteOfDay(dayStart: Minute, dayEnd: Minute, minuteOfDay: number): Minute {
  if (minuteOfDay === MINUTES_PER_DAY) {
    return dayEnd;
  }
  // set() fixes the wall-clock time; adding minutes to midnight would be off by an hour on DST days.
  const wallClock = {
    hours: Math.floor(minuteOfDay / MINUTES_PER_HOUR),
    minutes: minuteOfDay % MINUTES_PER_HOUR,
  };
  return toMinute(set(fromMinute(dayStart), wallClock));
}

// PRE:  day is a local midnight; minuteOfDay is an integer with 0 ≤ minuteOfDay ≤ MINUTES_PER_DAY
// POST: returns the Minute at local wall-clock minuteOfDay on day's date (DST-safe), or the next
//       local midnight when minuteOfDay = MINUTES_PER_DAY
export function onLocalDay(day: Minute, minuteOfDay: number): Minute {
  return atMinuteOfDay(day, addLocalDays(day, 1), minuteOfDay);
}

// PRE:  minute is an integer Minute
// POST: returns the local midnight that starts the Monday of minute's week
export function startOfLocalWeek(minute: Minute): Minute {
  return toMinute(startOfWeek(fromMinute(minute), { weekStartsOn: MONDAY }));
}

// PRE:  dayStart is a local midnight; settings satisfies storedSettingsSchema
// POST: returns the DayFrame of dayStart's local day: its end, weekday, effective work interval
//       (whole day when globally off; otherwise null on non-working days) and sorted barred slots
function buildDayFrame(dayStart: Minute, settings: Settings): DayFrame {
  const dayEnd = addLocalDays(dayStart, 1);
  // getDay() is always 0..6, so the cast to Weekday is safe.
  const weekday = fromMinute(dayStart).getDay() as Weekday;
  const work = !settings.useWorkingHours
    ? { start: dayStart, end: dayEnd }
    : settings.workDays.includes(weekday)
      ? {
          start: atMinuteOfDay(dayStart, dayEnd, settings.workStartMin),
          end: atMinuteOfDay(dayStart, dayEnd, settings.workEndMin),
        }
      : null;
  const barred = settings.barredSlots
    .filter((slot) => slot.days.includes(weekday))
    .toSorted((first, second) => first.startMin - second.startMin)
    .map((slot) => ({
      slotId: slot.id,
      label: slot.label,
      interval: {
        start: atMinuteOfDay(dayStart, dayEnd, slot.startMin),
        end: atMinuteOfDay(dayStart, dayEnd, slot.endMin),
      },
    }));
  return { dayStart, dayEnd, weekday, work, barred };
}

// PRE:  interval.start ≤ interval.end; settings satisfies storedSettingsSchema
// POST: returns whether the local day of interval.start is a working day whose working hours
//       interval overlaps (WI-41); an event entirely at night or on a non-working day does not
export function overlapsWorkingHours(interval: Interval, settings: Settings): boolean {
  const day = startOfLocalDay(interval.start);
  const work = buildDayFrame(day, settings).work;
  return work !== null && interval.start < work.end && work.start < interval.end;
}

/** One DayFrame per local day intersecting `window`, in order. Work and barred times are built with
 *  date-fns `set(day, {hours, minutes})`, never by adding minutes to midnight — so DST days are correct. */
// PRE:  window.end > window.start; settings satisfies storedSettingsSchema
// POST: returns, in order, one DayFrame for every local day [dayStart, dayEnd) that intersects
//       window; costs O(D·B) for D days and B barred slots
export function buildDayFrames(window: Interval, settings: Settings): DayFrame[] {
  const frames: DayFrame[] = [];
  let dayStart = startOfLocalDay(window.start);

  // INVARIANT: guard:    dayStart is a local midnight
  //            behavior: frames holds, in order, the frames of every local day that intersects
  //                      window and starts before dayStart
  while (dayStart < window.end) {
    const frame = buildDayFrame(dayStart, settings);
    frames.push(frame);
    dayStart = frame.dayEnd;
  }
  // POST: dayStart ≥ window.end, so frames holds every local day that intersects window

  return frames;
}
