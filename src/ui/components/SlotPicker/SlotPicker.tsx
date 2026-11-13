import { useId, useState } from 'react';
import { addLocalDays } from '@/shared/time';
import { fromDateInput, toDateInput } from '../../forms/eventForm';
import type { Result } from '@/shared/result';
import type { Minute, Priority, SlotSearchResult, WindowExplanation } from '@/shared/types';
import { errorMessage } from '../../format/errors';
import {
  CRITERIA,
  fitText,
  gapText,
  priorityAwareText,
  searchSummaryText,
  stretchesText,
} from '../../format/explain';
import { fmtDay, fmtDuration, fmtRange, fmtTime } from '../../format/time';
import type { PickerState } from '../../store/pickerSlice';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';
import { SuggestionOptions } from './SuggestionOptions';

type TaskPickerState = Extract<PickerState, { mode: 'task' }>;
type AlternativesPickerState = Extract<PickerState, { mode: 'alternatives' }>;

// PRE:  minute is a supported Minute or NaN while a date input is empty
// POST: returns its date-input value, or '' for an empty/invalid input
function rangeDate(minute: Minute): string {
  return Number.isFinite(minute) ? toDateInput(minute) : '';
}

// PRE:  picker is an alternatives picker; uses pickerSetRange
// POST: edits an inclusive From/To pair mapped to the engine's half-open temporary range
function TemporaryRange({ picker }: { picker: AlternativesPickerState }) {
  const setRange = useAppStore((state) => state.actions.pickerSetRange);
  const id = useId();
  return (
    <div className="field-pair">
      <span>
        <label htmlFor={`${id}-from`}>From</label>
        <input
          id={`${id}-from`}
          type="date"
          value={rangeDate(picker.range.start)}
          onChange={(event) =>
            setRange({ ...picker.range, start: fromDateInput(event.target.value) })
          }
        />
      </span>
      <span>
        <label htmlFor={`${id}-to`}>To</label>
        <input
          id={`${id}-to`}
          type="date"
          value={rangeDate(picker.range.end - 1)}
          onChange={(event) =>
            setRange({
              ...picker.range,
              end:
                event.target.value === ''
                  ? Number.NaN
                  : addLocalDays(fromDateInput(event.target.value), 1),
            })
          }
        />
      </span>
    </div>
  );
}

const PRIORITY_NAME: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

