import { useId, useState, type ChangeEvent } from 'react';
import {
  useFieldArray,
  useForm,
  type FieldError,
  type UseFormRegister,
  type UseFormRegisterReturn,
} from 'react-hook-form';
import { SAMPLES, type SampleId } from '@/data/samples';
import type { Settings } from '@/shared/types';
import { CRITERIA } from '../../format/explain';
import {
  newBarredSlotValues,
  settingsFormValues,
  settingsResolver,
  toSettings,
  type SettingsFormValues,
} from '../../forms/settingsForm';
import { downloadJson, EXPORT_MIME_TYPE } from '../../hooks/download';
import { useAppStore } from '../../store/appStore';
import { ErrorText } from '../Modal/ErrorText';
import { Modal } from '../Modal/Modal';

// Monday first, as on the calendar; the values are the weekday numbers (0 = Sunday).
const WEEKDAYS: { value: string; label: string }[] = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
];
const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];
const DEFAULT_SAMPLE: SampleId = 'sparseWeek';
const REPLACE_ALL_BODY = 'This replaces all your events, tasks and settings.';

// PRE:  legend names the group; registration is RHF's register() result for a string[] field;
//       error is that field's error, if any; errorId is the id its message gets
//       hideLegend keeps the legend for assistive technology only (compact barred rows)
// POST: shows one checkbox per weekday (Monday first) as a row of day chips (WI-46) bound to the
//       field, then its error
function WeekdayCheckboxes({
  legend,
  registration,
  error,
  errorId,
  hideLegend = false,
}: {
  legend: string;
  registration: UseFormRegisterReturn;
  error: Pick<FieldError, 'message'> | undefined;
  errorId: string;
  hideLegend?: boolean;
}) {
  return (
    <fieldset className="day-chips" aria-describedby={error === undefined ? undefined : errorId}>
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{legend}</legend>
      {WEEKDAYS.map((day) => (
        <label key={day.value}>
          <input type="checkbox" value={day.value} {...registration} /> {day.label}
        </label>
      ))}
      <ErrorText id={errorId} error={error} />
    </fieldset>
  );
}

// PRE:  index is the row's position in barredSlots; register is the settings form's; errors are
//       this row's field errors, if any; onRemove deletes the row
//       + additional props from: WeekdayCheckboxes, ErrorText
// POST: shows one barred slot as a compact one-line group "Barred slot N" (WI-46): label, from–to,
//       day chips and a remove ×, with the field labels kept for assistive technology and any
//       errors on a line below
function BarredSlotRow({
  index,
  register,
  errors,
  onRemove,
}: {
  index: number;
  register: UseFormRegister<SettingsFormValues>;
  errors:
    Partial<Record<'label' | 'start' | 'end' | 'days', Pick<FieldError, 'message'>>> | undefined;
  onRemove: () => void;
}) {
  const idPrefix = useId();
  const name = `Barred slot ${index + 1}`;
  const fieldId = (field: string) => `${idPrefix}-${field}`;
  const errorId = (field: string) => `${idPrefix}-${field}-error`;
  const described = (field: 'label' | 'start' | 'end') =>
    errors?.[field] === undefined
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': errorId(field) };

  return (
    <fieldset className="barred-row">
      <legend className="visually-hidden">{name}</legend>
      <label className="visually-hidden" htmlFor={fieldId('label')}>
        Label
      </label>
      <input
        id={fieldId('label')}
        className="barred-label-input"
        type="text"
        {...register(`barredSlots.${index}.label`)}
        {...described('label')}
      />
      <span className="barred-times">
        <label className="visually-hidden" htmlFor={fieldId('start')}>
          From
        </label>
        <input
          id={fieldId('start')}
          type="time"
          {...register(`barredSlots.${index}.start`)}
          {...described('start')}
        />
        <span aria-hidden="true">–</span>
        <label className="visually-hidden" htmlFor={fieldId('end')}>
          To
        </label>
        <input
          id={fieldId('end')}
          type="time"
          {...register(`barredSlots.${index}.end`)}
          {...described('end')}
        />
      </span>
      <WeekdayCheckboxes
        legend="Days"
        hideLegend
        registration={register(`barredSlots.${index}.days`)}
        error={errors?.days}
        errorId={errorId('days')}
      />
      <button
        type="button"
        className="barred-remove"
        aria-label={`Remove ${name.toLowerCase()}`}
        onClick={onRemove}
      >
        ×
      </button>
      <span className="barred-row-errors">
        <ErrorText id={errorId('label')} error={errors?.label} />
        <ErrorText id={errorId('start')} error={errors?.start} />
        <ErrorText id={errorId('end')} error={errors?.end} />
      </span>
    </fieldset>
  );
}

