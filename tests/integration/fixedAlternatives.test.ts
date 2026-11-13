import { ev, flexEv, iv } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';

const FIXED = ev('Lecture', 'Mon 10:00', 'Mon 11:00');
const THURSDAY = iv('Thu 09:00', 'Thu 10:00');

describe('T50: fixed alternatives require explicit temporary consent (D-02)', () => {
  it('returns no suggestions for a fixed event without opt-in, even when a range is supplied', async () => {
    const { engine, repo } = await makeEngine({ events: [FIXED] });
    const before = await capture(engine, repo);
    const request = { eventId: FIXED.id, allowMoving: false, range: THURSDAY };
    expect(engine.suggestAlternatives({ eventId: FIXED.id })).toMatchObject({
      ok: true,
      value: { options: [], freeGaps: [], fittingCount: 0, segmentCount: 0 },
    });
    expect(engine.suggestAlternatives(request)).toMatchObject({ ok: true, value: { options: [] } });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('searches the explicit range beyond the removed three-day window, with no writes', async () => {
    const { engine, repo } = await makeEngine({ events: [FIXED] });
    const before = await capture(engine, repo);
    const request = { eventId: FIXED.id, allowMoving: true, range: THURSDAY };
    const found = engine.suggestAlternatives(request);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.searchWindow).toEqual(THURSDAY);
    expect(found.value.options.map((option) => option.slot)).toEqual([THURSDAY]);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it.each([
    undefined,
    { start: THURSDAY.end, end: THURSDAY.start },
    { start: THURSDAY.start + 0.5, end: THURSDAY.end },
  ])('rejects the invalid opted-in range %j as InvalidTime', async (range) => {
    const { engine, repo } = await makeEngine({ events: [FIXED] });
    const before = await capture(engine, repo);
    const request = { eventId: FIXED.id, allowMoving: true, range };
    expect(engine.suggestAlternatives(request)).toMatchObject({
      ok: false,
      error: {
        code: 'InvalidTime',
        issues: [expect.objectContaining({ path: expect.stringMatching(/^range/) })],
      },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('keeps a flexible search inside its own window without requiring opt-in', async () => {
    const flexible = flexEv('Study', 'Mon 10:00', 'Mon 11:00', ['Mon 09:00', 'Mon 12:00']);
    const { engine } = await makeEngine({ events: [flexible] });
    const request = { eventId: flexible.id, allowMoving: false, range: THURSDAY };
    const found = engine.suggestAlternatives(request);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.searchWindow).toEqual(iv('Mon 09:00', 'Mon 12:00'));
    expect(found.value.options.map((option) => option.slot)).toEqual([
      iv('Mon 10:00', 'Mon 11:00'),
      iv('Mon 09:30', 'Mon 10:30'),
      iv('Mon 10:30', 'Mon 11:30'),
      iv('Mon 09:00', 'Mon 10:00'),
      iv('Mon 11:00', 'Mon 12:00'),
    ]);
  });

  it('applying an opted-in fixed option keeps it Fixed with no stored window and can be undone', async () => {
    const { engine } = await makeEngine({ events: [FIXED] });
    const request = { eventId: FIXED.id, allowMoving: true, range: THURSDAY };
    const found = engine.suggestAlternatives(request);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(
      (
        await engine.applyAlternative({
          eventId: FIXED.id,
          slot: THURSDAY,
          baseVersion: found.value.baseVersion,
        })
      ).ok,
    ).toBe(true);
    expect(engine.snapshot().events[0]).toMatchObject({
      ...THURSDAY,
      flexible: false,
      flexWindow: null,
    });
    expect((await engine.undo()).ok).toBe(true);
    expect(engine.snapshot().events).toEqual([FIXED]);
  });
});
