import type { UseFormRegisterReturn } from 'react-hook-form';
import type { Priority } from '@/shared/types';

const PRIORITIES: { value: Priority; label: string; tag: string }[] = [
  { value: 'high', label: 'High', tag: '[H]' },
  { value: 'medium', label: 'Medium', tag: '[M]' },
  { value: 'low', label: 'Low', tag: '[L]' },
];

// PRE:  registration connects the form's priority field to React Hook Form
// POST: shows a named fieldset of tagged, coloured native radios with shared keyboard navigation
export function PriorityRadioGroup({
  registration,
}: {
  registration: UseFormRegisterReturn<'priority'>;
}) {
  return (
    <fieldset className="form-group">
      <legend>Priority</legend>
      <div className="choice-options">
        {PRIORITIES.map((option) => (
          <label key={option.value}>
            <input type="radio" value={option.value} {...registration} />
            <span className={`tag prio-${option.value}`}>{option.tag}</span> {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