// PRE:  rendered under StoreProvider; settings are the current settings; uses
//       actions.updateSettings and closeDialog
//       + additional props from: WeekdayCheckboxes, BarredSlotRow, ErrorText
// POST: shows the settings form in headed sections (WI-46): Working time (days and hours),
//       Scheduling defaults (buffer, ranking) and Barred slots (one compact row each, Add puts a
//       new one at the end and focuses its label); Save validates with settingsResolver (errors
//       inline, FR11) before saving, and closes the dialog once saved
function SettingsForm({ settings }: { settings: Settings }) {
  const actions = useAppStore((state) => state.actions);
  const idPrefix = useId();
  const {
    register,
    control,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: settingsResolver,
    defaultValues: settingsFormValues(settings),
  });
  // keyName keeps RHF's row keys apart from each slot's own id field.
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'barredSlots',
    keyName: 'rowKey',
  });
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const errorId = (name: string) => `${idPrefix}-${name}-error`;
  const headingId = (name: string) => `${idPrefix}-${name}-heading`;
  const described = (name: 'workStart' | 'workEnd' | 'bufferMin') =>
    errors[name] === undefined ? {} : { 'aria-invalid': true, 'aria-describedby': errorId(name) };

  // PRE:  values passed settingsResolver
  // POST: saves the settings; closes the dialog on success, stays open on failure
  async function save(values: SettingsFormValues): Promise<void> {
    const result = await actions.updateSettings(toSettings(values));
    if (result.ok) {
      actions.closeDialog();
    }
  }

  return (
    <form className="settings-form" noValidate onSubmit={(event) => void handleSubmit(save)(event)}>
      <section aria-labelledby={headingId('working')}>
        <h3 id={headingId('working')}>Working time</h3>
        <WeekdayCheckboxes
          legend="Working days"
          registration={register('workDays')}
          error={errors.workDays}
          errorId={errorId('workDays')}
        />
        <div className="field-pair">
          <span>
            <label htmlFor={fieldId('workStart')}>Working hours from</label>
            <input
              id={fieldId('workStart')}
              type="time"
              {...register('workStart')}
              {...described('workStart')}
            />
          </span>
          <span>
            <label htmlFor={fieldId('workEnd')}>Working hours to</label>
            <input
              id={fieldId('workEnd')}
              type="time"
              {...register('workEnd')}
              {...described('workEnd')}
            />
          </span>
        </div>
        <ErrorText id={errorId('workStart')} error={errors.workStart} />
        <ErrorText id={errorId('workEnd')} error={errors.workEnd} />
      </section>

      <section aria-labelledby={headingId('defaults')}>
        <h3 id={headingId('defaults')}>Scheduling defaults</h3>
        <div className="field-pair">
          <span>
            <label htmlFor={fieldId('bufferMin')}>Default buffer (min)</label>
            <input
              id={fieldId('bufferMin')}
              type="number"
              min={0}
              inputMode="numeric"
              {...register('bufferMin')}
              {...described('bufferMin')}
            />
          </span>
          <span>
            <label htmlFor={fieldId('defaultCriterion')}>Default ranking</label>
            <select id={fieldId('defaultCriterion')} {...register('defaultCriterion')}>
              {CRITERIA.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </div>
        <ErrorText id={errorId('bufferMin')} error={errors.bufferMin} />
      </section>

      <section aria-labelledby={headingId('barred')}>
        <h3 id={headingId('barred')}>Barred slots</h3>
        {fields.length === 0 ? (
          <p className="hint">No barred slots.</p>
        ) : (
          <p className="barred-columns" aria-hidden="true">
            <span>Label</span>
            <span>From – To</span>
            <span>Days</span>
          </p>
        )}
        {fields.map((field, index) => (
          <BarredSlotRow
            key={field.rowKey}
            index={index}
            register={register}
            errors={errors.barredSlots?.[index]}
            onRemove={() => remove(index)}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            append(newBarredSlotValues(crypto.randomUUID(), getValues('workDays')), {
              focusName: `barredSlots.${fields.length}.label`,
            })
          }
        >
          Add barred slot
        </button>
      </section>

      <div className="dialog-actions">
        <button type="submit" disabled={isSubmitting}>
          Save
        </button>
        <button type="button" onClick={actions.closeDialog}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// PRE:  rendered under StoreProvider; reads whether the calendar is empty; uses the data actions,
//       loadSample, openDialog and closeDialog
// POST: shows the Data section (B2): Export JSON downloads the export; Import JSON checks the
//       chosen file (ER6) and replaces everything after confirmation; Load sample calendar loads
//       the chosen sample (after confirmation unless the calendar is empty); Clear all data empties
//       the calendar after confirmation
function DataSection() {
  const isEmpty = useAppStore(
    (state) => state.snapshot.events.length === 0 && state.snapshot.tasks.length === 0,
  );
  const actions = useAppStore((state) => state.actions);
  const [sampleId, setSampleId] = useState<SampleId>(DEFAULT_SAMPLE);
  const idPrefix = useId();
  const headingId = `${idPrefix}-heading`;

  // PRE:  none
  // POST: downloads the current data as calendar-export-YYYY-MM-DD.json
  function exportData(): void {
    const { fileName, json } = actions.exportFile();
    downloadJson(fileName, json);
  }

  // PRE:  event comes from the Import JSON file input
  // POST: reads the chosen file; when it is a valid export, asks to replace everything with it
  //       (the ER6 toast reports an invalid one); resets the input so the same file can be picked again
  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    const json = await file.text();
    input.value = '';
    if (!actions.checkImport(json)) {
      return;
    }
    actions.openDialog({
      kind: 'confirm',
      title: 'Import calendar?',
      body: REPLACE_ALL_BODY,
      confirmLabel: 'Import',
      onConfirm: () => void actions.importData(json),
    });
  }

  // PRE:  none
  // POST: loads the chosen sample and closes the dialog; asks first when there is data to replace
  function loadSample(): void {
    if (isEmpty) {
      actions.closeDialog();
      void actions.loadSample(sampleId);
      return;
    }
    actions.openDialog({
      kind: 'confirm',
      title: 'Load sample calendar?',
      body: REPLACE_ALL_BODY,
      confirmLabel: 'Load sample',
      onConfirm: () => void actions.loadSample(sampleId),
    });
  }

  // PRE:  none
  // POST: asks for confirmation, then empties the calendar and resets the settings
  function confirmClear(): void {
    actions.openDialog({
      kind: 'confirm',
      title: 'Clear all data?',
      body: 'This deletes every event and task and resets the settings to their defaults. It cannot be undone.',
      confirmLabel: 'Clear all data',
      onConfirm: () => void actions.clearAllData(),
    });
  }

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>Data</h3>
      <button type="button" onClick={exportData}>
        Export JSON
      </button>
      <label htmlFor={`${idPrefix}-import`}>Import JSON</label>
      <input
        id={`${idPrefix}-import`}
        type="file"
        accept={EXPORT_MIME_TYPE}
        onChange={(event) => void importFile(event)}
      />
      <label htmlFor={`${idPrefix}-sample`}>Load sample calendar</label>
      <select
        id={`${idPrefix}-sample`}
        value={sampleId}
        onChange={(event) => setSampleId(event.target.value as SampleId)}
      >
        {SAMPLE_IDS.map((id) => (
          <option key={id} value={id}>
            {SAMPLES[id].label}
          </option>
        ))}
      </select>
      <button type="button" onClick={loadSample}>
        Load sample
      </button>
      <button type="button" onClick={confirmClear}>
        Clear all data
      </button>
    </section>
  );
}

// PRE:  rendered under StoreProvider; reads dialog and snapshot.settings; uses actions.closeDialog
//       + additional props from: SettingsForm, DataSection
// POST: while the settings dialog is open, shows the settings form (fresh from the current
//       settings each time it opens) and the Data section (FR11, B2)
export function SettingsDialog() {
  const isOpen = useAppStore((state) => state.dialog?.kind === 'settings');
  const settings = useAppStore((state) => state.snapshot.settings);
  const closeDialog = useAppStore((state) => state.actions.closeDialog);
  if (!isOpen) {
    return null;
  }

  return (
    <Modal open title="Settings" className="settings-dialog" onClose={closeDialog}>
      <SettingsForm settings={settings} />
      <DataSection />
    </Modal>
  );
}
