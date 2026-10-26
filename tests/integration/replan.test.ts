import { MAX_REPLAN_DAYS, MINUTES_PER_DAY } from '@/shared/constants';
import type { Result } from '@/shared/result';
import { ev, flexEv, iv, settings } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { t } from '../helpers/time';

const RANGE = iv('Mon 00:00', 'Sat 00:00');
const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];
const lecture = ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' });

// PRE:  result is any Result
// POST: returns its value; throws with the error otherwise, so the failing step is obvious
function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe('planReplan (T22, FR10, BR-12)', () => {
  it('builds both plans over the range with their metrics', async () => {
    const { engine } = await makeEngine({
      events: [
        lecture,
        flexEv('Study', 'Mon 11:00', 'Mon 12:00', WINDOW, { priority: 'low' }),
        flexEv('Gym', 'Tue 15:00', 'Tue 16:00', WINDOW, { priority: 'medium' }),
      ],
    });

    const result = expectOk(engine.planReplan({ range: RANGE }));

    expect(result).toMatchObject({ baseVersion: 0, range: RANGE, bufferMin: 0, movableCount: 2 });
    const [minimal, balanced] = result.plans;
    const conflict = { kind: 'conflict', withEventId: 'Lecture', withTitle: 'Lecture' };
    expect(
      minimal.moves.map(({ eventId, from, to, reason }) => ({ eventId, from, to, reason })),
    ).toEqual([
      {
        eventId: 'Study',
        from: iv('Mon 11:00', 'Mon 12:00'),
        to: iv('Mon 12:00', 'Mon 13:00'),
        reason: conflict,
      },
    ]);
    expect(minimal.metrics).toEqual({
      moved: 1,
      totalShiftMin: 60,
      conflictsBefore: 1,
      conflictsAfter: 0,
      loadSpreadBeforeMin: 180,
      loadSpreadAfterMin: 180,
      unplaced: 0,
    });
    expect(balanced.moves.map(({ eventId, to, reason }) => ({ eventId, to, reason }))).toEqual([
      { eventId: 'Study', to: iv('Wed 09:00', 'Wed 10:00'), reason: conflict },
    ]);
    expect(balanced.metrics).toMatchObject({
      moved: 1,
      totalShiftMin: 2760,
      conflictsBefore: 1,
      conflictsAfter: 0,
      loadSpreadBeforeMin: 180,
      loadSpreadAfterMin: 120,
    });
  });

  it('T28 (c): a flexible event that has already started is never movable', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 12:07',
      events: [flexEv('Started', 'Mon 11:00', 'Mon 12:00', WINDOW)],
    });

    const result = expectOk(engine.planReplan({ range: RANGE }));

    expect(result.movableCount).toBe(0);
    expect(result.plans.flatMap((plan) => plan.moves)).toEqual([]);
  });

  it('uses the settings buffer unless overridden, and validates range and buffer', async () => {
    const { engine } = await makeEngine({ settings: settings({ bufferMin: 10 }) });

    expect(expectOk(engine.planReplan({ range: RANGE })).bufferMin).toBe(10);
    expect(expectOk(engine.planReplan({ range: RANGE, bufferMin: 0 })).bufferMin).toBe(0);
    const badRange = { code: 'InvalidTime', issues: [{ path: 'range' }] };
    const empty = engine.planReplan({ range: iv('Mon 00:00', 'Mon 00:00') });
    expect(empty.ok ? null : empty.error).toMatchObject(badRange);
    const tooLong = engine.planReplan({
      range: {
        start: t('Mon 00:00'),
        end: t('Mon 00:00') + (MAX_REPLAN_DAYS + 1) * MINUTES_PER_DAY,
      },
    });
    expect(tooLong.ok ? null : tooLong.error).toMatchObject(badRange);
    const badBuffer = engine.planReplan({ range: RANGE, bufferMin: 200 });
    expect(badBuffer.ok ? null : badBuffer.error.code).toBe('InvalidInput');
  });
});

