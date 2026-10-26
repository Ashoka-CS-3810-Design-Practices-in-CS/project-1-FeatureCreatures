import { useId } from 'react';
import type { Result } from '@/shared/result';
import type { Minute, Priority, SlotSearchResult } from '@/shared/types';
import { errorMessage } from '../../format/errors';
import {
  CRITERIA,
  fitText,
  gapText,
  optionReasonText,
  priorityAwareText,
  searchSummaryText,
} from '../../format/explain';
import { fmtDay, fmtDuration, fmtRange, fmtTime } from '../../format/time';
import type { PickerState } from '../../store/pickerSlice';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';

type TaskPickerState = Extract<PickerState, { mode: 'task' }>;
type AlternativesPickerState = Extract<PickerState, { mode: 'alternatives' }>;

const PRIORITY_NAME: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

// PRE:  result is the picker's search; selected is the chosen option; originalStart is the moved
//       event's start in alternatives mode, else null; uses actions.pickerSelect
// POST: shows the summary line and the ranked options as a radio group with their explanations
//       (BR-8), or, when the search failed, the ER2 / ER3 explanation instead of an empty list
function SearchResults({
  result,
  selected,
  originalStart,
}: {
  result: Result<SlotSearchResult>;
  selected: number;
  originalStart: Minute | null;
}) {
  const pickerSelect = useAppStore((state) => state.actions.pickerSelect);
  const groupName = useId();
  if (!result.ok) {
    return (
      <p role="alert" className="picker-problem">
        {errorMessage(result.error)}
      </p>
    );
  }
  return (
    <>
      <p className="picker-summary">{searchSummaryText(result.value)}</p>
      <fieldset>
        <legend>Available slots</legend>
        {result.value.options.map((option, index) => (
          <div key={option.slot.start} className="picker-option">
            <label>
              <input
                type="radio"
                name={groupName}
                checked={selected === index}
                onChange={() => pickerSelect(index)}
              />{' '}
              {option.rank}. {fmtRange(option.slot)} — {optionReasonText(option, originalStart)}
            </label>
            <p>{gapText(option)}</p>
            <p>{fitText(option)}</p>
          </div>
        ))}
      </fieldset>
    </>
  );
}

// PRE:  bufferMin is the picker's buffer; uses actions.pickerSetBuffer
// POST: shows the buffer override field; a change re-runs the search
function BufferField({ bufferMin }: { bufferMin: number }) {
  const pickerSetBuffer = useAppStore((state) => state.actions.pickerSetBuffer);
  const id = useId();
  return (
    <>
      <label htmlFor={id}>Buffer (min)</label>
      <input
        id={id}
        type="number"
        min={0}
        value={Number.isNaN(bufferMin) ? '' : bufferMin}
        onChange={(event) => pickerSetBuffer(event.target.valueAsNumber)}
      />
    </>
  );
}

// PRE:  picker is a task picker; reads the queued task; uses the picker actions and openDialog
//       + additional props from: SearchResults, BufferField
// POST: shows "Find time — <task> — Task i of N" with the window, buffer, rank-by choice, the
//       results, and Apply selected / Skip / Stop (plus Edit task when nothing can fit)
function TaskPicker({ picker }: { picker: TaskPickerState }) {
  const task = useAppStore((state) =>
    state.snapshot.tasks.find((candidate) => candidate.id === picker.queue[picker.index]),
  );
  const actions = useAppStore((state) => state.actions);
  const rankName = useId();
  if (task === undefined) {
    return null;
  }
  const title = `Find time — "${task.name}" (${fmtDuration(task.durationMin)}, ${PRIORITY_NAME[task.priority]}) — Task ${picker.index + 1} of ${picker.queue.length}`;
  const effective = picker.result.ok
    ? picker.result.value.options[0]?.effectiveCriterion
    : undefined;
  return (
    <Modal open title={title} onClose={actions.pickerStop}>
      <p>
        Window: {fmtDay(task.window.start)} {fmtTime(task.window.start)} → {fmtDay(task.window.end)}{' '}
        {fmtTime(task.window.end)} · {task.useWorkingHours ? 'working hours only' : 'any time'}
      </p>
      <BufferField bufferMin={picker.bufferMin} />
      <fieldset>
        <legend>Rank by</legend>
        {CRITERIA.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={rankName}
              checked={picker.criterion === option.value}
              onChange={() => actions.pickerSetCriterion(option.value)}
            />{' '}
            {option.label}
          </label>
        ))}
      </fieldset>
      {picker.criterion === 'priorityAware' && effective !== undefined && (
        <p>{priorityAwareText(task.priority, effective)}</p>
      )}
      <SearchResults result={picker.result} selected={picker.selected} originalStart={null} />
      <button
        type="button"
        disabled={!picker.result.ok || picker.result.value.options.length === 0}
        onClick={() => void actions.pickerApply()}
      >
        Apply selected
      </button>
      <button type="button" onClick={actions.pickerSkip}>
        Skip
      </button>
      <button type="button" onClick={actions.pickerStop}>
        Stop
      </button>
      {!picker.result.ok && (
        <button
          type="button"
          onClick={() => {
            actions.pickerStop();
            actions.openDialog({ kind: 'task', mode: 'edit', id: task.id });
          }}
        >
          Edit task
        </button>
      )}
    </Modal>
  );
}

// PRE:  picker is an alternatives picker; reads its two events; uses the picker actions
//       + additional props from: SearchResults, BufferField
// POST: shows "Alternatives for <event>" with the Move toggle between the two events, the buffer,
//       the nearest-first results with their distance from the original time, and Apply / Cancel
function AlternativesPicker({ picker }: { picker: AlternativesPickerState }) {
  const events = useAppStore((state) => state.snapshot.events);
  const actions = useAppStore((state) => state.actions);
  const toggleName = useId();
  const target = events.find((event) => event.id === picker.eventId);
  const other = events.find((event) => event.id === picker.otherEventId);
  if (target === undefined) {
    return null;
  }
  const choices = other === undefined ? [target] : [target, other];
  return (
    <Modal
      open
      title={`Alternatives for "${target.title}" (${fmtDuration(target.end - target.start)})`}
      onClose={actions.pickerStop}
    >
      {choices.length > 1 && (
        <fieldset>
          <legend>Move</legend>
          {choices.map((event) => (
            <label key={event.id}>
              <input
                type="radio"
                name={toggleName}
                checked={event.id === target.id}
                onChange={actions.pickerToggleTarget}
              />{' '}
              {event.title}
            </label>
          ))}
        </fieldset>
      )}
      <BufferField bufferMin={picker.bufferMin} />
      <SearchResults
        result={picker.result}
        selected={picker.selected}
        originalStart={target.start}
      />
      <button
        type="button"
        disabled={!picker.result.ok || picker.result.value.options.length === 0}
        onClick={() => void actions.pickerApply()}
      >
        Apply
      </button>
      <button type="button" onClick={actions.pickerStop}>
        Cancel
      </button>
    </Modal>
  );
}

// PRE:  rendered under StoreProvider; reads picker
//       + additional props from: TaskPicker, AlternativesPicker
// POST: shows the slot picker in its current mode (Figure 2), or nothing when it is closed
export function SlotPicker() {
  const picker = useAppStore((state) => state.picker);
  if (picker === null) {
    return null;
  }
  return picker.mode === 'task' ? (
    <TaskPicker picker={picker} />
  ) : (
    <AlternativesPicker picker={picker} />
  );
}
