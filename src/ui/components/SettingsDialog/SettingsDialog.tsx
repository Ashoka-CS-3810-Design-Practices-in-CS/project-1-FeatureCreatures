import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { SAMPLES, type SampleId } from '@/data/samples';
import type { Settings } from '@/shared/types';
import { CRITERIA } from '../../format/explain';
import {
  settingsFormValues,
  settingsDefaultsResolver,
  toSettings,
  type SettingsFormValues,
} from '../../forms/settingsForm';
import { downloadJson, EXPORT_MIME_TYPE } from '../../hooks/download';
import { useAppStore } from '../../store/appStore';
import { ErrorText } from '../Modal/ErrorText';
import { Modal } from '../Modal/Modal';
import { CategoriesSection } from '../Categories/CategoriesSection';
import { WeekdayCheckboxes } from '../WeekdayCheckboxes/WeekdayCheckboxes';
import { AppearanceSection } from './AppearanceSection';

const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];
const DEFAULT_SAMPLE: SampleId = 'sparseWeek';
const REPLACE_ALL_BODY = 'This replaces all your events, tasks and settings.';

// PRE:  rendered under StoreProvider; settings are the current settings; uses
//       actions.updateSettings and closeDialog
//       + additional props from: WeekdayCheckboxes, ErrorText
// POST: shows Working time with a global switch and retained days/hours disabled while off,
//       and Scheduling defaults (buffer/ranking); Save validates editable settings while retaining
//       legacy barred rows, which are edited separately, then closes on success
function SettingsForm({ settings }: { settings: Settings }) {
  const actions = useAppStore((state) => state.actions);
  const idPrefix = useId();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: settingsDefaultsResolver,
    defaultValues: settingsFormValues(settings),
  });
  const useWorkingHours = useWatch({ control, name: 'useWorkingHours' });
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const errorId = (name: string) => `${idPrefix}-${name}-error`;
  const headingId = (name: string) => `${idPrefix}-${name}-heading`;
  const described = (name: 'workStart' | 'workEnd' | 'bufferMin') =>
    errors[name] === undefined ? {} : { 'aria-invalid': true, 'aria-describedby': errorId(name) };

  // PRE:  values passed settingsDefaultsResolver; barred rows were retained unchanged
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
        <label>
          <input type="checkbox" role="switch" {...register('useWorkingHours')} /> Use working hours
        </label>
        {!useWorkingHours && (
          <p className="hint">Every day is available. Barred slots still apply.</p>
        )}
        <fieldset disabled={!useWorkingHours} aria-label="Working days and hours">
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
        </fieldset>
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
  const importInput = useRef<HTMLInputElement>(null);
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
      <button type="button" onClick={() => importInput.current?.click()}>
        Import JSON
      </button>
      <input
        ref={importInput}
        aria-label="Import JSON"
        hidden
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
//       + additional props from: SettingsForm, CategoriesSection, AppearanceSection, DataSection
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
      <CategoriesSection />
      <AppearanceSection />
      <DataSection />
    </Modal>
  );
}
