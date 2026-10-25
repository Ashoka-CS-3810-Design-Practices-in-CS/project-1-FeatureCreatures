import type { CalendarEvent } from '@/shared/types';
import { ev, iv } from '../../../tests/helpers/builders';
import { compareEvents } from './sortedArray';
import { countOverlaps, detectConflicts } from './sweep';

// PRE:  events have distinct ids, in any order
// POST: returns detectConflicts over events sorted by compareEvents (its PRE)
function sweep(events: CalendarEvent[]) {
  return detectConflicts(events.toSorted(compareEvents));
}

describe('detectConflicts (BR-3)', () => {
  it('T1: reports the canonical overlap with its minutes', () => {
    const conflicts = sweep([ev('A', 'Mon 10:00', 'Mon 11:30'), ev('B', 'Mon 11:00', 'Mon 12:00')]);

    expect(conflicts).toEqual([
      {
        key: 'A|B',
        aId: 'A',
        bId: 'B',
        overlap: iv('Mon 11:00', 'Mon 11:30'),
        minutes: 30,
        targetId: 'B',
      },
    ]);
  });

  it('T2: touching endpoints are not a conflict (BR-2)', () => {
    expect(sweep([ev('A', 'Mon 10:00', 'Mon 11:00'), ev('B', 'Mon 11:00', 'Mon 12:00')])).toEqual(
      [],
    );
  });

  it('T3: finds all three pairs of a cluster, in (overlap.start, key) order', () => {
    const conflicts = sweep([
      ev('A', 'Mon 09:00', 'Mon 12:00'),
      ev('B', 'Mon 10:00', 'Mon 11:00'),
      ev('C', 'Mon 10:30', 'Mon 11:30'),
    ]);

    expect(conflicts.map(({ key, overlap, minutes }) => ({ key, overlap, minutes }))).toEqual([
      { key: 'A|B', overlap: iv('Mon 10:00', 'Mon 11:00'), minutes: 60 },
      { key: 'A|C', overlap: iv('Mon 10:30', 'Mon 11:30'), minutes: 60 },
      { key: 'B|C', overlap: iv('Mon 10:30', 'Mon 11:00'), minutes: 30 },
    ]);
    expect(conflicts.map((conflict) => conflict.targetId)).toEqual(['B', 'C', 'C']);
  });

  it('T4: handles an overlap after midnight with absolute minutes', () => {
    const conflicts = sweep([ev('A', 'Mon 23:00', 'Tue 01:00'), ev('B', 'Tue 00:30', 'Tue 01:30')]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      key: 'A|B',
      overlap: iv('Tue 00:30', 'Tue 01:00'),
      minutes: 30,
    });
  });

  it('orders aId < bId by string even when the larger id starts first', () => {
    const conflicts = sweep([ev('Z', 'Mon 09:00', 'Mon 11:00'), ev('M', 'Mon 10:00', 'Mon 12:00')]);

    expect(conflicts[0]).toMatchObject({ key: 'M|Z', aId: 'M', bId: 'Z' });
  });

  it('reports a nested event once, with the inner event as the overlap', () => {
    const conflicts = sweep([ev('A', 'Mon 09:00', 'Mon 12:00'), ev('B', 'Mon 10:00', 'Mon 10:15')]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ overlap: iv('Mon 10:00', 'Mon 10:15'), minutes: 15 });
  });

  it('returns no conflicts for no events, and does not mutate its input', () => {
    const events = [ev('B', 'Mon 10:00', 'Mon 11:00'), ev('A', 'Mon 10:30', 'Mon 11:30')];
    const before = structuredClone(events);

    expect(detectConflicts([])).toEqual([]);
    sweep(events);
    expect(events).toEqual(before);
  });
});

describe('countOverlaps', () => {
  it('counts the events that overlap the candidate, ignoring touching ones', () => {
    const events = [
      ev('A', 'Mon 09:00', 'Mon 10:00'),
      ev('B', 'Mon 10:30', 'Mon 11:30'),
      ev('C', 'Mon 11:00', 'Mon 12:00'),
      ev('D', 'Mon 12:00', 'Mon 13:00'),
    ];

    expect(countOverlaps(iv('Mon 10:00', 'Mon 12:00'), events)).toBe(2);
    expect(countOverlaps(iv('Mon 13:00', 'Mon 14:00'), events)).toBe(0);
    expect(countOverlaps(iv('Mon 10:00', 'Mon 12:00'), [])).toBe(0);
  });
});
