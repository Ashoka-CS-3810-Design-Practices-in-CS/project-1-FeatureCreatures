import { buildDayFrames } from '@/shared/time';
import { ev, flexEv, iv, settings, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { t } from '../helpers/time';

const SATURDAY_LUNCH = {
  id: 'lunch',
  label: 'Lunch',
  startMin: 780,
  endMin: 840,
  days: [6] as const,
};
const ANY_DAY_SETTINGS = settings({ useWorkingHours: false, barredSlots: [SATURDAY_LUNCH] });

describe('T53: optional working hours (D-10)', () => {
  it('builds whole-day work/load frames on non-working days while retaining barred slots and saved hours', () => {
    const original = structuredClone(ANY_DAY_SETTINGS);
    const frames = buildDayFrames(iv('Sat 00:00', 'Sun 00:00'), ANY_DAY_SETTINGS);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.work).toEqual(iv('Sat 00:00', 'Sun 00:00'));
    expect(frames[0]?.barred).toEqual([{ label: 'Lunch', interval: iv('Sat 13:00', 'Sat 14:00') }]);
    expect(ANY_DAY_SETTINGS).toEqual(original);
  });

  it('Find time ignores task working-hours preference when globally off, keeps bars, and restores the saved rules when on', async () => {
    const { engine, repo } = await makeEngine({
      settings: ANY_DAY_SETTINGS,
      tasks: [task('Weekend', 60, ['Sat 00:00', 'Sun 00:00'])],
    });
    const before = await capture(engine, repo);
    const found = engine.findSlots({ taskId: 'Weekend' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.options[0]?.slot).toEqual(iv('Sat 00:00', 'Sat 01:00'));
    expect(found.value.options.at(-1)?.slot).toEqual(iv('Sat 23:00', 'Sun 00:00'));
    expect(found.value.options.map((option) => option.slot)).toEqual(
      expect.arrayContaining([iv('Sat 12:00', 'Sat 13:00'), iv('Sat 14:00', 'Sat 15:00')]),
    );
    expect(
      found.value.options.every(
        ({ slot }) => slot.end <= t('Sat 13:00') || slot.start >= t('Sat 14:00'),
      ),
    ).toBe(true);
    expect(await capture(engine, repo)).toEqual(before);
    expect((await engine.updateSettings({ ...ANY_DAY_SETTINGS, useWorkingHours: true })).ok).toBe(
      true,
    );
    expect(engine.findSlots({ taskId: 'Weekend' })).toMatchObject({
      ok: false,
      error: { code: 'TaskLongerThanWindow', longestStretchMin: 0 },
    });
    expect(engine.snapshot().tasks[0]?.useWorkingHours).toBe(true);
  });

  it('alternatives ignores an explicit working-hours request when globally off and still avoids bars', async () => {
    const { engine, repo } = await makeEngine({
      settings: ANY_DAY_SETTINGS,
      events: [
        flexEv('Night', 'Sat 21:00', 'Sat 22:00', ['Sat 00:00', 'Sun 00:00']),
        ev('Busy', 'Sat 21:00', 'Sat 22:00'),
      ],
    });
    const before = await capture(engine, repo);
    const found = engine.suggestAlternatives({ eventId: 'Night', useWorkingHours: true });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.options[0]?.slot).toEqual(iv('Sat 20:00', 'Sat 21:00'));
    expect(
      found.value.options.every(
        ({ slot }) => slot.end <= t('Sat 13:00') || slot.start >= t('Sat 14:00'),
      ),
    ).toBe(true);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('Replan keeps a valid night/weekend event and counts its whole-day load', async () => {
    const { engine, repo } = await makeEngine({
      settings: ANY_DAY_SETTINGS,
      events: [flexEv('Night', 'Sat 21:00', 'Sat 22:00', ['Sat 00:00', 'Sun 00:00'])],
    });
    const before = await capture(engine, repo);
    const result = engine.planReplan({ range: iv('Sat 00:00', '2026-11-09 00:00') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plans[0].moves).toEqual([]);
    expect(result.value.plans[0].unplaced).toEqual([]);
    expect(result.value.plans.map((plan) => plan.metrics.loadSpreadBeforeMin)).toEqual([60, 60]);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('Replan keeps a valid event across midnight when working hours are off', async () => {
    const { engine } = await makeEngine({
      settings: settings({ useWorkingHours: false }),
      events: [flexEv('Overnight', 'Mon 23:30', 'Tue 00:30', ['Mon 22:00', 'Tue 03:00'])],
    });
    const result = engine.planReplan({ range: iv('Mon 00:00', 'Wed 00:00') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plans[0].moves).toEqual([]);
    expect(result.value.plans[0].unplaced).toEqual([]);
  });

  it('Replan still moves a cross-midnight event out of a barred slot on its second day', async () => {
    const { engine } = await makeEngine({
      settings: settings({
        useWorkingHours: false,
        barredSlots: [{ id: 'break', label: 'Break', startMin: 0, endMin: 60, days: [2] }],
      }),
      events: [flexEv('Overnight', 'Mon 23:30', 'Tue 00:30', ['Mon 22:00', 'Tue 03:00'])],
    });
    const result = engine.planReplan({ range: iv('Mon 00:00', 'Wed 00:00') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plans[0].moves).toMatchObject([
      {
        eventId: 'Overnight',
        to: iv('Mon 23:00', 'Tue 00:00'),
        reason: { kind: 'barred', label: 'Break' },
      },
    ]);
  });

  it('least-loaded task options count night bookings when working hours are off', async () => {
    const { engine } = await makeEngine({
      settings: settings({ useWorkingHours: false }),
      events: [ev('Night', 'Mon 21:00', 'Mon 22:00')],
      tasks: [task('Low', 60, ['Mon 00:00', 'Tue 00:00'], { priority: 'low' })],
    });
    const found = engine.findSlots({ taskId: 'Low', criterion: 'priorityAware' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.options.length).toBeGreaterThan(0);
    expect(found.value.options.every((option) => option.dayLoadMin === 60)).toBe(true);
  });
});
