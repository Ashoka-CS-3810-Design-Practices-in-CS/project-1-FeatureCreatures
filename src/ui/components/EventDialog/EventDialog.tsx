import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { MINUTES_PER_HOUR } from '@/shared/constants';
import { ceilTo } from '@/shared/time';
import type { CalendarEvent, Interval } from '@/shared/types';
import {
  eventFormValues,
  eventResolver,
  toEventInput,
  type EventFormValues,
} from '../../forms/eventForm';
import { useAppStore, type Dialog } from '../../store/appStore';
import { ErrorText } from '../Modal/ErrorText';
import { Modal } from '../Modal/Modal';
import { PriorityRadioGroup } from '../PriorityRadioGroup/PriorityRadioGroup';
import { CategorySelect } from '../Categories/CategorySelect';
import { defaultCategoryId } from '../../store/selectors';

type EventDialogState = Extract<Exclude<Dialog, null>, { kind: 'event' }>;

// PRE:  viewDate is the calendar's current date (a Minute)
// POST: returns the interval a new event gets when no time was selected: the next whole hour, 1 h
function nextHourSlot(viewDate: number): Interval {
  const start = ceilTo(viewDate, MINUTES_PER_HOUR);
  return { start, end: start + MINUTES_PER_HOUR };
}

// PRE:  rendered under StoreProvider; dialog is the open event dialog; existing is the event being
//       edited (undefined when creating); reads settings and view.date; uses event actions
//       + additional props from: Modal, PriorityRadioGroup
// POST: shows the event form (title, categoryId, priority, start, end, flexible, flex window when
//       flexible, description); Save validates with eventResolver and only then calls the engine,
//       closing on success; Delete asks for confirmation first
function EventForm({
  dialog,
  existing,
}: {
  dialog: EventDialogState;
  existing: CalendarEvent | undefined;
}) {
  const settings = useAppStore((state) => state.snapshot.settings);
  const viewDate = useAppStore((state) => state.view.date);
  const categoryId = useAppStore(defaultCategoryId);
  const actions = useAppStore((state) => state.actions);
  const idPrefix = useId();
  const defaults = dialog.mode === 'create' ? dialog.defaults : {};
  const source = existing ?? { ...nextHourSlot(viewDate), categoryId, ...defaults };
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: eventResolver,
    defaultValues: eventFormValues(source, settings),
  });
  const flexible = useWatch({ control, name: 'flexible' });
  const isTaskEvent = existing?.taskId != null;
  const fieldId = (name: keyof EventFormValues) => `${idPrefix}-${name}`;
  const errorId = (name: keyof EventFormValues) => `${idPrefix}-${name}-error`;
  const described = (name: keyof EventFormValues) =>
    errors[name] === undefined ? {} : { 'aria-invalid': true, 'aria-describedby': errorId(name) };

  // PRE:  values passed eventResolver
  // POST: creates or updates the event; closes the dialog on success, stays open on failure
  async function save(values: EventFormValues): Promise<void> {
    const input = toEventInput(values);
    const result =
      existing === undefined
        ? await actions.createEvent(input)
        : await actions.updateEvent(existing.id, input);
    if (result.ok) {
      actions.closeDialog();
    }
  }

  // PRE:  existing is defined
  // POST: replaces this dialog with a confirmation that deletes the event
  function confirmDelete(event: CalendarEvent): void {
    actions.openDialog({
      kind: 'confirm',
      title: 'Delete event?',
      body: `Delete "${event.title}"? You can undo this.`,
      confirmLabel: 'Delete',
      onConfirm: () => void actions.deleteEvent(event.id),
    });
  }

  return (
    <Modal
      open
      title={existing === undefined ? 'New event' : 'Edit event'}
      onClose={actions.closeDialog}
    >
      <form noValidate onSubmit={(event) => void handleSubmit(save)(event)}>
        <label htmlFor={fieldId('title')}>Title</label>
        <input id={fieldId('title')} type="text" {...register('title')} {...described('title')} />
        <ErrorText id={errorId('title')} error={errors.title} />

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

        <PriorityRadioGroup registration={register('priority')} />

        <label htmlFor={fieldId('start')}>Start</label>
        <input
          id={fieldId('start')}
          type="datetime-local"
          {...register('start')}
          {...described('start')}
        />
        <ErrorText id={errorId('start')} error={errors.start} />

        <label htmlFor={fieldId('end')}>End</label>
        <input
          id={fieldId('end')}
          type="datetime-local"
          {...register('end')}
          {...described('end')}
        />
        <ErrorText id={errorId('end')} error={errors.end} />

        <div className="form-group">
          <label>
            <input type="checkbox" disabled={isTaskEvent} {...register('flexible')} /> Flexible (the
            planner may move it)
          </label>
          {isTaskEvent && <p className="hint">Events of scheduled tasks always stay flexible.</p>}
        </div>

        {flexible && (
          <fieldset className="form-group flex-window">
            <legend>Flex window</legend>
            <label htmlFor={fieldId('flexStart')}>Window start</label>
            <input
              id={fieldId('flexStart')}
              type="datetime-local"
              {...register('flexStart')}
              {...described('flexStart')}
            />
            <ErrorText id={errorId('flexStart')} error={errors.flexStart} />
            <label htmlFor={fieldId('flexEnd')}>Window end</label>
            <input
              id={fieldId('flexEnd')}
              type="datetime-local"
              {...register('flexEnd')}
              {...described('flexEnd')}
            />
            <ErrorText id={errorId('flexEnd')} error={errors.flexEnd} />
          </fieldset>
        )}

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

// PRE:  rendered under StoreProvider; reads dialog and snapshot.events
//       + additional props from: EventForm
// POST: while an event dialog is open, shows its form (keyed by the dialog, so it starts fresh);
//       an edit dialog for an event that no longer exists shows nothing
export function EventDialog() {
  const dialog = useAppStore((state) => state.dialog);
  const events = useAppStore((state) => state.snapshot.events);
  if (dialog?.kind !== 'event') {
    return null;
  }
  const existing =
    dialog.mode === 'edit' ? events.find((event) => event.id === dialog.id) : undefined;
  if (dialog.mode === 'edit' && existing === undefined) {
    return null;
  }
  return (
    <EventForm
      key={dialog.mode === 'edit' ? dialog.id : 'create'}
      dialog={dialog}
      existing={existing}
    />
  );
}
