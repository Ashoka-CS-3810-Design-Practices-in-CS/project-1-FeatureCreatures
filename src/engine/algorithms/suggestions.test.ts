import type { FreeGap } from '@/shared/types';
import { dayFrame, iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import type { RankContext } from './rank';
import { generateCandidates } from './suggestions';

const CONTEXT: RankContext = {
  durationMin: 45,
  criterion: 'earliest',
  priority: 'medium',
  originalStart: null,
  dayLoads: new Map([[t('Mon 00:00'), 120]]),
  frames: [dayFrame('Mon', ['09:00', '18:00'])],
};
const GAP: FreeGap = {
  ...iv('Mon 09:10', 'Mon 11:20'),
  before: { kind: 'barred', label: 'Break', at: t('Mon 09:10') },
  after: { kind: 'event', eventId: 'Lecture', title: 'Lecture', at: t('Mon 11:20'), bufferMin: 0 },
};

describe('T51: pure suggestion candidate generator', () => {
  it('enumerates non-aligned boundaries and fitting half-hours with complete explanation data', () => {
    const candidates = generateCandidates(GAP, CONTEXT);
    expect(candidates.map((candidate) => candidate.slot.start)).toEqual(
      ['09:10', '09:30', '10:00', '10:30', '10:35'].map((time) => t(`Mon ${time}`)),
    );
    expect(candidates[0]).toEqual({
      slot: iv('Mon 09:10', 'Mon 09:55'),
      gap: GAP,
      gapMin: 130,
      leftoverMin: 85,
      dayLoadMin: 120,
      criterion: 'earliest',
      effectiveCriterion: 'earliest',
      distanceMin: null,
    });
    expect(candidates.at(-1)?.slot).toEqual(iv('Mon 10:35', 'Mon 11:20'));
  });

  it('adds the exact original start even when it is between half-hours', () => {
    const candidates = generateCandidates(GAP, {
      ...CONTEXT,
      originalStart: t('Mon 10:05'),
      criterion: 'nearest',
    });
    expect(candidates.map((candidate) => candidate.slot.start)).toEqual(
      ['09:10', '09:30', '10:00', '10:05', '10:30', '10:35'].map((time) => t(`Mon ${time}`)),
    );
    expect(candidates.map((candidate) => candidate.distanceMin)).toEqual([55, 35, 5, 0, 25, 30]);
  });

  it.each(['Mon 08:00', 'Mon 12:00'])(
    'deduplicates an original start clamped from %s',
    (original) => {
      const candidates = generateCandidates(GAP, { ...CONTEXT, originalStart: t(original) });
      expect(candidates.map((candidate) => candidate.slot.start)).toEqual(
        ['09:10', '09:30', '10:00', '10:30', '10:35'].map((time) => t(`Mon ${time}`)),
      );
    },
  );

  it('emits one candidate when the duration exactly fills the gap', () => {
    const candidates = generateCandidates(GAP, { ...CONTEXT, durationMin: 130 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ slot: iv('Mon 09:10', 'Mon 11:20'), leftoverMin: 0 });
  });
});
