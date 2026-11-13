import { startOfLocalDay } from '@/shared/time';
import type { Minute, SlotOption } from '@/shared/types';
import { distanceText } from '../../format/explain';
import { fmtDay, fmtDuration } from '../../format/time';

export interface SuggestionPick {
  name: string;
  option: SlotOption;
  reason: string;
}

// PRE:  first and second are options for the same search
// POST: orders by distance from the original start, then earlier start; tasks use earlier start
function nearerFirst(first: SlotOption, second: SlotOption): number {
  return (
    (first.distanceMin ?? 0) - (second.distanceMin ?? 0) || first.slot.start - second.slot.start
  );
}

// PRE:  options are all ranked candidates of one search; originalStart identifies alternatives
// POST: returns up to three named D-06 picks in display order, with each slot represented once
export function suggestionPicks(
  options: readonly SlotOption[],
  originalStart: Minute | null,
): SuggestionPick[] {
  const nearest = options.toSorted(nearerFirst)[0];
  if (nearest === undefined) return [];
  const lightest = options.toSorted(
    (first, second) => first.dayLoadMin - second.dayLoadMin || nearerFirst(first, second),
  )[0] as SlotOption;
  const lightestPick = {
    name: 'Lightest day',
    option: lightest,
    reason: `${fmtDay(lightest.slot.start).split(' ')[0]} has ${fmtDuration(lightest.dayLoadMin)} booked`,
  };
  const picks: SuggestionPick[] = [];
  if (originalStart === null) {
    const earliest = options.toSorted(
      (first, second) => first.slot.start - second.slot.start,
    )[0] as SlotOption;
    const tightest = options.toSorted(
      (first, second) =>
        first.leftoverMin - second.leftoverMin || first.slot.start - second.slot.start,
    )[0] as SlotOption;
    picks.push(
      { name: 'Earliest', option: earliest, reason: 'First available time in the window' },
      {
        name: 'Tightest fit',
        option: tightest,
        reason: `Leaves ${fmtDuration(tightest.leftoverMin)} unused in this gap`,
      },
    );
  } else {
    picks.push({
      name: 'Closest',
      option: nearest,
      reason: distanceText(nearest.slot.start, originalStart),
    });
    const sameDay = options
      .filter((option) => startOfLocalDay(option.slot.start) === startOfLocalDay(originalStart))
      .toSorted(nearerFirst)[0];
    if (sameDay !== undefined) {
      picks.push({
        name: 'Same day',
        option: sameDay,
        reason: `${distanceText(sameDay.slot.start, originalStart)}, same day`,
      });
    }
  }
  picks.push(lightestPick);
  return picks.filter(
    (pick, index) =>
      picks.findIndex((other) => other.option.slot.start === pick.option.slot.start) === index,
  );
}

// PRE:  options are candidates for one duration; picks contains their named picks
// POST: returns the remaining options grouped by local start day, with days and slots in time order
export function optionsByDay(
  options: readonly SlotOption[],
  picks: readonly SuggestionPick[],
): Map<Minute, SlotOption[]> {
  const days = new Map<Minute, SlotOption[]>();
  const pickedStarts = new Set(picks.map((pick) => pick.option.slot.start));
  const chips = options
    .filter((option) => !pickedStarts.has(option.slot.start))
    .toSorted((first, second) => first.slot.start - second.slot.start);
  // INVARIANT: days contains every earlier chip once, grouped by local day in increasing time order
  for (const option of chips) {
    const day = startOfLocalDay(option.slot.start);
    const group = days.get(day) ?? [];
    group.push(option);
    days.set(day, group);
  }
  // POST: days contains every non-pick candidate once, in local-day and slot-start order
  return days;
}
