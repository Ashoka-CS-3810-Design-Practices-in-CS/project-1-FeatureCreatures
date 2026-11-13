import { MAX_OPTIONS } from '@/shared/constants';
import type { CalendarEvent, DayFrame, FreeGap, ReplanStrategy, SlotOption } from '@/shared/types';
import { computeDayLoads, frameOf } from './dayLoad';
import { optionFor, rankCandidates, rankOptions, type RankContext } from './rank';

// Strategy pattern: Replan selects a numeric sort key while sharing candidates and safety rules.
// PRE: option has valid ranking data; strategy is a category strategy; sameCategoryMin is its day's load
// POST: returns the D-15 category key, ending in distance and start as the final tie-breaks
export function replanSortKey(
  option: Pick<SlotOption, 'slot' | 'distanceMin' | 'dayLoadMin'>,
  strategy: 'clusterByCategory' | 'varyCategories',
  sameCategoryMin: number,
): number[] {
  const distance = option.distanceMin ?? 0;
  const start = option.slot.start;
  switch (strategy) {
    case 'clusterByCategory':
      return [-sameCategoryMin, distance, start];
    case 'varyCategories':
      return [sameCategoryMin, option.dayLoadMin, distance, start];
  }
}

// PRE: fitting contains valid gaps of at least context.durationMin; occupied is sorted;
//      context.frames covers every gap; strategy is validated; categoryId is the event category
// POST: ranks one candidate per gap by D-15; default Balanced is unchanged; Front-load/Fewer fragments
//       start at the gap edge; category strategies clamp nearest, rank all gaps before limiting
export function rankReplanOptions(
  fitting: readonly FreeGap[],
  context: RankContext,
  strategy: ReplanStrategy,
  occupied: readonly CalendarEvent[],
  categoryId: string,
): SlotOption[] {
  if (strategy === 'balanced') return rankOptions(fitting, context);
  if (strategy === 'frontLoad' || strategy === 'fewerFragments') {
    return rankOptions(fitting, {
      ...context,
      criterion: strategy === 'frontLoad' ? 'earliest' : 'bestFit',
      originalStart: null,
    });
  }
  const categoryLoads = computeDayLoads(
    occupied.filter((event) => event.categoryId === categoryId),
    context.frames,
  );
  return rankCandidates(
    fitting.map((gap) => optionFor(gap, context)),
    (option) => {
      const frame = frameOf(context.frames, option.slot.start) as DayFrame;
      const sameCategoryMin = categoryLoads.get(frame.dayStart) as number;
      return replanSortKey(option, strategy, sameCategoryMin);
    },
  ).slice(0, MAX_OPTIONS);
}
