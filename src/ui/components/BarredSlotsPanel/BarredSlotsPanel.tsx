import { useId, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { barredDaysText, barredSlotClashes } from '@/shared/barredSlots';
import type { Settings, Weekday } from '@/shared/types';
import {
  newBarredSlotValues,
  settingsFormValues,
  settingsResolver,
  toSettings,
  type SettingsFormValues,
} from '../../forms/settingsForm';
import { useAppStore } from '../../store/appStore';
import { BarredOverlapPanel } from '../ConflictPanel/BarredOverlapPanel';
import { BarredSlotRow } from './BarredSlotRow';
import { Icon } from '../Icon/Icon';

// PRE: isSubmitting reflects this settings form's pending save; onCancel restores saved barred content
// POST: shows the existing non-undoable barred Save/Cancel actions beside the editor that owns them
function BarredSaveActions({
  isSubmitting,
  onCancel,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="barred-editor-actions">
      <button type="submit" aria-label="Save barred slots" disabled={isSubmitting}>
        Save
      </button>
      <button
        type="button"
        aria-label="Cancel barred slot changes"
        disabled={isSubmitting}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

// PRE:  settings is the current structurally valid settings; uses updateSettings
//       + additional props from: BarredSlotRow, BarredSaveActions, Icon
// POST: shows saved summaries with Edit; edits pending rows with colocated Save/Cancel, focused new labels and inline errors;
//       saves through the engine without overwriting unrelated settings
function BarredSlotsEditor({ settings }: { settings: Settings }) {
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const updateSettings = useAppStore((state) => state.actions.updateSettings);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SettingsFormValues>({
    defaultValues: settingsFormValues(settings),
    resolver: settingsResolver,
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'barredSlots',
    keyName: 'rowKey',
  });

  // PRE:  values passed settingsResolver
  // POST: saves only barred content against the latest settings and clears the pending state on success
  async function save(values: SettingsFormValues): Promise<void> {
    const result = await updateSettings({
      ...settings,
      barredSlots: toSettings(values).barredSlots,
    });
    if (result.ok) {
      reset(settingsFormValues(result.value.settings));
      setEditingIds([]);
    }
  }

  return (
    <form
      className="barred-editor"
      aria-label="Edit barred slots"
      noValidate
      onSubmit={(event) => void handleSubmit(save)(event)}
    >
      {fields.length === 0 && <p className="hint">No barred slots.</p>}
      {fields.map((field, index) =>
        editingIds.includes(field.id) ? (
          <BarredSlotRow
            key={field.rowKey}
            index={index}
            register={register}
            errors={errors.barredSlots?.[index]}
            onRemove={() => remove(index)}
            footer={
              <BarredSaveActions
                isSubmitting={isSubmitting}
                onCancel={() => {
                  reset(settingsFormValues(settings));
                  setEditingIds([]);
                }}
              />
            }
          />
        ) : (
          <fieldset key={field.rowKey} className="barred-row barred-summary">
            <legend className="visually-hidden">Barred slot {index + 1}</legend>
            <span>
              {field.label} · {field.start}–{field.end} ·{' '}
              {barredDaysText(field.days.map(Number) as Weekday[], true)}
            </span>
            <button
              type="button"
              aria-label={`Edit barred slot ${field.label}`}
              onClick={() => setEditingIds([...editingIds, field.id])}
            >
              <Icon name="edit" />
            </button>
            <button
              type="button"
              aria-label={`Remove barred slot ${index + 1}`}
              onClick={() => remove(index)}
            >
              ×
            </button>
          </fieldset>
        ),
      )}
      <button
        type="button"
        onClick={() => {
          const slotId = crypto.randomUUID();
          setEditingIds([...editingIds, slotId]);
          append(newBarredSlotValues(slotId, getValues('workDays')), {
            focusName: `barredSlots.${fields.length}.label`,
          });
        }}
      >
        Add barred slot
      </button>
      {isDirty && !fields.some((field) => editingIds.includes(field.id)) && (
        <BarredSaveActions
          isSubmitting={isSubmitting}
          onCancel={() => {
            reset(settingsFormValues(settings));
            setEditingIds([]);
          }}
        />
      )}
    </form>
  );
}

// PRE:  reads snapshot.settings under StoreProvider
//       + additional props from: BarredSlotsEditor, BarredOverlapPanel
// POST: shows the Barred slots editing region, actionable legacy-overlap explanations and overlap/Kept groups
export function BarredSlotsPanel() {
  const settings = useAppStore((state) => state.snapshot.settings);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="barred-slots-panel">
      <h2 id={headingId}>Barred slots ({settings.barredSlots.length})</h2>
      {barredSlotClashes(settings.barredSlots).map((clash) => (
        <p role="status" key={`${clash.firstIndex}-${clash.secondIndex}`}>
          {settings.barredSlots[clash.firstIndex]?.label} and{' '}
          {settings.barredSlots[clash.secondIndex]?.label} overlap on{' '}
          {barredDaysText(clash.days, true)}. Edit one of them.
        </p>
      ))}
      <BarredSlotsEditor key={JSON.stringify(settings)} settings={settings} />
      <BarredOverlapPanel />
    </section>
  );
}
