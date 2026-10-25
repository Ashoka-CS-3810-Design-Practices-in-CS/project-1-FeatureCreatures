import type { FieldError } from 'react-hook-form';

// PRE:  id is the id the field's aria-describedby points to; error is the field's RHF error, if any
// POST: renders the field's message under it, or nothing when the field is valid
export function ErrorText({ id, error }: { id: string; error: FieldError | undefined }) {
  return error?.message === undefined ? null : (
    <p id={id} className="field-error">
      {error.message}
    </p>
  );
}
