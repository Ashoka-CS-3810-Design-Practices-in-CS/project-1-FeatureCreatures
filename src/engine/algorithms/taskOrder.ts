// Scheduling queue order for selected tasks (TECH_SPEC §8.12, BR-11).

import { PRIORITY_RANK } from '@/shared/constants';
import type { Task } from '@/shared/types';
import { compareIds } from './sortedArray';

// PRE:  first and second are tasks
// POST: returns < 0 when first is queued before second, > 0 when after, 0 only for equal keys:
//       higher PRIORITY_RANK, then earlier window.end, then longer durationMin, then name
//       (localeCompare), then id (code units); O(1)
export function compareTasksForQueue(first: Task, second: Task): number {
  if (first.priority !== second.priority) {
    return PRIORITY_RANK[second.priority] - PRIORITY_RANK[first.priority];
  }
  if (first.window.end !== second.window.end) {
    return first.window.end - second.window.end;
  }
  if (first.durationMin !== second.durationMin) {
    return second.durationMin - first.durationMin;
  }
  const byName = first.name.localeCompare(second.name);
  if (byName !== 0) {
    return byName;
  }
  return compareIds(first.id, second.id);
}
