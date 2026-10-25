// Runs under TZ=America/New_York (npm run test:dst): Sun 1 Nov 2026 is 25 hours long.
import { atLocal } from '@/shared/time';
import { settings, task } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;

describe('findSlots across the end of DST (T29)', () => {
  it('offers exactly local 09:00–18:00 for a 540 min task on the 25-hour day', async () => {
    const window = { start: atLocal('2026-11-01', '00:00'), end: atLocal('2026-11-02', '00:00') };
    const { engine } = await makeEngine({
      now: '2026-11-01 00:00',
      settings: settings({ workDays: [...EVERY_DAY] }),
      tasks: [task('T', 540, ['Mon 00:00', 'Mon 00:00'], { window })],
    });

    const found = engine.findSlots({ taskId: 'T' });

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.options.map((option) => option.slot)).toEqual([
      { start: atLocal('2026-11-01', '09:00'), end: atLocal('2026-11-01', '18:00') },
    ]);
  });
});
