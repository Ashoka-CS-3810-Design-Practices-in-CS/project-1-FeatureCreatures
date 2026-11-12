// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATEGORY_PALETTE, DEFAULT_CATEGORIES } from '@/shared/constants';
import { ev, task } from '../../../../tests/helpers/builders';
import { makeEngine } from '../../../../tests/helpers/engine';
import { renderWithStore, storeFor } from '../../../../tests/helpers/render';
import { CategoriesSection } from './CategoriesSection';
import { EventDialog } from '../EventDialog/EventDialog';
import { TaskDialog } from '../TaskDialog/TaskDialog';
import { TaskPanel } from '../TaskPanel/TaskPanel';

describe('T49: category UI (D-11)', () => {
  it('Enter in an inline category name saves only that category and keeps the item draft open', async () => {
    const { engine } = await makeEngine();
    const store = storeFor(engine);
    renderWithStore(<EventDialog />, store);
    act(() => store.getState().actions.openDialog({ kind: 'event', mode: 'create', defaults: {} }));
    await userEvent.type(screen.getByLabelText('Title'), 'Draft');
    await userEvent.selectOptions(screen.getByLabelText('Category'), '__new_category__');
    await userEvent.type(screen.getByLabelText('Category name'), 'Research{Enter}');
    await waitFor(() =>
      expect(
        store.getState().snapshot.categories.some((category) => category.name === 'Research'),
      ).toBe(true),
    );
    expect(store.getState().snapshot.events).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'New event' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Draft');
    expect(screen.getByLabelText('Category')).toHaveFocus();
  });
  it('creates, renames, recolours and deletes in Settings, with one undo step each', async () => {
    const { engine } = await makeEngine({ categories: [] });
    const store = storeFor(engine);
    renderWithStore(<CategoriesSection />, store);
    await userEvent.click(screen.getByRole('button', { name: 'New category…' }));
    await userEvent.type(screen.getByLabelText('Category name'), 'Research');
    fireEvent.change(screen.getByLabelText('Custom colour'), { target: { value: '#577d35' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create category' }));
    const row = await screen.findByRole('group', { name: 'Category Research' });
    expect(store.getState().snapshot.undoLabel).toBe('Create category "Research"');
    await userEvent.click(within(row).getByRole('button', { name: 'Edit Research' }));
    await userEvent.clear(screen.getByLabelText('Category name'));
    await userEvent.type(screen.getByLabelText('Category name'), 'Projects');
    fireEvent.change(screen.getByLabelText('Custom colour'), { target: { value: '#7e6ac0' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save category' }));
    expect(await screen.findByRole('group', { name: 'Category Projects' })).toBeInTheDocument();
    expect(store.getState().snapshot.categories[0]?.colour).toBe('#7e6ac0');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Projects' }));
    await waitFor(() => expect(store.getState().snapshot.categories).toEqual([]));
    await act(async () => {
      await store.getState().actions.undo();
    });
    expect(screen.getByRole('group', { name: 'Category Projects' })).toBeInTheDocument();
  });

  it('shows the exact usage counts when deletion is blocked and keeps the category', async () => {
    const { engine } = await makeEngine({
      events: [ev('E', 'Mon 10:00', 'Mon 11:00')],
      tasks: [task('T', 60, ['Mon 09:00', 'Fri 18:00'], { categoryId: 'meeting' })],
    });
    const store = storeFor(engine);
    renderWithStore(<CategoriesSection />, store);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Meeting' }));
    expect(
      await screen.findByText(
        'Used by 1 event and 1 task. Change their category or delete them first.',
      ),
    ).toBeInTheDocument();
    expect(store.getState().snapshot.categories).toEqual(DEFAULT_CATEGORIES);
  });

  it('disables occupied swatches and shows shared field errors for invalid free colours and names', async () => {
    const { engine } = await makeEngine();
    const store = storeFor(engine);
    renderWithStore(<CategoriesSection />, store);
    await userEvent.click(screen.getByRole('button', { name: 'New category…' }));
    expect(screen.getAllByRole('radio', { name: /^Colour #/ })).toHaveLength(
      CATEGORY_PALETTE.length,
    );
    expect(screen.getByRole('radio', { name: 'Colour #467b70 (unavailable)' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Category name'), 'meeting');
    fireEvent.change(screen.getByLabelText('Custom colour'), { target: { value: '#ffffff' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create category' }));
    expect(
      await screen.findByText('A category with this name already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Category name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Custom colour')).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().snapshot.categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it.each(['event', 'task'] as const)(
    'creates a required category inline in a new %s, preserving the draft and remembering it',
    async (kind) => {
      const { engine } = await makeEngine({ categories: [] });
      const store = storeFor(engine);
      renderWithStore(
        <>
          <EventDialog />
          <TaskDialog />
        </>,
        store,
      );
      act(() =>
        store
          .getState()
          .actions.openDialog(
            kind === 'event' ? { kind, mode: 'create', defaults: {} } : { kind, mode: 'create' },
          ),
      );
      const nameField = kind === 'event' ? 'Title' : 'Name';
      await userEvent.type(screen.getByLabelText(nameField), 'Draft item');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Create a category before saving.')).toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText('Category'), '__new_category__');
      await userEvent.type(screen.getByLabelText('Category name'), 'Research');
      await userEvent.click(screen.getByRole('button', { name: 'Create category' }));
      await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('id-1'));
      expect(screen.getByLabelText(nameField)).toHaveValue('Draft item');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(store.getState().dialog).toBeNull());
      expect(
        kind === 'event'
          ? store.getState().snapshot.events[0]?.categoryId
          : store.getState().snapshot.tasks[0]?.categoryId,
      ).toBe('id-1');
      act(() =>
        store.getState().actions.openDialog({ kind: 'event', mode: 'create', defaults: {} }),
      );
      expect(screen.getByLabelText('Category')).toHaveValue('id-1');
      expect(screen.getByRole('radio', { name: /Flexible/ })).not.toBeChecked();
    },
  );

  it('updates task tags immediately when their category is renamed or recoloured', async () => {
    const { engine } = await makeEngine({ tasks: [task('T', 60, ['Mon 09:00', 'Fri 18:00'])] });
    const store = storeFor(engine);
    renderWithStore(<TaskPanel />, store);
    expect(
      within(screen.getByRole('list', { name: 'Task list' })).getByText('Assignment'),
    ).toBeInTheDocument();
    await act(async () => {
      await store
        .getState()
        .actions.updateCategory('assignment', { name: 'Projects', colour: '#577d35' });
    });
    expect(
      within(screen.getByRole('list', { name: 'Task list' })).getByText('Projects'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Assignment')).not.toBeInTheDocument();
  });
});
