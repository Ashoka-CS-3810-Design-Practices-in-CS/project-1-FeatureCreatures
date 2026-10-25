// User-visible sentences (TECH_SPEC §11.6): every toast and explanation line is built here, so the
// engine stays free of UI text. WI-21 adds the slot and plan explanations (BR-7, BR-8).

import type { Interval } from '@/shared/types';
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
