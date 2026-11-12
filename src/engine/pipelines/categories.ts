import { err, ok, type Result } from '@/shared/result';
import { parseCategoryInput } from '@/shared/schemas';
import type { Category } from '@/shared/types';
import { commit, type PipelineContext, type PipelineOutcome } from '../state';

// PRE:  before/after are valid images of one category; deleting it leaves no dangling references
// POST: commits the category mutation as one atomic history entry; errors leave state untouched
async function saveCategory(
  context: PipelineContext,
  id: string,
  before: Category | null,
  after: Category | null,
  label: string,
): Promise<Result<PipelineOutcome>> {
  const committed = await commit(
    context.state,
    {
      label,
      categories: [{ id, before, after }],
      events: [],
      tasks: [],
    },
    'do',
    context.repo,
  );
  return committed.ok ? ok({ ...committed.value, suggestion: null }) : committed;
}

// PRE:  input comes from outside; context contains the current validated state
// POST: creates a valid unique category with a fresh engine id/time, or returns a validation error
export async function createCategory(
  context: PipelineContext,
  input: unknown,
): Promise<Result<PipelineOutcome>> {
  const parsed = parseCategoryInput(input, context.state.categories);
  if (!parsed.ok) return parsed;
  const category: Category = { ...parsed.value, id: context.newId(), createdAt: context.now };
  return saveCategory(context, category.id, null, category, `Create category "${category.name}"`);
}

// PRE:  id is any string; input comes from outside; context contains current validated state
// POST: renames/recolours the category by id, leaving referring rows intact; errors change nothing
export async function updateCategory(
  context: PipelineContext,
  id: string,
  input: unknown,
): Promise<Result<PipelineOutcome>> {
  const before = context.state.categories.find((category) => category.id === id);
  if (before === undefined) return err({ code: 'NotFound', entity: 'category', id });
  const parsed = parseCategoryInput(input, context.state.categories, id);
  return parsed.ok
    ? saveCategory(
        context,
        id,
        before,
        { ...before, ...parsed.value },
        `Edit category "${parsed.value.name}"`,
      )
    : parsed;
}

// PRE:  id is any string; context contains the current validated state
// POST: deletes an unused category, including the last; returns reference counts if it is in use
export async function deleteCategory(
  context: PipelineContext,
  id: string,
): Promise<Result<PipelineOutcome>> {
  const before = context.state.categories.find((category) => category.id === id);
  if (before === undefined) return err({ code: 'NotFound', entity: 'category', id });
  const eventCount = context.state.events.filter((event) => event.categoryId === id).length;
  const taskCount = context.state.tasks.filter((task) => task.categoryId === id).length;
  return eventCount + taskCount > 0
    ? err({ code: 'CategoryInUse', eventCount, taskCount })
    : saveCategory(context, id, before, null, `Delete category "${before.name}"`);
}
