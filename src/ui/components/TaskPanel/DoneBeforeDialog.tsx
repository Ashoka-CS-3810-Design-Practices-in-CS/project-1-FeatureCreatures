import { useId, useState } from 'react';
import type { DoneTasksPreview } from '@/shared/types';
import { fromDateTimeLocal, toDateTimeLocal } from '../../forms/eventForm';
import { errorMessage } from '../../format/errors';
import { fmtDay, fmtTime } from '../../format/time';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../Modal/Modal';

// PRE: rendered under StoreProvider; reads currentMinute, snapshot.version and completion/close actions
//       + additional props from: Modal
// POST: previews eligible tasks without writing, invalidates edits/stale results and atomically applies;
//       validation/storage errors stay visible and Cancel/Close never writes
function DoneBeforeForm() {
  const now = useAppStore((state) => state.currentMinute);
  const version = useAppStore((state) => state.snapshot.version);
  const actions = useAppStore((state) => state.actions);
  const [before, setBefore] = useState(() => toDateTimeLocal(now));
  const [preview, setPreview] = useState<DoneTasksPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const stale = preview !== null && preview.baseVersion !== version;

  // PRE: before contains the current input string
  // POST: validates and displays a new read-only preview, or an accessible error without writes
  function showPreview(): void {
    const result = actions.previewDoneBefore(fromDateTimeLocal(before));
    setPreview(result.ok ? result.value : null);
    setError(
      result.ok ? null : before === '' ? 'Enter a date and time.' : errorMessage(result.error),
    );
  }

  // PRE: preview is current and nonempty when invoked by the enabled Apply button
  // POST: closes after successful atomic completion; otherwise retains the dialog and error
  async function apply(): Promise<void> {
    if (preview === null) return;
    setPending(true);
    const result = await actions.applyDoneBefore(preview);
    setPending(false);
    if (result.ok) actions.closeDialog();
    else setError(errorMessage(result.error));
  }

  return (
    <Modal open title="Mark done before…" onClose={actions.closeDialog}>
      <p>
        Include scheduled tasks whose event ends at or before this time, and unscheduled tasks whose
        window ends at or before it. Their scheduled time will be freed. You can undo this.
      </p>
      <label htmlFor={fieldId}>Before</label>
      <input
        id={fieldId}
        type="datetime-local"
        value={before}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${fieldId}-error`}
        onChange={(event) => {
          setBefore(event.target.value);
          setPreview(null);
          setError(null);
        }}
      />
      {error !== null && (
        <p id={`${fieldId}-error`} role="alert">
          {error}
        </p>
      )}
      {stale && <p role="status">Tasks changed. Preview again before applying.</p>}
      {preview !== null && (
        <section aria-label="Completion preview">
          <p>
            {preview.tasks.length} {preview.tasks.length === 1 ? 'task will' : 'tasks will'} be
            marked done.
          </p>
          <ul>
            {preview.tasks.map((task) => (
              <li key={task.id}>
                {task.name} — {task.status === 'scheduled' ? 'Scheduled event' : 'Window'} ends by{' '}
                {fmtDay(preview.before)} {fmtTime(preview.before)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="dialog-actions">
        <button type="button" disabled={pending} onClick={showPreview}>
          Preview
        </button>
        <button
          type="button"
          disabled={pending || preview === null || stale || preview.tasks.length === 0}
          onClick={() => void apply()}
        >
          Apply
        </button>
        <button type="button" onClick={actions.closeDialog}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// PRE: rendered under StoreProvider; reads dialog
//       + additional props from: DoneBeforeForm
// POST: mounts a fresh bulk completion form only while that dialog is open
export function DoneBeforeDialog() {
  const dialog = useAppStore((state) => state.dialog);
  return dialog?.kind === 'doneBefore' ? <DoneBeforeForm /> : null;
}
