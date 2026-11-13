import { ev, flexEv, iv, settings } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';

const RANGE = iv('Mon 00:00', 'Tue 00:00');

describe('T52: past-time Replan diagnostics (D-08)', () => {
  it('omits past conflicts and barred overlaps at end = now, without changing detection or metrics', async () => {
    const { engine, repo } = await makeEngine({
      now: 'Mon 14:00',
      settings: settings({
        barredSlots: [{ id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] }],
      }),
      events: [
        ev('Long fixed', 'Mon 13:00', 'Mon 16:00'),
        flexEv('Ended', 'Mon 13:00', 'Mon 14:00', ['Mon 09:00', 'Mon 18:00']),
      ],
    });
    const before = await capture(engine, repo);
    const result = engine.planReplan({ range: RANGE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.notMoved).toEqual({ minimalChange: [], balanced: [] });
    expect(result.value.plans.map((plan) => plan.metrics.conflictsAfter)).toEqual([1, 1]);
    expect(engine.snapshot().conflicts).toHaveLength(1);
    expect(engine.snapshot().barredOverlaps).toHaveLength(2);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('keeps ongoing overlaps ending before rounded notBefore, using raw now for past classification', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 13:07',
      events: [
        ev('Fixed', 'Mon 13:00', 'Mon 14:00'),
        flexEv('Running', 'Mon 13:00', 'Mon 13:09', ['Mon 09:00', 'Mon 18:00']),
      ],
    });
    const result = engine.planReplan({ range: RANGE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.notMoved.minimalChange.map(({ eventId, reason }) => ({ eventId, reason })),
    ).toEqual([
      { eventId: 'Running', reason: 'started' },
      { eventId: 'Fixed', reason: 'fixed' },
    ]);
  });

  it('omits a running event whose only problem overlap has already ended', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 13:07',
      events: [
        ev('Long fixed', 'Mon 13:00', 'Mon 14:00'),
        ev('Finished', 'Mon 13:00', 'Mon 13:05'),
      ],
    });
    const result = engine.planReplan({ range: RANGE });
    expect(result).toMatchObject({
      ok: true,
      value: { notMoved: { minimalChange: [], balanced: [] } },
    });
  });

  it('never calls a not-yet-started event Already started just because snap rounding makes it static', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 13:07',
      events: [
        ev('Fixed', 'Mon 13:08', 'Mon 14:00'),
        flexEv('Future', 'Mon 13:08', 'Mon 13:09', ['Mon 09:00', 'Mon 18:00']),
      ],
    });
    const result = engine.planReplan({ range: RANGE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.notMoved.minimalChange.find((entry) => entry.eventId === 'Future'),
    ).toMatchObject({ reason: 'noSlot' });
  });
});
