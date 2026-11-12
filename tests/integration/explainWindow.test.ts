// T46 — what is left of a search window, for the ER2 / ER3 explanation (peer report #7, WI-45).

import { ev, flexEv, iv, settings, task } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';

const lunch = settings({
  barredSlots: [
    { id: 'l', label: 'Lunch', startMin: 13 * 60, endMin: 14 * 60, days: [1, 2, 3, 4, 5] },
  ],
});

describe('T46: engine.explainWindow', () => {
  it('a task window split by Lunch: allowed stretches and the barred slot between them', async () => {
    const { engine } = await makeEngine({
      settings: lunch,
      tasks: [task('Read', 45, ['Mon 12:30', 'Mon 14:30'])],
    });
    expect(engine.findSlots({ taskId: 'Read' })).toEqual({
      ok: false,
      error: { code: 'TaskLongerThanWindow', durationMin: 45, longestStretchMin: 30 },
    });

    const explained = engine.explainWindow({ taskId: 'Read' });

    expect(explained).toEqual({
      ok: true,
      value: {
        allowed: {
          stretches: [iv('Mon 12:30', 'Mon 13:00'), iv('Mon 14:00', 'Mon 14:30')],
          splits: [{ kind: 'barred', label: 'Lunch', interval: iv('Mon 13:00', 'Mon 14:00') }],
        },
        free: {
          stretches: [iv('Mon 12:30', 'Mon 13:00'), iv('Mon 14:00', 'Mon 14:30')],
          splits: [{ kind: 'barred', label: 'Lunch', interval: iv('Mon 13:00', 'Mon 14:00') }],
        },
      },
    });
  });

  it('free gaps split by an event (the ER3 case)', async () => {
    const { engine } = await makeEngine({
      events: [ev('Meeting', 'Mon 10:00', 'Mon 11:00')],
      tasks: [task('Essay', 90, ['Mon 09:00', 'Mon 12:00'])],
    });
    expect(engine.findSlots({ taskId: 'Essay' })).toMatchObject({ error: { code: 'NoSlotFound' } });

    const explained = engine.explainWindow({ taskId: 'Essay' });

    expect(explained.ok && explained.value.free).toEqual({
      stretches: [iv('Mon 09:00', 'Mon 10:00'), iv('Mon 11:00', 'Mon 12:00')],
      splits: [{ kind: 'event', label: 'Meeting', interval: iv('Mon 10:00', 'Mon 11:00') }],
    });
    expect(explained.ok && explained.value.allowed.stretches).toEqual([
      iv('Mon 09:00', 'Mon 12:00'),
    ]);
  });

  it('an event explains the window its alternatives search, with its search hours', async () => {
    const { engine } = await makeEngine({
      settings: lunch,
      events: [flexEv('Study', 'Mon 12:30', 'Mon 13:15', ['Mon 12:30', 'Mon 14:30'])],
    });

    const explained = engine.explainWindow({ eventId: 'Study', useWorkingHours: true });

    expect(explained.ok && explained.value.allowed.stretches).toEqual([
      iv('Mon 12:30', 'Mon 13:00'),
      iv('Mon 14:00', 'Mon 14:30'),
    ]);
  });

  it('rejects unknown subjects and bad buffers like the searches do', async () => {
    const { engine } = await makeEngine({ tasks: [task('T', 30, ['Mon 09:00', 'Mon 10:00'])] });

    expect(engine.explainWindow({ taskId: 'nope' })).toMatchObject({
      error: { code: 'NotFound', entity: 'task' },
    });
    expect(engine.explainWindow({ eventId: 'nope' })).toMatchObject({
      error: { code: 'NotFound', entity: 'event' },
    });
    expect(engine.explainWindow({ taskId: 'T', bufferMin: -1 })).toMatchObject({
      error: { code: 'InvalidInput' },
    });
  });
});
