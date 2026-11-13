import { parseInput, settingsSchema } from '@/shared/schemas';
import type { EventInput } from '@/shared/types';
import { ev, flexEv, iv, settings, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { FailingRepository } from '../helpers/failingRepository';

const LUNCH = { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1, 2] as const };
const TT = { id: 'tt', label: 'TT', startMin: 810, endMin: 870, days: [2, 1, 3] as const };
const BARRED_SETTINGS = settings({ barredSlots: [LUNCH] });
const EVENT = flexEv('A', 'Mon 13:00', 'Mon 14:00', ['Mon 09:00', 'Tue 18:00']);

describe('T53: barred-slot rules and Keep here (D-09)', () => {
  it('rejects partial overlap on shared weekdays, naming the first slot and Monday-first common days', () => {
    expect(parseInput(settingsSchema, settings({ barredSlots: [LUNCH, TT] }))).toEqual({
      ok: false,
      error: {
        code: 'InvalidInput',
        issues: [
          { path: 'barredSlots.1.days', message: 'Overlaps "Lunch" (13:00–14:00) on Mon, Tue.' },
        ],
      },
    });
  });

  it('accepts touching times and the same times on different weekdays', () => {
    expect(
      parseInput(settingsSchema, settings({ barredSlots: [LUNCH, { ...TT, startMin: 840 }] })).ok,
    ).toBe(true);
    expect(
      parseInput(settingsSchema, settings({ barredSlots: [LUNCH, { ...TT, days: [3] }] })).ok,
    ).toBe(true);
  });

  it('keeps legacy overlapping rows readable and permits unrelated settings saves but rejects a barred edit', async () => {
    const legacy = settings({ barredSlots: [LUNCH, TT] });
    const { engine, repo } = await makeEngine({ settings: legacy, events: [EVENT] });
    expect(engine.snapshot().settings.barredSlots).toEqual([LUNCH, TT]);
    expect((await engine.updateSettings({ ...legacy, bufferMin: 5 })).ok).toBe(true);
    const before = await capture(engine, repo);
    const result = await engine.updateSettings({
      ...legacy,
      barredSlots: [LUNCH, { ...TT, label: 'Renamed' }],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'InvalidInput' } });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('keeps and stops keeping one identified slot as one undo step, with persisted metadata and unchanged raw overlaps', async () => {
    const { engine, repo } = await makeEngine({ settings: BARRED_SETTINGS, events: [EVENT] });
    expect(engine.snapshot().barredOverlaps[0]).toMatchObject({ eventId: 'A', slotId: 'lunch' });
    expect((await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true })).ok).toBe(
      true,
    );
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual(['lunch']);
    expect((await repo.load()).events[0]?.keptInBarred).toEqual(['lunch']);
    expect(engine.snapshot().barredOverlaps).toHaveLength(1);
    expect((await engine.undo()).ok).toBe(true);
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
    expect(engine.snapshot().canUndo).toBe(false);
    expect((await engine.redo()).ok).toBe(true);
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual(['lunch']);
    expect((await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: false })).ok).toBe(
      true,
    );
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
    expect((await engine.undo()).ok).toBe(true);
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual(['lunch']);
  });

  it('is idempotent and validates unknown events/slots, non-overlaps and external input', async () => {
    const { engine, repo } = await makeEngine({
      settings: BARRED_SETTINGS,
      events: [EVENT, ev('B', 'Mon 10:00', 'Mon 11:00')],
    });
    await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
    const before = await capture(engine, repo);
    expect((await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true })).ok).toBe(
      true,
    );
    expect(await capture(engine, repo)).toEqual(before);
    expect(
      await engine.setBarredKept({ eventId: 'missing', slotId: 'lunch', kept: true }),
    ).toMatchObject({ ok: false, error: { code: 'NotFound' } });
    expect(
      await engine.setBarredKept({ eventId: 'A', slotId: 'missing', kept: true }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidInput' } });
    expect(await engine.setBarredKept({ eventId: 'B', slotId: 'lunch', kept: true })).toMatchObject(
      { ok: false, error: { code: 'InvalidInput' } },
    );
    expect(
      await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: 'yes' } as never),
    ).toMatchObject({ ok: false, error: { code: 'InvalidInput' } });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('does not replan a kept event solely for barred time, but still resolves an event conflict', async () => {
    const { engine } = await makeEngine({ settings: BARRED_SETTINGS, events: [EVENT] });
    await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
    const kept = engine.planReplan({ range: iv('Mon 00:00', 'Tue 00:00') });
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.value.plans[0].moves).toEqual([]);
    expect(kept.value.notMoved.minimalChange).toEqual([]);
    await engine.createEvent(ev('Busy', 'Mon 13:00', 'Mon 14:00'));
    const conflicted = engine.planReplan({ range: iv('Mon 00:00', 'Tue 00:00') });
    expect(conflicted.ok).toBe(true);
    if (!conflicted.ok) return;
    expect(conflicted.value.plans[0].moves).toMatchObject([
      { eventId: 'A', reason: { kind: 'conflict' } },
    ]);
    expect(conflicted.value.plans[0].moves[0]?.to).toEqual(iv('Mon 12:00', 'Mon 13:00'));
    expect(
      (
        await engine.applyReplan({
          baseVersion: conflicted.value.baseVersion,
          planId: 'minimalChange',
        })
      ).ok,
    ).toBe(true);
    expect(engine.snapshot().events.find((event) => event.id === 'A')?.keptInBarred).toEqual([]);
    await engine.undo();
    expect(engine.snapshot().events.find((event) => event.id === 'A')?.keptInBarred).toEqual([
      'lunch',
    ]);
  });

  it('identifies same-label slots separately and keeps the unkept slot as a Replan reason', async () => {
    const { engine } = await makeEngine({
      settings: settings({
        barredSlots: [
          { ...LUNCH, id: 'one', endMin: 810 },
          { ...LUNCH, id: 'two', startMin: 810 },
        ],
      }),
      events: [EVENT],
    });
    expect(engine.snapshot().barredOverlaps.map((warning) => warning.slotId)).toEqual([
      'one',
      'two',
    ]);
    await engine.setBarredKept({ eventId: 'A', slotId: 'one', kept: true });
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual(['one']);
    const plan = engine.planReplan({ range: iv('Mon 00:00', 'Tue 00:00') });
    expect(plan.ok && plan.value.plans[0].moves[0]?.reason).toEqual({
      kind: 'barred',
      label: 'Lunch',
    });
  });

  it('clears keeps on mirrored task-duration edits and restores them together with the task on Undo', async () => {
    const linked = task('T', 60, ['Mon 09:00', 'Tue 18:00'], {
      name: 'A',
      status: 'scheduled',
      scheduledEventId: 'A',
    });
    const { engine } = await makeEngine({
      settings: BARRED_SETTINGS,
      events: [{ ...EVENT, taskId: 'T' }],
      tasks: [linked],
    });
    await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
    expect((await engine.updateTask('T', { ...linked, durationMin: 30 })).ok).toBe(true);
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
    await engine.undo();
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual(['lunch']);
    expect(engine.snapshot().tasks[0]?.durationMin).toBe(60);
  });

  it('refuses a keep from a stale tab without changing its snapshot or overwriting stored data', async () => {
    const { engine, repo } = await makeEngine({ settings: BARRED_SETTINGS, events: [EVENT] });
    const snapshot = engine.snapshot();
    await repo.saveSettings(settings(), (await repo.load()).revision);
    const stored = await repo.load();
    expect(await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true })).toMatchObject(
      { ok: false, error: { code: 'ConcurrentModification' } },
    );
    expect(engine.snapshot()).toEqual(snapshot);
    expect(await repo.load()).toEqual(stored);
  });

  it.each(['move', 'resize', 'edit', 'alternative'] as const)(
    'clears a keep on %s and restores it with Undo',
    async (operation) => {
      const { engine } = await makeEngine({ settings: BARRED_SETTINGS, events: [EVENT] });
      await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
      const to =
        operation === 'resize' ? iv('Mon 13:00', 'Mon 13:30') : iv('Mon 14:00', 'Mon 15:00');
      const result =
        operation === 'edit'
          ? await engine.updateEvent('A', { ...EVENT, ...to })
          : operation === 'alternative'
            ? await engine.applyAlternative({
                eventId: 'A',
                slot: to,
                baseVersion: engine.snapshot().version,
              })
            : await engine.moveEvent('A', to);
      expect(result.ok).toBe(true);
      expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
      await engine.undo();
      expect(engine.snapshot().events[0]?.keptInBarred).toEqual(['lunch']);
    },
  );

  it('retains a keep for a title edit and a slot rename/day reorder, but clears it for time/day changes or deletion', async () => {
    const { engine, repo } = await makeEngine({ settings: BARRED_SETTINGS, events: [EVENT] });
    await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
    const edited: EventInput = { ...EVENT, title: 'Renamed' };
    await engine.updateEvent('A', edited);
    await engine.updateSettings(
      settings({ barredSlots: [{ ...LUNCH, label: 'Meal', days: [2, 1] }] }),
    );
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual(['lunch']);
    await engine.updateSettings(settings({ barredSlots: [{ ...LUNCH, endMin: 870 }] }));
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
    expect((await repo.load()).events[0]?.keptInBarred).toEqual([]);
    await engine.undo();
    await engine.undo();
    await engine.redo();
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
    await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
    await engine.updateSettings(settings({ barredSlots: [{ ...LUNCH, endMin: 870, days: [1] }] }));
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
    await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
    await engine.updateSettings(settings());
    expect(engine.snapshot().events[0]?.keptInBarred).toEqual([]);
  });

  it('rolls back keep and settings-triggered clearing on storage failure', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({ repo, settings: BARRED_SETTINGS, events: [EVENT] });
    const before = await capture(engine, repo);
    repo.failNextApply();
    expect(await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true })).toMatchObject(
      { ok: false, error: { code: 'StorageError' } },
    );
    expect(await capture(engine, repo)).toEqual(before);
    await engine.setBarredKept({ eventId: 'A', slotId: 'lunch', kept: true });
    const kept = await capture(engine, repo);
    repo.failNextSaveSettings();
    expect(await engine.updateSettings(settings())).toMatchObject({
      ok: false,
      error: { code: 'StorageError' },
    });
    expect(await capture(engine, repo)).toEqual(kept);
  });
});
