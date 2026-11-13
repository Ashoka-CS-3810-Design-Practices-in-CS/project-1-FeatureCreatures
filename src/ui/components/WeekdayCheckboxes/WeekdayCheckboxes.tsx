import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';
import { WEEKDAY_ORDER, WEEKDAY_NAMES } from '@/shared/constants';
import { ErrorText } from '../Modal/ErrorText';

// PRE:  legend names the group; registration is RHF's register() result for a string[] field;
//       error is that field's error, if any; errorId is the id its message gets
//       hideLegend keeps the legend for assistive technology only (compact barred rows)
// POST: shows one checkbox per weekday (Monday first) as a row of day chips (WI-46) bound to the
//       field, then its error
export function WeekdayCheckboxes({
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
      {WEEKDAY_ORDER.map((day) => (
        <label key={String(day)}>
          <input type="checkbox" value={String(day)} {...registration} /> {WEEKDAY_NAMES[day]}
        </label>
      ))}
      <ErrorText id={errorId} error={error} />
    </fieldset>
  );
}
