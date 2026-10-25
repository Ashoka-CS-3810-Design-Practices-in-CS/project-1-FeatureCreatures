import type { SlotOption } from '@/shared/types';
import { ev, iv, settings, task } from '../../../tests/helpers/builders';
import { makeEngine } from '../../../tests/helpers/engine';
import { t } from '../../../tests/helpers/time';
import {
  boundaryText,
  distanceText,
  fitText,
  gapText,
  moveReasonText,
  moveText,
  optionReasonText,
  planAppliedText,
  priorityAwareText,
  queueSummaryText,
  scheduledText,
  searchSummaryText,
} from './explain';

// PRE:  options holds the engine setup of T6
// POST: returns findSlots' result for the 90 min task of T6
async function t6Search() {
  const { engine } = await makeEngine({
    events: [
      ev('E1', 'Mon 09:00', 'Mon 10:00'),
      ev('E2', 'Mon 10:30', 'Mon 12:00'),
      ev('Lab', 'Mon 13:00', 'Mon 14:00'),
    ],
    tasks: [task('T', 90, ['Mon 09:00', 'Mon 18:00'])],
  });
  const result = engine.findSlots({ taskId: 'T' });
  if (!result.ok) throw new Error('search failed');
  return result.value;
}

describe('format/explain (slots, BR-7, BR-8)', () => {
  it('summarises the search with T6 data', async () => {
    expect(searchSummaryText(await t6Search())).toBe(
      '3 free gaps in window (30 min, 1 h, 4 h) — 1 fits 1 h 30 min',
    );
  });

  it('explains an option: reason, gap and its boundaries, leftover and day load', async () => {
    const option = (await t6Search()).options[0] as SlotOption;

    expect(optionReasonText(option, null)).toBe('Earliest slot that fits.');
    expect(gapText(option)).toBe(
      'Gap 14:00–18:00 (4 h): after "Lab" ends 14:00 → working hours end.',
    );
    expect(fitText(option)).toBe('Leaves 2 h 30 min unused. Day load 3 h 30 min.');
  });

  it('names the buffer on event boundaries, and barred and edge boundaries', () => {
    const event = {
      kind: 'event',
      eventId: 'S',
      title: 'Seminar',
      at: t('Mon 11:00'),
      bufferMin: 15,
    } as const;
    const barred = { kind: 'barred', label: 'Lunch', at: t('Mon 13:00') } as const;

    expect(boundaryText(event, 'after')).toBe('15 min buffer before "Seminar" 11:00');
    expect(boundaryText(event, 'before')).toBe('after "Seminar" ends 11:00 + 15 min buffer');
    expect(boundaryText({ ...event, bufferMin: 0 }, 'after')).toBe('before "Seminar" 11:00');
    expect(boundaryText(barred, 'after')).toBe('before Lunch (13:00)');
    expect(boundaryText(barred, 'before')).toBe('after Lunch (13:00)');
    expect(boundaryText({ kind: 'edge', reason: 'now', at: 0 }, 'before')).toBe('now');
  });

  it('gives each criterion its own reason', async () => {
    const option = (await t6Search()).options[0] as SlotOption;

    expect(
      optionReasonText({ ...option, effectiveCriterion: 'bestFit', criterion: 'bestFit' }, null),
    ).toBe('Tightest fit: leaves 2 h 30 min unused in this gap.');
    expect(
      optionReasonText(
        { ...option, effectiveCriterion: 'leastLoaded', criterion: 'priorityAware' },
        null,
      ),
    ).toBe('Priority-aware: lightest day. Lightest day: 3 h 30 min already booked.');
    expect(
      optionReasonText(
        { ...option, effectiveCriterion: 'nearest', criterion: 'nearest' },
        t('Mon 15:00'),
      ),
    ).toBe('Closest to the original time (1 h earlier).');
    expect(
      optionReasonText({ ...option, effectiveCriterion: 'nearest', criterion: 'nearest' }, null),
    ).toBe('Closest to the original time.');
    expect(fitText({ ...option, leftoverMin: 0 })).toBe(
      'Fills the gap exactly. Day load 3 h 30 min.',
    );
  });

  it('states distances, the priority mapping and the scheduling toasts', () => {
    expect(distanceText(t('Mon 12:00'), t('Mon 11:00'))).toBe('1 h later');
    expect(distanceText(t('Mon 09:00'), t('Mon 11:00'))).toBe('2 h earlier');
    expect(distanceText(t('Mon 11:00'), t('Mon 11:00'))).toBe('at the original time');
    expect(priorityAwareText('high', 'earliest')).toBe(
      'Priority-aware: High priority → earliest slot',
    );
    expect(scheduledText(iv('Wed 14:00', 'Wed 15:30'))).toBe(
      'Task scheduled for Wed 4 Nov 14:00–15:30.',
    );
    expect(queueSummaryText(3, 3, 0)).toBe('Scheduled 3 of 3 tasks');
    expect(queueSummaryText(2, 3, 1)).toBe('Scheduled 2 of 3 tasks (1 skipped)');
    expect(queueSummaryText(1, 1, 0)).toBe('Scheduled 1 of 1 task');
  });

  it('a one-gap summary uses the singular', async () => {
    const { engine } = await makeEngine({
      settings: settings(),
      tasks: [task('T', 60, ['Mon 09:00', 'Mon 10:00'])],
    });
    const result = engine.findSlots({ taskId: 'T' });
    if (!result.ok) throw new Error('search failed');

    expect(searchSummaryText(result.value)).toBe('1 free gap in window (1 h) — 1 fits 1 h');
  });

  it('describes replan moves and the applied plan (BR-12)', () => {
    expect(moveReasonText({ kind: 'outsideFlexWindow' })).toBe('outside its flex window');
    expect(moveReasonText({ kind: 'outsideWorkingHours' })).toBe('outside working hours');
    expect(moveReasonText({ kind: 'barred', label: 'Lunch' })).toBe('in the barred slot "Lunch"');
    expect(moveReasonText({ kind: 'buffer', withEventId: 'S', withTitle: 'Seminar' })).toBe(
      'inside the buffer of "Seminar"',
    );
    expect(moveReasonText({ kind: 'balance', fromDayLoadMin: 120, toDayLoadMin: 0 })).toBe(
      'balances the week (day load 2 h → 0 min)',
    );
    expect(
      moveText({
        eventId: 'R',
        title: 'Read',
        priority: 'low',
        from: iv('Mon 14:00', 'Mon 15:00'),
        to: iv('Tue 09:00', 'Tue 10:00'),
        reason: { kind: 'conflict', withEventId: 'L', withTitle: 'Lecture' },
      }),
    ).toBe('"Read" Mon 2 Nov 14:00–15:00 → Tue 3 Nov 09:00–10:00 — conflicts with "Lecture"');
    expect(planAppliedText(1)).toBe('Plan applied: 1 event moved');
    expect(planAppliedText(2)).toBe('Plan applied: 2 events moved');
  });
});
