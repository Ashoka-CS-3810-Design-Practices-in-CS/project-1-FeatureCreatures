import type { EventInput } from '@fullcalendar/core';
import {
  addLocalDays,
  fromMinute,
  localMinuteOfDay,
  onLocalDay,
  startOfLocalDay,
} from '@/shared/time';
import type { Interval, Minute } from '@/shared/types';
import { NOW_GUIDE_DURATION_MIN } from '@/shared/constants';

// PRE:  range is the valid visible date range or null before datesSet; now is raw current time
// POST: returns one decorative background guide at now's local wall-clock time per visible day;
//       uses local-day conversion so DST day lengths do not shift the guide's clock time
export function nowGuideEntries(range: Interval | null, now: Minute): EventInput[] {
  if (range === null) return [];
  const entries: EventInput[] = [];
  const minuteOfDay = localMinuteOfDay(now);
  // INVARIANT: day is a local midnight; entries covers each visible day before day once
  for (let day = startOfLocalDay(range.start); day < range.end; day = addLocalDays(day, 1)) {
    const start = onLocalDay(day, minuteOfDay);
    entries.push({
      id: `now-guide-${day}`,
      title: '',
      start: fromMinute(start),
      end: fromMinute(start + NOW_GUIDE_DURATION_MIN),
      display: 'background',
      classNames: ['now-guide'],
    });
  }
  // POST: entries has one guide per visible local day, in day order
  return entries;
}
