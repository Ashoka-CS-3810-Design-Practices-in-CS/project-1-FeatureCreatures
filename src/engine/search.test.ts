import type { CalendarEvent } from '@/shared/types';
import { ev, iv, settings } from '../../tests/helpers/builders';
import { t } from '../../tests/helpers/time';
import { search, segmentsFor, type SearchRequest } from './search';
import { createState } from './state';

// PRE:  events have distinct ids
// POST: returns a state over events with default settings (Mon–Fri 09:00–18:00, buffer 0)
function stateOf(events: CalendarEvent[], bufferMin = 0) {
  return createState({ events, tasks: [], settings: settings({ bufferMin }) });
}

// PRE:  overrides holds any subset of SearchRequest
// POST: returns a task search for 60 min over Mon 09:00–18:00, earliest, buffer 0, with overrides
function request(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    durationMin: 60,
    priority: 'medium',
    window: iv('Mon 09:00', 'Mon 18:00'),
    useWorkingHours: true,
    excludeIds: [],
    originalStart: null,
    criterion: 'earliest',
    bufferMin: 0,
    subject: { kind: 'task', taskId: 'T', name: 'T' },
    ...overrides,
  };
}

const MONDAY = t('Mon 00:00');

describe('search', () => {
  it('T6: gaps, fitting count, the one option and its boundaries', () => {
    const state = stateOf([
      ev('E1', 'Mon 09:00', 'Mon 10:00'),
      ev('E2', 'Mon 10:30', 'Mon 12:00'),
      ev('E3', 'Mon 13:00', 'Mon 14:00'),
    ]);

    const result = search(state, request({ durationMin: 90 }), MONDAY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.freeGaps.map(({ start, end }) => ({ start, end }))).toEqual([
      iv('Mon 10:00', 'Mon 10:30'),
      iv('Mon 12:00', 'Mon 13:00'),
      iv('Mon 14:00', 'Mon 18:00'),
    ]);
    expect(result.value).toMatchObject({
      baseVersion: 0,
      segmentCount: 1,
      fittingCount: 1,
      searchWindow: iv('Mon 09:00', 'Mon 18:00'),
    });
    expect(result.value.options).toHaveLength(1);
    expect(result.value.options[0]).toMatchObject({
      rank: 1,
      slot: iv('Mon 14:00', 'Mon 15:30'),
      gapMin: 240,
      leftoverMin: 150,
      gap: {
        before: { kind: 'event', eventId: 'E3', at: t('Mon 14:00'), bufferMin: 0 },
        after: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    });
  });

  it('T8: a task longer than every allowed stretch is TaskLongerThanWindow (ER2)', () => {
    expect(search(stateOf([]), request({ durationMin: 600 }), MONDAY)).toEqual({
      ok: false,
      error: { code: 'TaskLongerThanWindow', durationMin: 600, longestStretchMin: 540 },
    });
  });

  it('T9: no fitting gap is NoSlotFound with the largest gap (ER3)', () => {
    const state = stateOf([ev('A', 'Mon 09:00', 'Mon 12:00'), ev('B', 'Mon 12:15', 'Mon 18:00')]);

    expect(search(state, request({ durationMin: 30 }), MONDAY)).toEqual({
      ok: false,
      error: {
        code: 'NoSlotFound',
        durationMin: 30,
        largestGapMin: 15,
        largestGap: iv('Mon 12:00', 'Mon 12:15'),
        bufferMin: 0,
      },
    });
  });

  it('T11 (ii): the buffer shrinks the free time around events', () => {
    const state = stateOf([ev('E', 'Mon 10:00', 'Mon 11:00')]);
    const window = iv('Mon 09:00', 'Mon 12:00');

    expect(search(state, request({ window, bufferMin: 15 }), MONDAY)).toEqual({
      ok: false,
      error: {
        code: 'NoSlotFound',
        durationMin: 60,
        largestGapMin: 45,
        largestGap: iv('Mon 09:00', 'Mon 09:45'),
        bufferMin: 15,
      },
    });
  });

  it('reports a NoSlotFound gap of 0 when everything is busy, and skips excluded events', () => {
    const state = stateOf([ev('All', 'Mon 08:00', 'Mon 19:00')]);

    const blocked = search(state, request(), MONDAY);
    expect(blocked.ok ? null : blocked.error).toMatchObject({ largestGapMin: 0, largestGap: null });

    const excluded = search(state, request({ excludeIds: ['All'] }), MONDAY);
    expect(excluded.ok ? excluded.value.options[0]?.slot : null).toEqual(
      iv('Mon 09:00', 'Mon 10:00'),
    );
  });

  it('segmentsFor gives working-hours segments clipped at notBefore', () => {
    const toSegments = segmentsFor(stateOf([]), t('Mon 10:00'));

    expect(
      toSegments(iv('Mon 00:00', 'Tue 00:00')).map(({ start, end }) => ({ start, end })),
    ).toEqual([iv('Mon 10:00', 'Mon 18:00')]);
  });
});