describe('applyReplan (T23, T27)', () => {
  const read = flexEv('Read', 'Mon 14:00', 'Mon 15:00', WINDOW, { priority: 'low' });

  it('T23: Minimal change has nothing to do; Balanced moves Read for balance in one step', async () => {
    const { engine, repo } = await makeEngine({
      events: [ev('Lecture', 'Mon 10:00', 'Mon 12:00'), read],
    });
    const plan = expectOk(engine.planReplan({ range: RANGE }));
    const [minimal, balanced] = plan.plans;
    expect(minimal.moves).toEqual([]);
    expect(balanced.moves.map(({ eventId, to, reason }) => ({ eventId, to, reason }))).toEqual([
      {
        eventId: 'Read',
        to: iv('Tue 09:00', 'Tue 10:00'),
        reason: { kind: 'balance', fromDayLoadMin: 120, toDayLoadMin: 0 },
      },
    ]);
    expect(balanced.metrics).toMatchObject({ loadSpreadBeforeMin: 180, loadSpreadAfterMin: 120 });

    const noOp = expectOk(
      await engine.applyReplan({ baseVersion: plan.baseVersion, planId: 'minimalChange' }),
    );
    expect(noOp.label).toBe('');
    expect(noOp.snapshot.version).toBe(plan.baseVersion);

    const applied = expectOk(
      await engine.applyReplan({ baseVersion: plan.baseVersion, planId: 'balanced' }),
    );
    expect(applied.label).toBe('Replan: 1 event moved');
    expect(applied.snapshot.undoLabel).toBe('Replan: 1 event moved');
    expect(applied.changedEventIds).toEqual(['Read']);
    expect(applied.snapshot.events.find((event) => event.id === 'Read')).toMatchObject(
      iv('Tue 09:00', 'Tue 10:00'),
    );
    expect((await repo.load()).events.find((event) => event.id === 'Read')).toMatchObject(
      iv('Tue 09:00', 'Tue 10:00'),
    );
  });

  it('labels a plan that moves several events in the plural', async () => {
    const { engine } = await makeEngine({
      events: [
        lecture,
        flexEv('A', 'Mon 10:00', 'Mon 11:00', WINDOW),
        flexEv('B', 'Mon 11:00', 'Mon 12:00', WINDOW),
      ],
    });
    const plan = expectOk(engine.planReplan({ range: RANGE }));

    const applied = expectOk(
      await engine.applyReplan({ baseVersion: plan.baseVersion, planId: 'minimalChange' }),
    );

    expect(applied.label).toBe('Replan: 2 events moved');
    expect(applied.snapshot.conflicts).toEqual([]);
  });

  it('T27 (replan): a plan made before any change is StaleResult and changes nothing', async () => {
    const { engine, repo } = await makeEngine({ events: [lecture, read] });
    const plan = expectOk(engine.planReplan({ range: RANGE }));
    expectOk(await engine.updateSettings(settings({ bufferMin: 5 })));
    const before = await capture(engine, repo);

    const stale = await engine.applyReplan({ baseVersion: plan.baseVersion, planId: 'balanced' });

    expect(stale).toEqual({ ok: false, error: { code: 'StaleResult' } });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('is StaleResult without a plan, or for a baseVersion other than the plan’s', async () => {
    const { engine } = await makeEngine({ events: [lecture, read] });

    expect(await engine.applyReplan({ baseVersion: 0, planId: 'balanced' })).toEqual({
      ok: false,
      error: { code: 'StaleResult' },
    });
    expectOk(engine.planReplan({ range: RANGE }));
    expect(await engine.applyReplan({ baseVersion: 7, planId: 'balanced' })).toEqual({
      ok: false,
      error: { code: 'StaleResult' },
    });
  });
});

// AUDIT A07: data versions do not change when time passes, so applying used to move an event
// that had started since, or to place work in the past (FR10, BR-5).
describe('elapsed time makes a result stale (ER7)', () => {
  it('applyReplan refuses a plan whose moved event has started since it was computed', async () => {
    const { engine, repo, setNow } = await makeEngine({
      now: 'Mon 08:00',
      events: [
        ev('Seminar', 'Mon 09:30', 'Mon 10:30'),
        flexEv('Soon', 'Mon 09:30', 'Mon 10:30', WINDOW),
      ],
    });
    const plans = expectOk(engine.planReplan({ range: RANGE }));
    expect(plans.plans[0].moves.map((move) => move.eventId)).toEqual(['Soon']);
    setNow('Mon 09:45');
    const before = await capture(engine, repo);

    const result = await engine.applyReplan({
      baseVersion: plans.baseVersion,
      planId: 'minimalChange',
    });

    expect(result).toEqual({ ok: false, error: { code: 'StaleResult' } });
    expect(await capture(engine, repo)).toEqual(before);
  });
});
