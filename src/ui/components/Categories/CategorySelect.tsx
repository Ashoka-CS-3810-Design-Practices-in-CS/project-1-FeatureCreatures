import { useId, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { CategoryEditor } from './CategoryEditor';

const NEW_CATEGORY_VALUE = '__new_category__';

// PRE:  value is the item form's category id; onChange updates that field; reads categories;
//       uses rememberCategory; + additional props from CategoryEditor
// POST: shows the current category names and inline creation without losing the item draft;
//       with no categories, asks for one before saving
export function CategorySelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const categories = useAppStore((state) => state.snapshot.categories);
  const rememberCategory = useAppStore((state) => state.actions.rememberCategory);
  const [creating, setCreating] = useState(false);
  const idPrefix = useId();
  const message = categories.length === 0 ? 'Create a category before saving.' : error;

  // PRE:  id names an existing category
  // POST: selects the category in the item form and remembers it for this session
  function select(id: string): void {
    onChange(id);
    rememberCategory(id);
  }

  return (
    <div className="form-group">
      <label htmlFor={`${idPrefix}-category`}>Category</label>
      <select
        id={`${idPrefix}-category`}
        value={categories.some((category) => category.id === value) ? value : ''}
        onChange={(event) =>
          event.target.value === NEW_CATEGORY_VALUE ? setCreating(true) : select(event.target.value)
        }
        aria-invalid={message !== undefined}
        aria-describedby={message === undefined ? undefined : `${idPrefix}-error`}
      >
        <option value="" disabled>
          Choose a category
        </option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
        <option value={NEW_CATEGORY_VALUE}>New category…</option>
      </select>
      {message !== undefined && (
        <p className="field-error" id={`${idPrefix}-error`}>
          {message}
        </p>
      )}
      {creating && (
        <CategoryEditor
          onSaved={(id) => {
            select(id);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
