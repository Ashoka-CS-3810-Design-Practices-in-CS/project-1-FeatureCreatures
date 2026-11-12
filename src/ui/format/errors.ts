// Toast text for every engine error (TECH_SPEC §11.6, PROJECT_SCHEMA §5 ER1–ER8).

import type { EmptyWindowCause, EngineError, FieldIssue } from '@/shared/errors';
import { fmtDuration, fmtRange } from './time';

const NUMERIC_SEGMENT = /^\d+$/;

const EMPTY_WINDOW_TEXT: Record<EmptyWindowCause, string> = {
  past: 'Its window is entirely in the past.',
  noWorkingHours: 'Its window has no working hours. Choose "Any time" to search outside them.',
  barred: 'Its window is fully barred: every free minute in it is inside a barred slot.',
};

// PRE:  path is a FieldIssue path such as 'events.3.end' ('' for the root)
// POST: returns it with numeric segments in brackets, e.g. 'events[3].end'
export function bracketPath(path: string): string {
  return path
    .split('.')
    .map((segment, index) =>
      NUMERIC_SEGMENT.test(segment) ? `[${segment}]` : `${index === 0 ? '' : '.'}${segment}`,
    )
    .join('');
}

// PRE:  issue is a FieldIssue
// POST: returns "path — message", or just the message for a root issue
function describeIssue(issue: FieldIssue): string {
  return issue.path === '' ? issue.message : `${bracketPath(issue.path)} — ${issue.message}`;
}

// PRE:  error is any EngineError
// POST: returns the sentence the UI shows for it
export function errorMessage(error: EngineError): string {
  switch (error.code) {
    case 'InvalidInput':
    case 'InvalidTime':
      return error.issues[0]?.message ?? 'Please check the highlighted fields.';
    case 'TaskLongerThanWindow':
      if (error.emptyCause !== undefined) {
        return EMPTY_WINDOW_TEXT[error.emptyCause];
      }
      return error.longestStretchMin === 0
        ? 'Its window has no available time (it may be in the past, outside working days/hours, or fully barred).'
        : `This needs ${fmtDuration(error.durationMin)}, but the longest stretch available in its window is ${fmtDuration(error.longestStretchMin)}. Shorten the task or widen the window.`;
    case 'NoSlotFound':
      return error.largestGap === null
        ? `No free slot of ${fmtDuration(error.durationMin)} in this window: it is fully booked. Try widening the window or reducing the buffer (${error.bufferMin} min).`
        : `No free slot of ${fmtDuration(error.durationMin)} in this window. The largest free gap is ${fmtDuration(error.largestGapMin)} (${fmtRange(error.largestGap)}). Try shortening the task, widening the window, or reducing the buffer (${error.bufferMin} min).`;
    case 'StorageError':
      return "Couldn't save your change. Nothing was changed.";
    case 'InvalidImport': {
      const first = error.issues[0];
      return `That file isn't a valid calendar export: ${first === undefined ? 'unknown problem.' : describeIssue(first)}`;
    }
    case 'StaleResult':
      return 'The calendar changed since these options were computed. Refreshing…';
    case 'NotFound':
      return `That ${error.entity} no longer exists.`;
    case 'ConcurrentModification':
      return 'This changed in another tab — your view has been refreshed. Nothing was overwritten.';
  }
}
