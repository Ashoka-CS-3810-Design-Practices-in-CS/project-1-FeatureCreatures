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
const EXPORT_MIME_TYPE = 'application/json';
const REPLACE_ALL_BODY = 'This replaces all your events, tasks and settings.';

// PRE:  legend names the group; registration is RHF's register() result for a string[] field;
//       error is that field's error, if any; errorId is the id its message gets
// POST: shows one checkbox per weekday (Monday first) bound to the field, then its error
function WeekdayCheckboxes({
  legend,
  registration,
  error,
  errorId,
}: {
  legend: string;
  registration: UseFormRegisterReturn;
  error: Pick<FieldError, 'message'> | undefined;
  errorId: string;
}) {
  return (
    <fieldset aria-describedby={error === undefined ? undefined : errorId}>
      <legend>{legend}</legend>
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
// POST: shows one barred slot as a group "Barred slot N": label, from, to, days and Remove
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
    <fieldset>
      <legend>{name}</legend>
      <label htmlFor={fieldId('label')}>Label</label>
      <input
        id={fieldId('label')}
        type="text"
        {...register(`barredSlots.${index}.label`)}
        {...described('label')}
      />
      <ErrorText id={errorId('label')} error={errors?.label} />
      <label htmlFor={fieldId('start')}>From</label>
      <input
        id={fieldId('start')}
        type="time"
        {...register(`barredSlots.${index}.start`)}
        {...described('start')}
      />
      <ErrorText id={errorId('start')} error={errors?.start} />
      <label htmlFor={fieldId('end')}>To</label>
      <input
        id={fieldId('end')}
        type="time"
        {...register(`barredSlots.${index}.end`)}
        {...described('end')}
      />
      <ErrorText id={errorId('end')} error={errors?.end} />
      <WeekdayCheckboxes
        legend="Days"
        registration={register(`barredSlots.${index}.days`)}
        error={errors?.days}
        errorId={errorId('days')}
      />
      <button type="button" aria-label={`Remove ${name.toLowerCase()}`} onClick={onRemove}>
        Remove
      </button>
    </fieldset>
  );
}

// PRE:  rendered under StoreProvider; settings are the current settings; uses
//       actions.updateSettings and closeDialog
//       + additional props from: WeekdayCheckboxes, BarredSlotRow, ErrorText
// POST: shows the settings form (working days and hours, default buffer, default ranking, barred
//       slots with Add / Remove); Save validates with settingsResolver (errors inline, FR11) before
//       saving, and closes the dialog once saved
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
    <form noValidate onSubmit={(event) => void handleSubmit(save)(event)}>
      <WeekdayCheckboxes
        legend="Working days"
        registration={register('workDays')}
        error={errors.workDays}
        errorId={errorId('workDays')}
      />

      <label htmlFor={fieldId('workStart')}>Working hours from</label>
      <input
        id={fieldId('workStart')}
        type="time"
        {...register('workStart')}
        {...described('workStart')}
      />
      <ErrorText id={errorId('workStart')} error={errors.workStart} />
      <label htmlFor={fieldId('workEnd')}>Working hours to</label>
      <input
        id={fieldId('workEnd')}
        type="time"
        {...register('workEnd')}
        {...described('workEnd')}
      />
      <ErrorText id={errorId('workEnd')} error={errors.workEnd} />

      <label htmlFor={fieldId('bufferMin')}>Default buffer (min)</label>
      <input
        id={fieldId('bufferMin')}
        type="number"
        min={0}
        inputMode="numeric"
        {...register('bufferMin')}
        {...described('bufferMin')}
      />
      <ErrorText id={errorId('bufferMin')} error={errors.bufferMin} />

      <label htmlFor={fieldId('defaultCriterion')}>Default ranking</label>
      <select id={fieldId('defaultCriterion')} {...register('defaultCriterion')}>
        {CRITERIA.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <fieldset>
        <legend>Barred slots</legend>
        {fields.length === 0 && <p>No barred slots.</p>}
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
          onClick={() => append(newBarredSlotValues(crypto.randomUUID(), getValues('workDays')))}
        >
          Add barred slot
        </button>
      </fieldset>

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

// PRE:  fileName is the download's name; json is its content
// POST: makes the browser download json as fileName (Blob + object URL, TECH_SPEC §9.4)
function downloadJson(fileName: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: EXPORT_MIME_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking on the next tick lets the browser start the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
    <Modal open title="Settings" onClose={closeDialog}>
      <SettingsForm settings={settings} />
      <DataSection />
    </Modal>
  );
}
