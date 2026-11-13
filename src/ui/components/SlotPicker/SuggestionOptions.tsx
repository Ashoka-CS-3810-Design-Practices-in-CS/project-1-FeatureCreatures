import { useId, useState } from 'react';
import { SUGGESTION_CHIPS_PER_DAY } from '@/shared/constants';
import { startOfLocalDay } from '@/shared/time';
import type { Minute, SlotOption } from '@/shared/types';
import { fmtDay, fmtRange, fmtTime } from '../../format/time';
import { useAppStore } from '../../store/appStore';
import { optionsByDay, suggestionPicks } from './picks';

interface ChoiceProps {
  option: SlotOption;
  selected: number;
  groupName: string;
}

// PRE:  option is a candidate; selected is its search's selected index; groupName spans all choices
// POST: renders a native radio whose change selects this option in the shared picker
function SlotRadio({ option, selected, groupName }: ChoiceProps) {
  const select = useAppStore((state) => state.actions.pickerSelect);
  return (
    <input
      type="radio"
      name={groupName}
      checked={selected === option.rank - 1}
      onChange={() => select(option.rank - 1)}
    />
  );
}

// PRE:  day is local midnight; options are that day's non-pick candidates in time order
//       + additional props from: SlotRadio
// POST: shows up to eight time chips and a button expanding the remaining candidates
function DayOptions({
  day,
  options,
  selected,
  groupName,
}: {
  day: Minute;
  options: readonly SlotOption[];
  selected: number;
  groupName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const dayId = useId();
  const visible = expanded ? options : options.slice(0, SUGGESTION_CHIPS_PER_DAY);
  const remaining = options.length - visible.length;
  return (
    <div className="picker-day" role="group" aria-labelledby={dayId}>
      <h3 id={dayId}>{fmtDay(day)}</h3>
      <div className="picker-chips">
        {visible.map((option) => (
          <label className="picker-chip" key={option.slot.start}>
            <SlotRadio option={option} selected={selected} groupName={groupName} />
            {startOfLocalDay(option.slot.end - 1) === day
              ? `${fmtTime(option.slot.start)}–${fmtTime(option.slot.end)}`
              : fmtRange(option.slot)}
          </label>
        ))}
      </div>
      {remaining > 0 && (
        <button type="button" aria-expanded={false} onClick={() => setExpanded(true)}>
          Show {remaining} more
        </button>
      )}
    </div>
  );
}

// PRE:  options are all candidates, each rank matches its index + 1; selected identifies one
//       originalStart is the alternatives target's start, or null for tasks
//       + additional props from: SlotRadio, DayOptions
// POST: shows distinct top picks and remaining day chips in one native radio group
export function SuggestionOptions({
  options,
  selected,
  originalStart,
}: {
  options: readonly SlotOption[];
  selected: number;
  originalStart: Minute | null;
}) {
  const groupName = useId();
  const picksId = useId();
  const daysId = useId();
  const picks = suggestionPicks(options, originalStart);
  const days = optionsByDay(options, picks);
  return (
    <fieldset className="picker-slots">
      <legend>Available slots</legend>
      <section aria-labelledby={picksId}>
        <h3 id={picksId}>Top picks</h3>
        <div className="picker-picks">
          {picks.map((pick) => (
            <div className="picker-pick" key={pick.option.slot.start}>
              <label>
                <SlotRadio option={pick.option} selected={selected} groupName={groupName} />
                <span>
                  <strong>{pick.name}</strong> <span>{fmtRange(pick.option.slot)}</span>
                </span>
              </label>
              <p>{pick.reason}</p>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby={daysId}>
        <h3 id={daysId}>All options by day</h3>
        {[...days].map(([day, dayOptions]) => (
          <DayOptions
            key={day}
            day={day}
            options={dayOptions}
            selected={selected}
            groupName={groupName}
          />
        ))}
        {days.size === 0 && (
          <p className="picker-note">All available slots are shown in Top picks.</p>
        )}
      </section>
    </fieldset>
  );
}
