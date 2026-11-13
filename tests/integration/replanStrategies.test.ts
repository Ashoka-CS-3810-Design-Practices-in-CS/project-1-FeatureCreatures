import { flexEv, iv } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import type { ReplanStrategy } from '@/shared/types';

describe('T55: Replan strategy facade contract', () => {
  it('validates an unknown strategy without changing state, history or storage', async () => {
    const { engine, repo } = await makeEngine();
    const before = await capture(engine, repo);
    const request = { range: iv('Mon 00:00', 'Thu 00:00'), strategy: 'unknown' as ReplanStrategy };
    expect(engine.planReplan(request)).toMatchObject({
      ok: false,
      error: { code: 'InvalidInput', issues: [{ path: 'strategy' }] },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('returns the selected strategy and applies the second plan atomically with undo', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('Move', 'Tue 14:00', 'Tue 15:00', ['Mon 09:00', 'Wed 18:00'])],
    });
    const before = engine.snapshot();
    const request = { range: iv('Mon 00:00', 'Thu 00:00'), strategy: 'frontLoad' as const };
    const result = engine.planReplan(request);
    expect(result).toMatchObject({ ok: true, value: { strategy: 'frontLoad' } });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.plans[1].id).toBe('balanced');
    expect(result.value.plans[1].moves[0]?.to).toEqual(iv('Mon 09:00', 'Mon 10:00'));
    expect(
      (await engine.applyReplan({ baseVersion: result.value.baseVersion, planId: 'balanced' })).ok,
    ).toBe(true);
    expect(engine.snapshot().events[0]).toMatchObject(iv('Mon 09:00', 'Mon 10:00'));
    expect((await engine.undo()).ok).toBe(true);
    expect(engine.snapshot().events).toEqual(before.events);
  });
});
