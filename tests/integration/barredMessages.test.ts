import { parseInput, settingsSchema } from '@/shared/schemas';
import { settings } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';

const LUNCH = { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1, 2] as const };

describe('T56: named barred-slot errors (D-20)', () => {
  it('names an exact duplicate by label and time, ignoring its own label and weekday order', () => {
    const result = parseInput(
      settingsSchema,
      settings({
        barredSlots: [LUNCH, { ...LUNCH, id: 'copy', label: 'Different label', days: [2, 1] }],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'InvalidInput',
        issues: [
          { path: 'barredSlots.1.days', message: 'Same days and times as "Lunch" (13:00–14:00).' },
        ],
      },
    });
  });

  it('names a partial overlap by label, time and shared weekdays, without a slot number', () => {
    const result = parseInput(
      settingsSchema,
      settings({
        barredSlots: [LUNCH, { ...LUNCH, id: 'tt', label: 'TT', startMin: 810, endMin: 870 }],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'InvalidInput',
        issues: [
          { path: 'barredSlots.1.days', message: 'Overlaps "Lunch" (13:00–14:00) on Mon, Tue.' },
        ],
      },
    });
  });

  it('carries the same named duplicate into the import issue, with no partial import', async () => {
    const { engine, repo } = await makeEngine();
    const before = await capture(engine, repo);
    const file = JSON.parse(engine.exportData());
    file.settings.barredSlots = [LUNCH, { ...LUNCH, id: 'copy' }];
    expect(await engine.importData(JSON.stringify(file))).toEqual({
      ok: false,
      error: {
        code: 'InvalidImport',
        issues: [
          {
            path: 'settings.barredSlots.1.days',
            message: 'Same days and times as "Lunch" (13:00–14:00).',
          },
        ],
      },
    });
    expect(await capture(engine, repo)).toEqual(before);
  });
});
