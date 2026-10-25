import { dayFrame, iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { allowedSegments } from './segments';

const NO_CLIP = { useWorkingHours: true, notBefore: t('Mon 00:00') };

describe('allowedSegments (BR-5)', () => {
  it('labels edges windowStart / windowEnd only where the window clips working hours', () => {
    const monday = [dayFrame('Mon', ['09:00', '18:00'])];

    expect(allowedSegments(iv('Mon 10:00', 'Mon 16:40'), monday, NO_CLIP)).toEqual([
      {
        ...iv('Mon 10:00', 'Mon 16:40'),
        startEdge: { kind: 'edge', reason: 'windowStart', at: t('Mon 10:00') },
        endEdge: { kind: 'edge', reason: 'windowEnd', at: t('Mon 16:40') },
      },
    ]);
    expect(allowedSegments(iv('Mon 09:00', 'Mon 18:00'), monday, NO_CLIP)).toEqual([
      {
        ...iv('Mon 09:00', 'Mon 18:00'),
        startEdge: { kind: 'edge', reason: 'workStart', at: t('Mon 09:00') },
        endEdge: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    ]);
  });

  it('splits a segment around a barred slot, labelling both new edges', () => {
    const monday = [dayFrame('Mon', ['09:00', '18:00'], [['Lunch', '13:00', '14:00']])];

    expect(allowedSegments(iv('Mon 09:00', 'Mon 18:00'), monday, NO_CLIP)).toEqual([
      {
        ...iv('Mon 09:00', 'Mon 13:00'),
        startEdge: { kind: 'edge', reason: 'workStart', at: t('Mon 09:00') },
        endEdge: { kind: 'barred', label: 'Lunch', at: t('Mon 13:00') },
      },
      {
        ...iv('Mon 14:00', 'Mon 18:00'),
        startEdge: { kind: 'barred', label: 'Lunch', at: t('Mon 14:00') },
        endEdge: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    ]);
  });

  it('handles overlapping barred slots and one that covers the start of working hours', () => {
    const monday = [
      dayFrame(
        'Mon',
        ['09:00', '18:00'],
        [
          ['Gym', '08:00', '10:00'],
          ['Call', '12:00', '13:30'],
          ['Lunch', '13:00', '14:00'],
        ],
      ),
    ];

    expect(allowedSegments(iv('Mon 00:00', 'Tue 00:00'), monday, NO_CLIP)).toEqual([
      {
        ...iv('Mon 10:00', 'Mon 12:00'),
        startEdge: { kind: 'barred', label: 'Gym', at: t('Mon 10:00') },
        endEdge: { kind: 'barred', label: 'Call', at: t('Mon 12:00') },
      },
      {
        ...iv('Mon 14:00', 'Mon 18:00'),
        startEdge: { kind: 'barred', label: 'Lunch', at: t('Mon 14:00') },
        endEdge: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    ]);
  });

  it('clips to notBefore with a now edge, dropping segments that end before it', () => {
    const monday = [dayFrame('Mon', ['09:00', '18:00'], [['Lunch', '13:00', '14:00']])];
    const options = { useWorkingHours: true, notBefore: t('Mon 14:05') };

    expect(allowedSegments(iv('Mon 09:00', 'Mon 18:00'), monday, options)).toEqual([
      {
        ...iv('Mon 14:05', 'Mon 18:00'),
        startEdge: { kind: 'edge', reason: 'now', at: t('Mon 14:05') },
        endEdge: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    ]);
  });

  it('skips non-working days', () => {
    const frames = [dayFrame('Sat', null), dayFrame('Sun', null)];

    expect(allowedSegments(iv('Sat 00:00', '2026-11-09 00:00'), frames, NO_CLIP)).toEqual([]);
  });

  it('skips a working day whose hours miss the window, and barred slots outside the hours', () => {
    const frames = [
      dayFrame('Mon', ['09:00', '18:00'], [['Evening', '19:00', '20:00']]),
      dayFrame('Tue', ['09:00', '18:00'], [['Breakfast', '07:00', '08:00']]),
    ];

    expect(allowedSegments(iv('Mon 18:00', 'Tue 09:30'), frames, NO_CLIP)).toEqual([
      {
        ...iv('Tue 09:00', 'Tue 09:30'),
        startEdge: { kind: 'edge', reason: 'workStart', at: t('Tue 09:00') },
        endEdge: { kind: 'edge', reason: 'windowEnd', at: t('Tue 09:30') },
      },
    ]);
  });

  it('without working hours, merges days across midnight into one segment', () => {
    const frames = [dayFrame('Mon', ['09:00', '18:00']), dayFrame('Tue', ['09:00', '18:00'])];
    const options = { useWorkingHours: false, notBefore: t('Mon 00:00') };

    expect(allowedSegments(iv('Mon 20:00', 'Tue 08:00'), frames, options)).toEqual([
      {
        ...iv('Mon 20:00', 'Tue 08:00'),
        startEdge: { kind: 'edge', reason: 'windowStart', at: t('Mon 20:00') },
        endEdge: { kind: 'edge', reason: 'windowEnd', at: t('Tue 08:00') },
      },
    ]);
  });

  it('without working hours, labels a midnight edge left by a barred slot ending at 24:00', () => {
    const frames = [dayFrame('Mon', null, [['Late', '22:00', '24:00']]), dayFrame('Tue', null)];
    const options = { useWorkingHours: false, notBefore: t('Mon 00:00') };

    expect(allowedSegments(iv('Mon 20:00', 'Tue 08:00'), frames, options)).toEqual([
      {
        ...iv('Mon 20:00', 'Mon 22:00'),
        startEdge: { kind: 'edge', reason: 'windowStart', at: t('Mon 20:00') },
        endEdge: { kind: 'barred', label: 'Late', at: t('Mon 22:00') },
      },
      {
        ...iv('Tue 00:00', 'Tue 08:00'),
        startEdge: { kind: 'barred', label: 'Late', at: t('Tue 00:00') },
        endEdge: { kind: 'edge', reason: 'windowEnd', at: t('Tue 08:00') },
      },
    ]);
  });
});
