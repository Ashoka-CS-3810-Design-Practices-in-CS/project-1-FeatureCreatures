// T42 — alternatives outside working hours (peer reports #3, #4, #9; WI-41).

import { ev, flexEv, iv, settings } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';
import { halfHourSlots, nearestSlots } from '../helpers/slots';

const gig = ev('Gig', 'Mon 21:00', 'Mon 22:00');
const show = ev('Show', 'Mon 21:30', 'Mon 22:30');
const CONSENT = { allowMoving: true, range: iv('2026-11-01 00:00', 'Wed 00:00') };

describe('T42: suggestAlternatives with useWorkingHours', () => {
  it('Any time searches the night around a night event', async () => {
    const { engine } = await makeEngine({ events: [gig, show] });

    const found = engine.suggestAlternatives({
      eventId: 'Gig',
      useWorkingHours: false,
      ...CONSENT,
    });

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.options.map((option) => option.slot)).toEqual(
      nearestSlots(
        [
          ...halfHourSlots('Mon 00:00', 'Mon 20:30', 60),
          ...halfHourSlots('Mon 22:30', 'Tue 23:00', 60),
        ],
        'Mon 21:00',
      ),
    );
  });

  it('Working hours only (and the default) give exactly today’s working-hours results', async () => {
    const { engine } = await makeEngine({ events: [gig, show] });

    const omitted = engine.suggestAlternatives({ eventId: 'Gig', ...CONSENT });
    const explicit = engine.suggestAlternatives({
      eventId: 'Gig',
      useWorkingHours: true,
      ...CONSENT,
    });

    expect(explicit).toEqual(omitted);
    expect(omitted.ok && omitted.value.options.map((option) => option.slot)).toEqual(
      nearestSlots(
        [
          ...halfHourSlots('Mon 09:00', 'Mon 17:00', 60),
          ...halfHourSlots('Tue 09:00', 'Tue 17:00', 60),
        ],
        'Mon 21:00',
      ),
    );
  });

  it('barred slots still apply when searching any time', async () => {
    const { engine } = await makeEngine({
      events: [gig, show],
      settings: settings({
        barredSlots: [{ id: 'b', label: 'Dinner', startMin: 19 * 60, endMin: 21 * 60, days: [1] }],
      }),
    });

    const found = engine.suggestAlternatives({
      eventId: 'Gig',
      useWorkingHours: false,
      ...CONSENT,
    });

    // 20:30–21:30 is gone (Dinner); the 21:00–21:30 stretch is too short.
    expect(found.ok && found.value.options.map((option) => option.slot)).toEqual(
      nearestSlots(
        [
          ...halfHourSlots('Mon 00:00', 'Mon 18:00', 60),
          ...halfHourSlots('Mon 22:30', 'Tue 23:00', 60),
        ],
        'Mon 21:00',
      ),
    );
  });

  it('an empty search names its cause: no working hours, entirely past, or fully barred', async () => {
    const weekend = flexEv('Hike', 'Sat 10:00', 'Sat 11:00', ['Sat 00:00', 'Sun 00:00']);
    const early = flexEv('Early', 'Mon 09:00', 'Mon 10:00', ['Mon 09:00', 'Mon 18:00']);
    const { engine: weekendEngine } = await makeEngine({ events: [weekend] });
    const { engine: pastEngine } = await makeEngine({ events: [early], now: 'Wed 12:00' });
    const { engine: barredEngine } = await makeEngine({
      events: [early],
      settings: settings({
        barredSlots: [
          { id: 'b', label: 'Lab', startMin: 9 * 60, endMin: 18 * 60, days: [1, 2, 3, 4, 5] },
        ],
      }),
    });

    expect(weekendEngine.suggestAlternatives({ eventId: 'Hike' })).toEqual({
      ok: false,
      error: {
        code: 'TaskLongerThanWindow',
        durationMin: 60,
        longestStretchMin: 0,
        emptyCause: 'noWorkingHours',
      },
    });
    expect(pastEngine.suggestAlternatives({ eventId: 'Early' })).toMatchObject({
      error: { code: 'TaskLongerThanWindow', longestStretchMin: 0, emptyCause: 'past' },
    });
    expect(barredEngine.suggestAlternatives({ eventId: 'Early' })).toMatchObject({
      error: { code: 'TaskLongerThanWindow', longestStretchMin: 0, emptyCause: 'barred' },
    });
    expect(
      weekendEngine.suggestAlternatives({ eventId: 'Hike', useWorkingHours: false }),
    ).toMatchObject({ ok: true });
  });
});
