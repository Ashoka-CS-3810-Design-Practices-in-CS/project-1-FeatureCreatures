import { useId } from 'react';
import type { FieldError, UseFormRegister } from 'react-hook-form';
import type { SettingsFormValues } from '../../forms/settingsForm';
import { WeekdayCheckboxes } from '../WeekdayCheckboxes/WeekdayCheckboxes';
import { ErrorText } from '../Modal/ErrorText';

// PRE:  index is the row's position in barredSlots; register is the settings form's; errors are
//       this row's field errors, if any; onRemove deletes the row
//       + additional props from: WeekdayCheckboxes, ErrorText
// POST: shows one barred slot as a compact one-line group "Barred slot N" (WI-46): label, from–to,
//       day chips and a remove ×, with the field labels kept for assistive technology and any
//       errors on a line below
export function BarredSlotRow({
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