// PRE:  result is the picker's search; explanation is what is left of its window after ER2 / ER3
//       (null otherwise); selected is the chosen option; originalStart is the moved event's start
//       in alternatives mode, else null; bufferMin is the override, windowNote the optional task window
//       + additional props from: SuggestionOptions, BufferField
// POST: shows picks/day chips or the always-visible empty-result explanation; Details reveals
//       BR-8 summary, window, buffer and the selected slot's explanation, initially hidden
function SearchResults({
  result,
  explanation,
  selected,
  originalStart,
  bufferMin,
  windowNote,
}: {
  result: Result<SlotSearchResult>;
  explanation: WindowExplanation | null;
  selected: number;
  originalStart: Minute | null;
  bufferMin: number;
  windowNote?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const option = result.ok ? result.value.options[selected] : undefined;
  const stretches =
    result.ok || explanation === null
      ? null
      : stretchesText(result.error.code === 'NoSlotFound' ? explanation.free : explanation.allowed);
  return (
    <>
      {result.ok ? (
        <SuggestionOptions
          options={result.value.options}
          selected={selected}
          originalStart={originalStart}
        />
      ) : (
        <>
          <p role="alert" className="picker-problem">
            {errorMessage(result.error)}
          </p>
          {stretches !== null && <p className="picker-note">{stretches}</p>}
        </>
      )}
      <button
        type="button"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={() => setDetailsOpen(!detailsOpen)}
      >
        Details
      </button>
      {detailsOpen && (
        <div id={detailsId} className="picker-details">
          {result.ok && (
            <>
              <p className="picker-summary">{searchSummaryText(result.value)}</p>
              <p>Search window: {fmtRange(result.value.searchWindow)}</p>
            </>
          )}
          {windowNote !== undefined && <p>Window: {windowNote}</p>}
          <BufferField bufferMin={bufferMin} />
          {option !== undefined && (
            <div className="picker-selected-details">
              <p>Selected: {fmtRange(option.slot)}</p>
              <p>{gapText(option)}</p>
              <p>{fitText(option)}</p>
            </div>
          )}
        </div>
      )}
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

// PRE:  useWorkingHours is the alternatives picker's choice; uses actions.pickerSetWorkingHours
// POST: shows the "Search hours" radios Working hours only / Any time (WI-41); a change re-runs
//       the search (barred slots apply either way)
function SearchHoursField({ useWorkingHours }: { useWorkingHours: boolean }) {
  const pickerSetWorkingHours = useAppStore((state) => state.actions.pickerSetWorkingHours);
  const groupName = useId();
  return (
    <fieldset>
      <legend>Search hours</legend>
      <label>
        <input
          type="radio"
          name={groupName}
          checked={useWorkingHours}
          onChange={() => pickerSetWorkingHours(true)}
        />{' '}
        Working hours only
      </label>
      <label>
        <input
          type="radio"
          name={groupName}
          checked={!useWorkingHours}
          onChange={() => pickerSetWorkingHours(false)}
        />{' '}
        Any time
      </label>
    </fieldset>
  );
}

// PRE:  picker is a task picker; reads the queued task and settings.useWorkingHours; uses picker actions and openDialog
//       + additional props from: SearchResults, BufferField
// POST: shows "Find time — <task> — Task i of N", Rank by and the shared picker; task window
//       and buffer are behind Details; Apply selected / Skip / Stop retain queue behaviour
function TaskPicker({ picker }: { picker: TaskPickerState }) {
  const useWorkingHours = useAppStore((state) => state.snapshot.settings.useWorkingHours);
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
    <Modal open title={title} onClose={actions.pickerStop} className="suggestion-dialog">
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
      <SearchResults
        result={picker.result}
        explanation={picker.explanation}
        selected={picker.selected}
        originalStart={null}
        bufferMin={picker.bufferMin}
        windowNote={`${fmtDay(task.window.start)} ${fmtTime(task.window.start)} → ${fmtDay(task.window.end)} ${fmtTime(task.window.end)} · ${useWorkingHours && task.useWorkingHours ? 'working hours only' : 'any time'}`}
      />
      <div className="dialog-actions">
        <button
          type="button"
          className="primary"
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
      </div>
    </Modal>
  );
}

// PRE:  picker is an alternatives picker; reads its two events and settings.useWorkingHours;
//       uses the picker actions
//       + additional props from: SearchResults, BufferField
//       + SearchHoursField, TemporaryRange
// POST: shows "Alternatives for <event>" with the Move toggle between the two events, a note when
//       the target is fixed (BR-10 may still pick it), opt-in/range controls, search hours when globally on, the buffer, the
//       shared picks/day chips, optional Details and Apply / Cancel
function AlternativesPicker({ picker }: { picker: AlternativesPickerState }) {
  const useWorkingHours = useAppStore((state) => state.snapshot.settings.useWorkingHours);
  const events = useAppStore((state) => state.snapshot.events);
  const actions = useAppStore((state) => state.actions);
  const toggleName = useId();
  const target = events.find((event) => event.id === picker.eventId);
  const other = events.find((event) => event.id === picker.otherEventId);
  if (target === undefined) {
    return null;
  }
  // The radios keep the order the picker opened with (WI-45, #5), whichever one is selected.
  const choices =
    other === undefined
      ? [target]
      : (picker.order ?? [target.id, other.id])
          .map((id) => (id === target.id ? target : other))
          .filter((event) => event !== undefined);
  return (
    <Modal
      open
      title={`Alternatives for "${target.title}" (${fmtDuration(target.end - target.start)})`}
      onClose={actions.pickerStop}
      className="suggestion-dialog"
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
      {!target.flexible && (
        <div>
          {!picker.allowMoving && (
            <p className="picker-note">
              {target.title} is fixed, so no suggestions are made for it.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={picker.allowMoving}
              onChange={(event) => actions.pickerSetAllowMoving(event.target.checked)}
            />{' '}
            Allow moving this event
          </label>
          {picker.allowMoving && <TemporaryRange picker={picker} />}
        </div>
      )}
      {(target.flexible || picker.allowMoving) && (
        <>
          {useWorkingHours && <SearchHoursField useWorkingHours={picker.useWorkingHours} />}
          <SearchResults
            result={picker.result}
            explanation={picker.explanation}
            selected={picker.selected}
            originalStart={target.start}
            bufferMin={picker.bufferMin}
          />
        </>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="primary"
          disabled={!picker.result.ok || picker.result.value.options.length === 0}
          onClick={() => void actions.pickerApply()}
        >
          Apply
        </button>
        <button type="button" onClick={actions.pickerStop}>
          Cancel
        </button>
      </div>
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
