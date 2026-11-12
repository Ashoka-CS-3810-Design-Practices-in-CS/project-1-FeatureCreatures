import { useId, useState } from 'react';
import type { Category } from '@/shared/types';
import { errorMessage } from '../../format/errors';
import { useAppStore } from '../../store/appStore';
import { CategoryEditor } from './CategoryEditor';
import { CategoryTag } from './CategoryTag';

// PRE:  reads snapshot.categories; uses deleteCategory;
//       + additional props from CategoryEditor and CategoryTag
// POST: offers category creation, editing and deletion in Settings; blocked deletes explain usage
export function CategoriesSection() {
  const categories = useAppStore((state) => state.snapshot.categories);
  const deleteCategory = useAppStore((state) => state.actions.deleteCategory);
  const [editor, setEditor] = useState<Category | 'new' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const idPrefix = useId();

  // PRE:  id identifies a category row
  // POST: requests deletion and displays reference counts or storage errors on failure
  async function remove(id: string): Promise<void> {
    const result = await deleteCategory(id);
    setFailure(result.ok ? null : errorMessage(result.error));
  }

  return (
    <section aria-labelledby={`${idPrefix}-heading`} className="categories-section">
      <h3 id={`${idPrefix}-heading`}>Categories</h3>
      {categories.map((category) => (
        <div
          className="category-row"
          role="group"
          aria-label={`Category ${category.name}`}
          key={category.id}
        >
          <CategoryTag category={category} />
          <button
            type="button"
            aria-label={`Edit ${category.name}`}
            onClick={() => {
              setFailure(null);
              setEditor(category);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete ${category.name}`}
            onClick={() => void remove(category.id)}
          >
            Delete
          </button>
        </div>
      ))}
      {failure !== null && <p role="alert">{failure}</p>}
      {editor === null ? (
        <button type="button" onClick={() => setEditor('new')}>
          New category…
        </button>
      ) : (
        <CategoryEditor
          key={editor === 'new' ? 'new' : editor.id}
          category={editor === 'new' ? undefined : editor}
          onSaved={() => setEditor(null)}
          onCancel={() => setEditor(null)}
        />
      )}
    </section>
  );
}
