import type { Boundary, FreeGap, Segment } from '@/shared/types';
import { ev, iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { freeGaps, largestGap } from './gaps';
import { mergeBusy } from './merge';

// PRE:  from and to are valid t() specs with from < to
// POST: returns the segment [t(from), t(to)) with workStart / workEnd edges
function segment(from: string, to: string): Segment {
  return {
    ...iv(from, to),
    startEdge: { kind: 'edge', reason: 'workStart', at: t(from) },
    endEdge: { kind: 'edge', reason: 'workEnd', at: t(to) },
  };
}

// PRE:  id names an event; at is a valid t() spec; bufferMin ≥ 0
// POST: returns the event boundary freeGaps reports for that event at t(at)
function eventEdge(id: string, at: string, bufferMin = 0): Boundary {
  return { kind: 'event', eventId: id, title: id, at: t(at), bufferMin };
}

describe('freeGaps (BR-6)', () => {
  it('T6 shape: names the event or segment edge on both sides of every gap', () => {
    const busy = mergeBusy(
      [
        ev('A', 'Mon 09:00', 'Mon 10:00'),
        ev('B', 'Mon 10:30', 'Mon 12:00'),
        ev('C', 'Mon 13:00', 'Mon 14:00'),
      ],
      0,
    );

    expect(freeGaps([segment('Mon 09:00', 'Mon 18:00')], busy)).toEqual([
      {
        ...iv('Mon 10:00', 'Mon 10:30'),
        before: eventEdge('A', 'Mon 10:00'),
        after: eventEdge('B', 'Mon 10:30'),
      },
      {
        ...iv('Mon 12:00', 'Mon 13:00'),
        before: eventEdge('B', 'Mon 12:00'),
        after: eventEdge('C', 'Mon 13:00'),
      },
      {
        ...iv('Mon 14:00', 'Mon 18:00'),
        before: eventEdge('C', 'Mon 14:00'),
        after: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    ]);
  });

  it('reports the buffer and the unbuffered event time on event boundaries (T11 ii)', () => {
    const busy = mergeBusy([ev('E', 'Mon 10:00', 'Mon 11:00')], 15);

    expect(freeGaps([segment('Mon 09:00', 'Mon 12:00')], busy)).toEqual([
      {
        ...iv('Mon 09:00', 'Mon 09:45'),
        before: { kind: 'edge', reason: 'workStart', at: t('Mon 09:00') },
        after: eventEdge('E', 'Mon 10:00', 15),
      },
      {
        ...iv('Mon 11:15', 'Mon 12:00'),
        before: eventEdge('E', 'Mon 11:00', 15),
        after: { kind: 'edge', reason: 'workEnd', at: t('Mon 12:00') },
      },
    ]);
  });

  it('lets one block cover the end of a segment and the start of the next', () => {
    const busy = mergeBusy([ev('Night', 'Mon 17:00', 'Tue 10:00')], 0);
    const gaps = freeGaps(
      [segment('Mon 09:00', 'Mon 18:00'), segment('Tue 09:00', 'Tue 18:00')],
      busy,
    );

    expect(gaps.map(({ start, end }) => ({ start, end }))).toEqual([
      iv('Mon 09:00', 'Mon 17:00'),
      iv('Tue 10:00', 'Tue 18:00'),
    ]);
    expect(gaps[0]?.after).toEqual(eventEdge('Night', 'Mon 17:00'));
    expect(gaps[1]?.before).toEqual(eventEdge('Night', 'Tue 10:00'));
  });

  it('ignores blocks before the first segment and after the last', () => {
    const busy = mergeBusy(
      [ev('Early', 'Mon 07:00', 'Mon 08:00'), ev('Late', 'Mon 19:00', 'Mon 20:00')],
      0,
    );

    expect(freeGaps([segment('Mon 09:00', 'Mon 18:00')], busy)).toEqual([
      {
        ...iv('Mon 09:00', 'Mon 18:00'),
        before: { kind: 'edge', reason: 'workStart', at: t('Mon 09:00') },
        after: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    ]);
  });

  it('returns no gap for a fully covered segment, and none for no segments', () => {
    const busy = mergeBusy([ev('All', 'Mon 08:00', 'Mon 19:00')], 0);

    expect(freeGaps([segment('Mon 09:00', 'Mon 18:00')], busy)).toEqual([]);
    expect(freeGaps([], busy)).toEqual([]);
  });
});

describe('largestGap', () => {
  const edgeAt = (at: number): Boundary => ({ kind: 'edge', reason: 'now', at });
  const gap = (start: number, end: number): FreeGap => ({
    start,
    end,
    before: edgeAt(start),
    after: edgeAt(end),
  });

  it('returns the first of the longest gaps, or null when there are none', () => {
    const first = gap(0, 15);
    const tied = gap(30, 45);

    expect(largestGap([gap(-10, -5), first, tied, gap(50, 55)])).toBe(first);
    expect(largestGap([])).toBeNull();
  });
});
