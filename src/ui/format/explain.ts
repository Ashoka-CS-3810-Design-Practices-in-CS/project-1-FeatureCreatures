// User-visible sentences (TECH_SPEC §11.6): every toast and explanation line is built here, so the
// engine stays free of UI text. WI-21 adds the slot and plan explanations (BR-7, BR-8).

import type {
  Boundary,
  CalendarEvent,
  EdgeReason,
  EffectiveCriterion,
  Interval,
  Minute,
  MoveReason,
  Priority,
  ReplanMove,
  SlotOption,
  SlotSearchResult,
  UserCriterion,
} from '@/shared/types';
import { fmtDuration, fmtRange, fmtTime } from './time';

// PRE:  title is an event title
// POST: returns the success toast after creating it
export function createdText(title: string): string {
  return `Event created: "${title}".`;
}

// PRE:  title is an event title
// POST: returns the success toast after editing it
export function updatedText(title: string): string {
  return `Saved "${title}".`;
}

// PRE:  title is an event title; to is its new interval
// POST: returns the success toast after a drag, resize or move, e.g. 'Moved "Gym" to Tue 3 Nov 14:00–15:00.'
export function movedText(title: string, to: Interval): string {
  return `Moved "${title}" to ${fmtRange(to)}.`;
}

// PRE:  title is an event title
// POST: returns the success toast after deleting it
export function deletedText(title: string): string {
  return `Deleted "${title}".`;
}

// PRE:  otherTitle names the event now overlapped; overlap and minutes describe the conflict
// POST: returns the ER4 warning text, e.g. 'Saved with a conflict: overlaps "Lecture" 11:00–11:30 (30 min).'
export function conflictText(otherTitle: string, overlap: Interval, minutes: number): string {
  return `Saved with a conflict: overlaps "${otherTitle}" ${fmtTime(overlap.start)}–${fmtTime(overlap.end)} (${fmtDuration(minutes)}).`;
}

// PRE:  slot is where an alternative put the event; resolved says a conflict went away
// POST: returns the success toast after applying an alternative
export function alternativeAppliedText(slot: Interval, resolved: boolean): string {
  return `Moved to ${fmtRange(slot)}${resolved ? ' — conflict resolved' : ''}.`;
}

// PRE:  verb is 'Undid' or 'Redid'; label is the change's label ('' when there was nothing to do)
// POST: returns the history toast, e.g. 'Undid: Delete "Gym"', or 'Nothing to undo.'
export function historyText(verb: 'Undid' | 'Redid', label: string): string {
  if (label === '') {
    return verb === 'Undid' ? 'Nothing to undo.' : 'Nothing to redo.';
  }
  return `${verb}: ${label}`;
}

// PRE:  label is a sample's label
// POST: returns the success toast after loading it
export function sampleLoadedText(label: string): string {
  return `Loaded sample: ${label}.`;
}

export const SETTINGS_SAVED_TEXT = 'Settings saved.';
export const DATA_CLEARED_TEXT = 'All data cleared.';
export const OTHER_TAB_UPDATED_TEXT = 'Calendar updated in another tab.';
export const FIXED_MOVE_BODY = 'The planner never moves it on its own.';
export const FIXED_TAG_HINT =
  'Fixed: the planner never moves it. Dragging asks first; you can also edit its times or tick Flexible.';

// PRE:  title is a fixed event's title
// POST: returns the question a manual drag or resize of it asks first (WI-42, report #1)
export function fixedMoveQuestion(title: string): string {
  return `${title} is fixed. Move it anyway?`;
}

// PRE:  eventCount, taskCount ≥ 0 are what an import brought in
// POST: returns the success toast after the import, e.g. "Imported 2 events and 1 task."
export function importedText(eventCount: number, taskCount: number): string {
  return `Imported ${counted(eventCount, 'event', 'events')} and ${counted(taskCount, 'task', 'tasks')}.`;
}

// PRE:  slot is a suggested interval
// POST: returns the label of the ER4 toast's button that moves the event there
export function moveToLabel(slot: Interval): string {
  return `Move to ${fmtRange(slot)}`;
}

// PRE:  name is a task name
// POST: returns the success toast after creating the task
export function taskCreatedText(name: string): string {
  return `Task created: "${name}".`;
}

// PRE:  name is a task name
// POST: returns the success toast after editing the task
export function taskSavedText(name: string): string {
  return `Saved task "${name}".`;
}

// PRE:  name is a task name
// POST: returns the success toast after deleting the task (and its event, if scheduled)
export function taskDeletedText(name: string): string {
  return `Deleted task "${name}".`;
}

