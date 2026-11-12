import type { EngineError } from '@/shared/errors';
import { iv } from '../../../tests/helpers/builders';
import { bracketPath, errorMessage } from './errors';

describe('format/errors', () => {
  it('bracketPath puts numeric segments in brackets', () => {
    expect(bracketPath('events.3.end')).toBe('events[3].end');
    expect(bracketPath('tasks.0.scheduledEventId')).toBe('tasks[0].scheduledEventId');
    expect(bracketPath('format')).toBe('format');
  });

  it.each<[string, EngineError, string]>([
    [
      'ER1',
      {
        code: 'InvalidTime',
        issues: [{ path: 'end', message: 'End time must be after the start time.' }],
      },
      'End time must be after the start time.',
    ],
    [
      'ER1 without issues',
      { code: 'InvalidInput', issues: [] },
      'Please check the highlighted fields.',
    ],
    [
      'ER2',
      { code: 'TaskLongerThanWindow', durationMin: 600, longestStretchMin: 540 },
      'This needs 10 h, but the longest stretch available in its window is 9 h. Shorten the task or widen the window.',
    ],
    [
      'ER2 with no time at all',
      { code: 'TaskLongerThanWindow', durationMin: 60, longestStretchMin: 0 },
      'Its window has no available time (it may be in the past, outside working days/hours, or fully barred).',
    ],
    [
      'ER3',
      {
        code: 'NoSlotFound',
        durationMin: 30,
        largestGapMin: 15,
        largestGap: iv('Mon 12:00', 'Mon 12:15'),
        bufferMin: 0,
      },
      'No free slot of 30 min in this window. The largest free gap is 15 min (Mon 2 Nov 12:00–12:15). Try shortening the task, widening the window, or reducing the buffer (0 min).',
    ],
    [
      'ER3 fully booked',
      { code: 'NoSlotFound', durationMin: 30, largestGapMin: 0, largestGap: null, bufferMin: 15 },
      'No free slot of 30 min in this window: it is fully booked. Try widening the window or reducing the buffer (15 min).',
    ],
    [
      'ER5',
      { code: 'StorageError', message: 'quota' },
      "Couldn't save your change. Nothing was changed.",
    ],
    [
      'ER6',
      {
        code: 'InvalidImport',
        issues: [{ path: 'events.3.end', message: 'End time must be after the start time.' }],
      },
      "That file isn't a valid calendar export: events[3].end — End time must be after the start time.",
    ],
    [
      'ER6 at the root',
      { code: 'InvalidImport', issues: [{ path: '', message: 'Not valid JSON.' }] },
      "That file isn't a valid calendar export: Not valid JSON.",
    ],
    [
      'ER6 without issues',
      { code: 'InvalidImport', issues: [] },
      "That file isn't a valid calendar export: unknown problem.",
    ],
    [
      'ER7',
      { code: 'StaleResult' },
      'The calendar changed since these options were computed. Refreshing…',
    ],
    ['NotFound', { code: 'NotFound', entity: 'task', id: 'x' }, 'That task no longer exists.'],
    [
      'ER8',
      { code: 'ConcurrentModification' },
      'This changed in another tab — your view has been refreshed. Nothing was overwritten.',
    ],
  ])('%s has its message', (_case, error, text) => {
    expect(errorMessage(error)).toBe(text);
  });
});
