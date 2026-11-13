import { flexEv, iv, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { t } from '../helpers/time';

describe('T51: D-06 picker candidates', () => {
  it('includes non-aligned gap boundaries and every fitting half-hour start', async () => {
    const { engine, repo } = await makeEngine({
      tasks: [task('Report', 45, ['Mon 09:10', 'Mon 11:20'])],
    });
    const before = await capture(engine, repo);
    const found = engine.findSlots({ taskId: 'Report' });
    if (!found.ok) throw new Error(found.error.code);

    expect(found.value.options.map((option) => option.slot)).toEqual([
      iv('Mon 09:10', 'Mon 09:55'),
      iv('Mon 09:30', 'Mon 10:15'),
      iv('Mon 10:00', 'Mon 10:45'),
      iv('Mon 10:30', 'Mon 11:15'),
      iv('Mon 10:35', 'Mon 11:20'),
    ]);
    expect(found.value.fittingCount).toBe(1);
    expect(found.value.options.every((option) => option.gapMin === 130)).toBe(true);
    expect(found.value.options.every((option) => option.leftoverMin === 85)).toBe(true);
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('keeps more than five picker options and deduplicates aligned boundaries', async () => {
    const { engine } = await makeEngine({
      tasks: [task('Report', 60, ['Mon 09:00', 'Mon 14:00'])],
    });
    const found = engine.findSlots({ taskId: 'Report' });
    if (!found.ok) throw new Error(found.error.code);

    expect(found.value.options.map((option) => option.slot.start)).toEqual(
      ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'].map(
        (time) => t(`Mon ${time}`),
      ),
    );
    expect(found.value.options.map((option) => option.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('includes the exact original start alongside boundaries and half-hours for alternatives', async () => {
    const { engine, repo } = await makeEngine({
      events: [flexEv('Study', 'Mon 11:05', 'Mon 12:05', ['Mon 09:10', 'Mon 14:20'])],
    });
    const before = await capture(engine, repo);
    const found = engine.suggestAlternatives({ eventId: 'Study' });
    if (!found.ok) throw new Error(found.error.code);

    expect(found.value.options.map((option) => option.slot.start)).toEqual(
      [
        '11:05',
        '11:00',
        '11:30',
        '10:30',
        '12:00',
        '10:00',
        '12:30',
        '09:30',
        '09:10',
        '13:00',
        '13:20',
      ].map((time) => t(`Mon ${time}`)),
    );
    expect(found.value.options.map((option) => option.distanceMin)).toEqual([
      0, 5, 25, 35, 55, 65, 85, 95, 115, 115, 135,
    ]);
    expect(await capture(engine, repo)).toEqual(before);
  });
});
