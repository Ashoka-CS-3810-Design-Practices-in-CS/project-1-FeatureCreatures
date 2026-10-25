import { ev, iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { mergeBusy } from './merge';

describe('mergeBusy (BR-6)', () => {
  it('merges touching events into one block', () => {
    const blocks = mergeBusy(
      [ev('A', 'Mon 09:00', 'Mon 10:00'), ev('B', 'Mon 10:00', 'Mon 11:00')],
      0,
    );

    expect(blocks).toEqual([
      {
        ...iv('Mon 09:00', 'Mon 11:00'),
        startEvent: { id: 'A', title: 'A', start: t('Mon 09:00') },
        endEvent: { id: 'B', title: 'B', end: t('Mon 11:00') },
      },
    ]);
  });

  it('keeps the outer event as endEvent when a later event is nested inside it', () => {
    const blocks = mergeBusy(
      [ev('A', 'Mon 09:00', 'Mon 12:00'), ev('B', 'Mon 10:00', 'Mon 11:00')],
      0,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      ...iv('Mon 09:00', 'Mon 12:00'),
      startEvent: { id: 'A' },
      endEvent: { id: 'A', end: t('Mon 12:00') },
    });
  });

  it('expands by the buffer, so a 30 min gap closes at buffer 15 but not at 10', () => {
    const events = [ev('A', 'Mon 09:00', 'Mon 10:00'), ev('B', 'Mon 10:30', 'Mon 11:00')];

    expect(mergeBusy(events, 10).map(({ start, end }) => ({ start, end }))).toEqual([
      iv('Mon 08:50', 'Mon 10:10'),
      iv('Mon 10:20', 'Mon 11:10'),
    ]);
    expect(mergeBusy(events, 15)).toEqual([
      {
        ...iv('Mon 08:45', 'Mon 11:15'),
        // Attribution keeps the unbuffered times; the buffer is reported separately.
        startEvent: { id: 'A', title: 'A', start: t('Mon 09:00') },
        endEvent: { id: 'B', title: 'B', end: t('Mon 11:00') },
      },
    ]);
  });

  it('returns no blocks for no events, and does not mutate its input', () => {
    const events = [ev('A', 'Mon 09:00', 'Mon 10:00')];
    const before = structuredClone(events);

    expect(mergeBusy([], 0)).toEqual([]);
    mergeBusy(events, 30);
    expect(events).toEqual(before);
  });
});
