import { ev, flexEv, iv, settings } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';

const RANGE = iv('Mon 00:00', 'Thu 00:00');
const LUNCH = settings({
  barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1, 2, 3, 4, 5] }],
});

describe('WI-38 per-plan diagnostics', () => {
  it('classifies each unresolved event once, scopes to range and ignores touching boundaries', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 13:15',
      settings: LUNCH,
      events: [
        ev('Fixed', 'Mon 13:00', 'Mon 13:30'),
        flexEv('Started', 'Mon 13:00', 'Mon 14:00', ['Mon 09:00', 'Mon 18:00']),
        flexEv('Blocked', 'Tue 13:00', 'Tue 14:00', ['Tue 13:00', 'Tue 14:00']),
        flexEv('Outside', 'Wed 13:00', 'Wed 14:00', ['Thu 09:00', 'Thu 10:00']),
        ev('Boundary', 'Tue 14:00', 'Tue 15:00'),
        ev('Beyond', 'Fri 13:00', 'Fri 14:00'),
      ],
    });
    const result = engine.planReplan({ range: RANGE });
    expect(result).toMatchObject({
      ok: true,
      value: {
        notMoved: {
          minimalChange: [
            {
              eventId: 'Fixed',
              reason: 'fixed',
              barredLabels: ['Lunch'],
              conflictTitles: ['Started'],
            },
            {
              eventId: 'Started',
              reason: 'started',
              barredLabels: ['Lunch'],
              conflictTitles: ['Fixed'],
            },
            { eventId: 'Blocked', reason: 'noSlot', barredLabels: ['Lunch'], conflictTitles: [] },
            {
              eventId: 'Outside',
              reason: 'outsideFlexWindow',
              barredLabels: ['Lunch'],
              conflictTitles: [],
            },
          ],
          balanced: [
            { eventId: 'Fixed', reason: 'fixed' },
            { eventId: 'Started', reason: 'started' },
            { eventId: 'Blocked', reason: 'noSlot' },
            { eventId: 'Outside', reason: 'outsideFlexWindow' },
          ],
        },
      },
    });
  });

  it('reports fixed-only conflicts without barred slots, but removes problems solved by the plan', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Static A', 'Mon 09:00', 'Mon 10:00'),
        ev('Static B', 'Mon 09:30', 'Mon 10:30'),
        ev('Class', 'Tue 10:00', 'Tue 11:00'),
        flexEv('Study', 'Tue 10:00', 'Tue 11:00', ['Tue 09:00', 'Tue 18:00']),
      ],
    });
    const result = engine.planReplan({ range: RANGE });
    expect(result).toMatchObject({
      ok: true,
      value: {
        notMoved: {
          minimalChange: [
            {
              eventId: 'Static A',
              reason: 'fixed',
              barredLabels: [],
              conflictTitles: ['Static B'],
            },
            {
              eventId: 'Static B',
              reason: 'fixed',
              barredLabels: [],
              conflictTitles: ['Static A'],
            },
          ],
        },
      },
    });
  });

  it('does not diagnose a fixed event whose only conflict is resolved by moving its flexible partner', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Class', 'Mon 10:00', 'Mon 11:00'),
        flexEv('Study', 'Mon 10:00', 'Mon 11:00', ['Mon 09:00', 'Mon 18:00']),
      ],
    });
    expect(engine.planReplan({ range: RANGE })).toMatchObject({
      ok: true,
      value: { notMoved: { minimalChange: [], balanced: [] } },
    });
  });

  it('deduplicates repeated barred labels and conflicting titles for each event', async () => {
    const { engine } = await makeEngine({
      settings: settings({
        barredSlots: [
          ...LUNCH.barredSlots,
          { id: 'lunch-again', label: 'Lunch', startMin: 795, endMin: 825, days: [1] },
        ],
      }),
      events: [
        ev('A', 'Mon 13:00', 'Mon 14:00'),
        ev('B', 'Mon 13:15', 'Mon 13:45', { title: 'Meeting' }),
        ev('C', 'Mon 13:15', 'Mon 13:45', { title: 'Meeting' }),
      ],
    });
    const result = engine.planReplan({ range: RANGE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.notMoved.minimalChange).toHaveLength(3);
    expect(result.value.notMoved.minimalChange[0]).toMatchObject({
      eventId: 'A',
      barredLabels: ['Lunch'],
      conflictTitles: ['Meeting'],
    });
  });

  it('ignores conflicts whose overlap ends exactly at the range start', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('Crossing', '2026-11-01 23:00', 'Mon 01:00'),
        ev('Before', '2026-11-01 23:30', 'Mon 00:00'),
      ],
    });
    expect(engine.planReplan({ range: RANGE })).toMatchObject({
      ok: true,
      value: { notMoved: { minimalChange: [], balanced: [] } },
    });
  });
});