// PRE:  name is a task name
// POST: returns the success toast after unscheduling the task
export function unscheduledText(name: string): string {
  return `Unscheduled "${name}"; it is back in the task list.`;
}

// PRE:  count ≥ 1 tasks were left out of a scheduling queue
// POST: returns the info toast explaining why
export function droppedFromQueueText(count: number): string {
  return count === 1
    ? '1 selected task is already scheduled, so it was left out.'
    : `${count} selected tasks are already scheduled, so they were left out.`;
}

const EDGE_TEXT: Record<EdgeReason, string> = {
  windowStart: 'window start',
  windowEnd: 'window end',
  workStart: 'working hours start',
  workEnd: 'working hours end',
  now: 'now',
};
export const CRITERIA: { value: UserCriterion; label: string }[] = [
  { value: 'earliest', label: 'Earliest fit' },
  { value: 'bestFit', label: 'Best fit' },
  { value: 'priorityAware', label: 'Priority-aware' },
];
const PRIORITY_NAME: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

// PRE:  event is a stored calendar event; conflictMinutes is its largest overlap, or zero;
//       barredLabels are distinct overlapping slot labels
// POST: returns its complete accessible name, including the date, priority, kind and conflict
export function eventAccessibleText(
  event: CalendarEvent,
  conflictMinutes: number,
  barredLabels: readonly string[] = [],
): string {
  const kind = event.taskId !== null ? 'Task' : event.flexible ? 'Flexible' : 'Fixed';
  const conflict = conflictMinutes > 0 ? `, Conflict ${fmtDuration(conflictMinutes)}` : '';
  const barred = barredLabels.map((label) => `, In ${label}`).join('');
  return `${event.title}, ${fmtRange(event)}, ${PRIORITY_NAME[event.priority]} priority, ${kind}${conflict}${barred}`;
}

// PRE:  count is a positive count of distinct newly warned events
// POST: returns the settings info message with singular/plural agreement
export function barredOverlapToastText(count: number): string {
  return count === 1 ? '1 event overlaps barred slots' : `${count} events overlap barred slots`;
}
const EFFECTIVE_NAME: Record<EffectiveCriterion, string> = {
  earliest: 'earliest slot',
  bestFit: 'tightest fit',
  leastLoaded: 'lightest day',
  nearest: 'closest time',
};

// PRE:  count ≥ 0; singular and plural are the noun's forms
// POST: returns "1 gap" / "3 gaps"
function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// PRE:  result is a successful search
// POST: returns the summary line (BR-8), e.g. "3 free gaps in window (30 min, 1 h, 4 h) — 1 fits 1 h 30 min"
export function searchSummaryText(result: SlotSearchResult): string {
  const lengths = result.freeGaps.map((gap) => fmtDuration(gap.end - gap.start)).join(', ');
  const gaps = counted(result.freeGaps.length, 'free gap', 'free gaps');
  const fits = result.fittingCount === 1 ? '1 fits' : `${result.fittingCount} fit`;
  return `${gaps} in window (${lengths}) — ${fits} ${fmtDuration(result.durationMin)}`;
}

// PRE:  slotStart and originalStart are Minutes
// POST: returns "N min earlier", "N min later" or "at the original time"
export function distanceText(slotStart: Minute, originalStart: Minute): string {
  const shift = slotStart - originalStart;
  if (shift === 0) {
    return 'at the original time';
  }
  return `${fmtDuration(Math.abs(shift))} ${shift < 0 ? 'earlier' : 'later'}`;
}

// PRE:  option is a ranked option; originalStart is the event's start (alternatives) or null
// POST: returns why it ranks where it does, in the words of BR-7's "shown to the user as" column
export function optionReasonText(option: SlotOption, originalStart: Minute | null): string {
  const prefix =
    option.criterion === 'priorityAware'
      ? `Priority-aware: ${EFFECTIVE_NAME[option.effectiveCriterion]}. `
      : '';
  switch (option.effectiveCriterion) {
    case 'earliest':
      return `${prefix}Earliest slot that fits.`;
    case 'bestFit':
      return `${prefix}Tightest fit: leaves ${fmtDuration(option.leftoverMin)} unused in this gap.`;
    case 'leastLoaded':
      return `${prefix}Lightest day: ${fmtDuration(option.dayLoadMin)} already booked.`;
    case 'nearest':
      return originalStart === null
        ? `${prefix}Closest to the original time.`
        : `${prefix}Closest to the original time (${distanceText(option.slot.start, originalStart)}).`;
  }
}

