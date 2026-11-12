import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { Task } from '@/shared/types';
import {
  taskFormValues,
  taskResolver,
  toTaskInput,
  type TaskFormValues,
} from '../../forms/taskForm';
import { useAppStore } from '../../store/appStore';
import { ErrorText } from '../Modal/ErrorText';
import { Modal } from '../Modal/Modal';
import { PriorityRadioGroup } from '../PriorityRadioGroup/PriorityRadioGroup';
import { CategorySelect } from '../Categories/CategorySelect';
import { defaultCategoryId } from '../../store/selectors';

// PRE:  rendered under StoreProvider; existing is the task being edited (undefined when creating);
//       reads view.date, categories and lastCategoryId; uses the task actions, openTaskPicker,
//       openDialog and closeDialog; + additional props from: Modal, ErrorText, PriorityRadioGroup, CategorySelect
// POST: shows the task form (name, duration in hours + minutes, priority, categoryId, window,
//       scheduling-hours radios, description); Save validates with taskResolver before calling the
//       engine; in edit mode it also offers Find time (unscheduled), Unschedule (scheduled) and
//       Delete (after confirmation)
function TaskForm({ existing }: { existing: Task | undefined }) {
  const viewDate = useAppStore((state) => state.view.date);
  const categoryId = useAppStore(defaultCategoryId);
  const actions = useAppStore((state) => state.actions);
  const idPrefix = useId();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: taskResolver,
    defaultValues: {
      ...taskFormValues(existing, viewDate),
      categoryId: existing?.categoryId ?? categoryId,
    },
  });
  const fieldId = (name: keyof TaskFormValues) => `${idPrefix}-${name}`;
  const errorId = (name: keyof TaskFormValues) => `${idPrefix}-${name}-error`;
  const described = (name: keyof TaskFormValues) =>
    errors[name] === undefined ? {} : { 'aria-invalid': true, 'aria-describedby': errorId(name) };

  // PRE:  values passed taskResolver
  // POST: creates or updates the task; closes the dialog on success, stays open on failure
  async function save(values: TaskFormValues): Promise<void> {
    const input = toTaskInput(values);
    const result =
      existing === undefined
        ? await actions.createTask(input)
        : await actions.updateTask(existing.id, input);
    if (result.ok) {
      actions.closeDialog();
    }
  }

  // PRE:  task is the edited task
  // POST: replaces this dialog with a confirmation that deletes the task (and its event)
  function confirmDelete(task: Task): void {
    actions.openDialog({
      kind: 'confirm',
      title: 'Delete task?',
      body:
        task.status === 'scheduled'
          ? `Delete "${task.name}" and its scheduled event? You can undo this.`
          : `Delete "${task.name}"? You can undo this.`,
      confirmLabel: 'Delete',
      onConfirm: () => void actions.deleteTask(task.id),
    });
  }

  return (
    <Modal
      open
      title={existing === undefined ? 'New task' : 'Edit task'}
      onClose={actions.closeDialog}
    >
      <form noValidate onSubmit={(event) => void handleSubmit(save)(event)}>
        <label htmlFor={fieldId('name')}>Name</label>
        <input id={fieldId('name')} type="text" {...register('name')} {...described('name')} />
        <ErrorText id={errorId('name')} error={errors.name} />

        <fieldset>
          <legend>Duration</legend>
          <label htmlFor={fieldId('hours')}>Hours</label>
          <input
            id={fieldId('hours')}
            type="number"
            min={0}
            inputMode="numeric"
            {...register('hours')}
            {...described('hours')}
          />
          <label htmlFor={fieldId('minutes')}>Minutes</label>
          <input
            id={fieldId('minutes')}
            type="number"
            min={0}
            inputMode="numeric"
            {...register('minutes')}
          />
          <ErrorText id={errorId('hours')} error={errors.hours} />
        </fieldset>

        <PriorityRadioGroup registration={register('priority')} />

        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <CategorySelect
              value={field.value}
              onChange={field.onChange}
              error={errors.categoryId?.message}
            />
          )}
        />

        <label htmlFor={fieldId('windowStart')}>Window from</label>
        <input
          id={fieldId('windowStart')}
          type="datetime-local"
          {...register('windowStart')}
          {...described('windowStart')}
        />
        <ErrorText id={errorId('windowStart')} error={errors.windowStart} />
        <label htmlFor={fieldId('windowEnd')}>Window to</label>
        <input
          id={fieldId('windowEnd')}
          type="datetime-local"
          {...register('windowEnd')}
          {...described('windowEnd')}
        />
        <ErrorText id={errorId('windowEnd')} error={errors.windowEnd} />

        <Controller
          control={control}
          name="useWorkingHours"
          render={({ field }) => (
            <fieldset className="form-group">
              <legend>Scheduling hours</legend>
              <div className="choice-options">
                <label>
                  <input
                    type="radio"
                    name={field.name}
                    ref={field.ref}
                    checked={field.value}
                    onBlur={field.onBlur}
                    onChange={() => field.onChange(true)}
                  />{' '}
                  Working hours only
                </label>
                <label>
                  <input
                    type="radio"
                    name={field.name}
                    checked={!field.value}
                    onBlur={field.onBlur}
                    onChange={() => field.onChange(false)}
                  />{' '}
                  Any time
                </label>
              </div>
            </fieldset>
          )}
        />

        <label htmlFor={fieldId('description')}>Description</label>
        <textarea
          id={fieldId('description')}
          {...register('description')}
          {...described('description')}
        />
        <ErrorText id={errorId('description')} error={errors.description} />

        <div className="dialog-actions">
          <button type="submit" disabled={isSubmitting}>
            Save
          </button>
          <button type="button" onClick={actions.closeDialog}>
            Cancel
          </button>
          {existing?.status === 'unscheduled' && (
            <button type="button" onClick={() => actions.openTaskPicker([existing.id])}>
              Find time
            </button>
          )}
          {existing?.status === 'scheduled' && (
            <button
              type="button"
              onClick={() =>
                void actions.unscheduleTask(existing.id).then((result) => {
                  if (result.ok) {
                    actions.closeDialog();
                  }
                })
              }
            >
              Unschedule
            </button>
          )}
          {existing !== undefined && (
            <button type="button" onClick={() => confirmDelete(existing)}>
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// PRE:  rendered under StoreProvider; reads dialog and snapshot.tasks
//       + additional props from: TaskForm
// POST: while a task dialog is open, shows its form (keyed by the dialog, so it starts fresh); an
//       edit dialog for a task that no longer exists shows nothing
export function TaskDialog() {
  const dialog = useAppStore((state) => state.dialog);
  const tasks = useAppStore((state) => state.snapshot.tasks);
  if (dialog?.kind !== 'task') {
    return null;
  }
  const existing = dialog.mode === 'edit' ? tasks.find((task) => task.id === dialog.id) : undefined;
  if (dialog.mode === 'edit' && existing === undefined) {
    return null;
  }
  return <TaskForm key={dialog.mode === 'edit' ? dialog.id : 'create'} existing={existing} />;
}
