import { atLocal, buildDayFrames } from '@/shared/time';
import { ev, settings } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';

it('T37 expands barred Sunday wall-clock times on the 25-hour fallback day', async () => {
  const event = ev('Fall', '2026-11-01 09:30', '2026-11-01 10:30');
  const rules = settings({
    workDays: [1],
    barredSlots: [{ id: 'rest', label: 'Rest', startMin: 540, endMin: 600, days: [0] }],
  });
  const frames = buildDayFrames(event, rules);
  expect(frames[0] && frames[0].dayEnd - frames[0].dayStart).toBe(1500);
  const { engine } = await makeEngine({ events: [event], settings: rules });
  expect(engine.snapshot().barredOverlaps).toEqual([
    {
      eventId: 'Fall',
      slotId: 'rest',
      label: 'Rest',
      overlap: { start: atLocal('2026-11-01', '09:30'), end: atLocal('2026-11-01', '10:00') },
      minutes: 30,
    },
  ]);
});
