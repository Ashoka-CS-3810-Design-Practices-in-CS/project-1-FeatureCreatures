import type { ReplanMove } from '@/shared/types';
import { ev, flexEv, iv, settings } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { t } from '../../../../tests/helpers/time';
import { combinedNotMoved, compactMoveTime, moveReasonChip, movesByDay } from './replanView';

// PRE: id is nonempty; from/to are valid one-hour intervals
// POST: returns a flexible-event move with a valid named-strategy reason
function move(id: string, from: [string, string], to: [string, string]): ReplanMove {
  return {
    eventId: id,
    title: id,
    priority: 'medium',
    from: iv(...from),
    to: iv(...to),
    reason: { kind: 'strategy', strategy: 'frontLoad' },
  };
}

describe('T55: Replan presentation derivation', () => {
  it('groups moves by destination day/time, formats same/cross-day starts and preserves input order', () => {
    const late = move('Late', ['Tue 10:00', 'Tue 11:00'], ['Tue 16:00', 'Tue 17:00']);
    const cross = move('Cross', ['Wed 14:00', 'Wed 15:00'], ['Mon 09:00', 'Mon 10:00']);
    const early = move('Early', ['Tue 12:00', 'Tue 13:00'], ['Tue 09:00', 'Tue 10:00']);
    const moves = [late, cross, early];
    expect(movesByDay(moves)).toEqual([
      { day: t('Mon 00:00'), moves: [cross] },
      { day: t('Tue 00:00'), moves: [early, late] },
    ]);
    expect(moves).toEqual([late, cross, early]);
    expect(compactMoveTime(late)).toBe('10:00 → 16:00');
    expect(compactMoveTime(cross)).toBe('Wed 4 Nov 14:00 → Mon 2 Nov 09:00');
  });

  it('retains plan-local issue names while deduplicating shared diagnostics and problem labels', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Class', 'Mon 13:00', 'Mon 14:00'),
        flexEv('Move', 'Tue 14:00', 'Tue 15:00', ['Mon 09:00', 'Wed 18:00']),
      ],
      settings: settings({
        barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
      }),
    });
    const result = engine.planReplan({
      range: iv('Mon 00:00', 'Thu 00:00'),
      strategy: 'frontLoad',
    });
    if (!result.ok) throw new Error(result.error.code);
    const combined = combinedNotMoved(result.value);
    expect(combined).toHaveLength(1);
    expect(combined[0]).toMatchObject({
      eventId: 'Class',
      barredLabels: ['Lunch'],
      planNames: ['Minimal change', 'Front-load'],
    });
    const local = combinedNotMoved({
      ...result.value,
      notMoved: { ...result.value.notMoved, balanced: [] },
    });
    expect(local[0]?.planNames).toEqual(['Minimal change']);
    expect(result.value.notMoved.balanced).toHaveLength(1);
  });

  it.each([
    [{ kind: 'outsideFlexWindow' }, 'outside window'],
    [{ kind: 'outsideWorkingHours' }, 'working hours'],
    [{ kind: 'barred', label: 'Lunch' }, 'barred'],
    [{ kind: 'conflict', withEventId: 'A', withTitle: 'A' }, 'conflict'],
    [{ kind: 'buffer', withEventId: 'A', withTitle: 'A' }, 'buffer'],
    [{ kind: 'balance', fromDayLoadMin: 120, toDayLoadMin: 0 }, 'balance'],
  ] as const)('shows the short reason chip %s', (reason, text) => {
    expect(moveReasonChip(reason)).toBe(text);
  });
});