// PRE:  priority is the subject's priority
// POST: returns how priorityAware maps it, e.g. "Priority-aware: High priority → earliest slot"
export function priorityAwareText(priority: Priority, effective: EffectiveCriterion): string {
  return `Priority-aware: ${PRIORITY_NAME[priority]} priority → ${EFFECTIVE_NAME[effective]}`;
}

// PRE:  boundary bounds a gap; side says whether it is before or after the gap
// POST: returns what bounds it (BR-8): the neighbouring event and its buffer, a barred slot, or
//       the segment edge, e.g. 'after "Lab" ends 13:45 + 15 min buffer'
export function boundaryText(boundary: Boundary, side: 'before' | 'after'): string {
  if (boundary.kind === 'edge') {
    return EDGE_TEXT[boundary.reason];
  }
  if (boundary.kind === 'barred') {
    return side === 'before'
      ? `after ${boundary.label} (${fmtTime(boundary.at)})`
      : `before ${boundary.label} (${fmtTime(boundary.at)})`;
  }
  const buffer = fmtDuration(boundary.bufferMin);
  if (side === 'before') {
    const base = `after "${boundary.title}" ends ${fmtTime(boundary.at)}`;
    return boundary.bufferMin === 0 ? base : `${base} + ${buffer} buffer`;
  }
  const base = `"${boundary.title}" ${fmtTime(boundary.at)}`;
  return boundary.bufferMin === 0 ? `before ${base}` : `${buffer} buffer before ${base}`;
}

// PRE:  option is a ranked option
// POST: returns its gap line, e.g. 'Gap 14:00–18:00 (4 h): after "Lab" ends 13:45 → working hours end.'
export function gapText(option: SlotOption): string {
  const { gap } = option;
  return `Gap ${fmtTime(gap.start)}–${fmtTime(gap.end)} (${fmtDuration(option.gapMin)}): ${boundaryText(gap.before, 'before')} → ${boundaryText(gap.after, 'after')}.`;
}

// PRE:  option is a ranked option
// POST: returns its leftover and day-load line, e.g. "Leaves 2 h 30 min unused. Day load 2 h."
export function fitText(option: SlotOption): string {
  const leftover =
    option.leftoverMin === 0
      ? 'Fills the gap exactly.'
      : `Leaves ${fmtDuration(option.leftoverMin)} unused.`;
  return `${leftover} Day load ${fmtDuration(option.dayLoadMin)}.`;
}

// PRE:  slot is where a task was scheduled
// POST: returns the success toast, e.g. "Task scheduled for Wed 4 Nov 14:00–15:30."
export function scheduledText(slot: Interval): string {
  return `Task scheduled for ${fmtRange(slot)}.`;
}

// PRE:  0 ≤ scheduled, skipped; scheduled + skipped ≤ total
// POST: returns the queue's summary toast, e.g. "Scheduled 2 of 3 tasks (1 skipped)"
export function queueSummaryText(scheduled: number, total: number, skipped: number): string {
  const base = `Scheduled ${scheduled} of ${counted(total, 'task', 'tasks')}`;
  return skipped === 0 ? base : `${base} (${skipped} skipped)`;
}

// PRE:  reason is a replan move reason
// POST: returns why the event moves (BR-12), e.g. 'conflicts with "Lecture"'
export function moveReasonText(reason: MoveReason): string {
  switch (reason.kind) {
    case 'outsideFlexWindow':
      return 'outside its flex window';
    case 'outsideWorkingHours':
      return 'outside working hours';
    case 'barred':
      return `in the barred slot "${reason.label}"`;
    case 'conflict':
      return `conflicts with "${reason.withTitle}"`;
    case 'buffer':
      return `inside the buffer of "${reason.withTitle}"`;
    case 'balance':
      return `balances the week (day load ${fmtDuration(reason.fromDayLoadMin)} → ${fmtDuration(reason.toDayLoadMin)})`;
  }
}

// PRE:  move is a planned move
// POST: returns its line, e.g. '"Study" Mon 2 Nov 11:00–12:00 → Mon 2 Nov 12:00–13:00 — conflicts with "Lecture"'
export function moveText(move: ReplanMove): string {
  return `"${move.title}" ${fmtRange(move.from)} → ${fmtRange(move.to)} — ${moveReasonText(move.reason)}`;
}

// PRE:  moved ≥ 1 events were moved by the applied plan
// POST: returns the success toast, e.g. "Plan applied: 2 events moved"
export function planAppliedText(moved: number): string {
  return `Plan applied: ${counted(moved, 'event', 'events')} moved`;
}
