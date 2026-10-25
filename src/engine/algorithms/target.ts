// Which event of a conflict to suggest moving (TECH_SPEC §8.11, BR-10).

import { PRIORITY_RANK } from '@/shared/constants';
import type { CalendarEvent } from '@/shared/types';
import { length } from './interval';

// PRE:  first and second are events with distinct ids
// POST: returns the id of the event BR-10 suggests moving, decided by the first rule that differs:
//       flexible over fixed, then lower PRIORITY_RANK, then shorter duration, then later start,
//       then larger id; the result does not depend on argument order; O(1)
export function chooseTarget(first: CalendarEvent, second: CalendarEvent): string {
  if (first.flexible !== second.flexible) {
    return first.flexible ? first.id : second.id;
  }

  const firstRank = PRIORITY_RANK[first.priority];
  const secondRank = PRIORITY_RANK[second.priority];
  if (firstRank !== secondRank) {
    return firstRank < secondRank ? first.id : second.id;
  }

  const firstDuration = length(first);
  const secondDuration = length(second);
  if (firstDuration !== secondDuration) {
    return firstDuration < secondDuration ? first.id : second.id;
  }

  if (first.start !== second.start) {
    return first.start > second.start ? first.id : second.id;
  }

  return first.id > second.id ? first.id : second.id;
}
