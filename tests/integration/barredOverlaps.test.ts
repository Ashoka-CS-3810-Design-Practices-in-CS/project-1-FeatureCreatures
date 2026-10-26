import { SAMPLES } from '@/data/samples';
import { ev, iv, settings } from '../helpers/builders';
import { makeEngine, capture } from '../helpers/engine';
import { FailingRepository } from '../helpers/failingRepository';
import { BASE_MONDAY } from '../helpers/time';

const LUNCH = { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] as const };

describe('T37 snapshot warnings are independent of event-pair conflicts', () => {
  it('backToBack plus Monday Lunch has one 60-minute warning and no conflicts', async () => {
    const sample = SAMPLES.backToBack.build(BASE_MONDAY);
    const { engine } = await makeEngine({
      events: [...sample.events],
      settings: settings({ barredSlots: [LUNCH] }),
    });
    const lunchEvent = engine
      .snapshot()
      .events.find((event) => event.start === iv('Mon 13:00', 'Mon 14:00').start);
    expect(engine.snapshot().barredOverlaps).toEqual([
      {
        eventId: lunchEvent?.id,
        label: 'Lunch',
        overlap: iv('Mon 13:00', 'Mon 14:00'),
        minutes: 60,
      },
    ]);
    expect(engine.snapshot().conflicts).toEqual([]);
    const plans = engine.planReplan({ range: iv('Mon 00:00', 'Tue 00:00') });
    expect(
      plans.ok &&
        plans.value.plans.map((plan) => [
          plan.metrics.conflictsBefore,
          plan.metrics.conflictsAfter,
        ]),
    ).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('recomputes for settings, CRUD and undo/redo; applies a slot only on its own non-working day', async () => {
    const { engine } = await makeEngine({
      events: [ev('A', 'Mon 12:30', 'Mon 13:30'), ev('Sunday', 'Sun 13:00', 'Sun 14:00')],
    });
    expect(engine.snapshot().barredOverlaps).toEqual([]);
    await engine.updateSettings(
      settings({ barredSlots: [LUNCH, { ...LUNCH, id: 'sun', label: 'Rest', days: [0] }] }),
    );
    expect(engine.snapshot().barredOverlaps.map(({ label, minutes }) => [label, minutes])).toEqual([
      ['Lunch', 30],
      ['Rest', 60],
    ]);
    await engine.moveEvent('A', iv('Mon 12:00', 'Mon 13:00'));
    expect(engine.snapshot().barredOverlaps).toHaveLength(1);
    await engine.undo();
    expect(engine.snapshot().barredOverlaps).toHaveLength(2);
    await engine.redo();
    expect(engine.snapshot().barredOverlaps).toHaveLength(1);
    const created = await engine.createEvent(ev('New', 'Mon 13:00', 'Mon 14:00'));
    expect(created.ok && created.value.snapshot.barredOverlaps).toHaveLength(2);
    if (!created.ok) throw new Error('Valid event creation failed');
    await engine.deleteEvent(created.value.changedEventIds[0] ?? '');
    expect(engine.snapshot().barredOverlaps).toHaveLength(1);
    const exported = engine.exportData();
    expect(JSON.parse(exported)).not.toHaveProperty('barredOverlaps');
    const imported = (await makeEngine()).engine;
    await imported.importData(exported);
    expect(imported.snapshot().barredOverlaps).toEqual(engine.snapshot().barredOverlaps);
  });

  it('preserves warning state on failed settings and commit persistence', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({
      repo,
      events: [ev('A', 'Mon 13:00', 'Mon 14:00')],
      settings: settings({ barredSlots: [LUNCH] }),
    });
    const before = await capture(engine, repo);
    repo.failNextSaveSettings();
    expect((await engine.updateSettings(settings())).ok).toBe(false);
    expect(await capture(engine, repo)).toEqual(before);
    repo.failNextApply();
    expect((await engine.moveEvent('A', iv('Mon 14:00', 'Mon 15:00'))).ok).toBe(false);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('sparseWeek 10 h thesis gives ER2 with a 4 h longest allowed stretch, never ER3', async () => {
    const sample = SAMPLES.sparseWeek.build(BASE_MONDAY);
    const { engine } = await makeEngine({
      events: [...sample.events],
      tasks: [...sample.tasks],
      settings: sample.settings,
    });
    expect(engine.findSlots({ taskId: 'sparse-thesis' })).toEqual({
      ok: false,
      error: { code: 'TaskLongerThanWindow', durationMin: 600, longestStretchMin: 240 },
    });
  });
});
