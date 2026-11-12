import { useId, useState } from 'react';
import { CATEGORY_PALETTE, MAX_CATEGORY_NAME_LENGTH } from '@/shared/constants';
import type { FieldIssue } from '@/shared/errors';
import { categoryColourIssue, parseCategoryInput } from '@/shared/schemas';
import type { Category } from '@/shared/types';
import { errorMessage } from '../../format/errors';
import { useAppStore } from '../../store/appStore';

// PRE:  category is the category to edit, or absent for creation; callbacks close/accept the editor;
//       reads snapshot.categories and uses the category mutation actions
// POST: offers a name, twelve swatches and a free picker; validates before one undoable save;
//       reports field or repository errors inline; never submits a surrounding item form
export function CategoryEditor({
  category,
  onSaved,
  onCancel,
}: {
  category?: Category;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const categories = useAppStore((state) => state.snapshot.categories);
  const actions = useAppStore((state) => state.actions);
  const others = categories.filter((candidate) => candidate.id !== category?.id);
  const [name, setName] = useState(category?.name ?? '');
  const [colour, setColour] = useState(
    category?.colour ??
      CATEGORY_PALETTE.find((candidate) => categoryColourIssue(candidate, others) === null) ??
      '',
  );
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const idPrefix = useId();
  const nameError = issues.find((issue) => issue.path === 'name');
  const colourError = issues.find((issue) => issue.path === 'colour');

  // PRE:  local strings are untrusted; current categories are validated stored entities
  // POST: validates both fields; saves through the facade once, then calls onSaved on success
  async function save(): Promise<void> {
    const parsed = parseCategoryInput({ name, colour }, categories, category?.id);
    if (!parsed.ok) {
      setIssues(parsed.error.code === 'InvalidInput' ? parsed.error.issues : []);
      return;
    }
    setIssues([]);
    setFailure(null);
    setSaving(true);
    const result =
      category === undefined
        ? await actions.createCategory(parsed.value)
        : await actions.updateCategory(category.id, parsed.value);
    setSaving(false);
    if (!result.ok) {
      setFailure(errorMessage(result.error));
      return;
    }
    const id = category?.id ?? result.value.snapshot.categories.at(-1)?.id;
    if (id !== undefined) onSaved(id);
  }

  return (
    <fieldset className="category-editor">
      <legend>{category === undefined ? 'New category' : `Edit ${category.name}`}</legend>
      <label htmlFor={`${idPrefix}-name`}>Category name</label>
      <input
        id={`${idPrefix}-name`}
        type="text"
        maxLength={MAX_CATEGORY_NAME_LENGTH}
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={nameError !== undefined}
        aria-describedby={nameError === undefined ? undefined : `${idPrefix}-name-error`}
      />
      {nameError !== undefined && (
        <p className="field-error" id={`${idPrefix}-name-error`}>
          {nameError.message}
        </p>
      )}
      <fieldset className="category-palette">
        <legend>Category colour</legend>
        {CATEGORY_PALETTE.map((swatch) => {
          const unavailable = categoryColourIssue(swatch, others) !== null;
          return (
            <label key={swatch} title={`${swatch}${unavailable ? ' (unavailable)' : ''}`}>
              <input
                type="radio"
                name={`${idPrefix}-colour`}
                aria-label={`Colour ${swatch}${unavailable ? ' (unavailable)' : ''}`}
                value={swatch}
                disabled={unavailable}
                checked={colour === swatch}
                onChange={() => setColour(swatch)}
              />
              <span
                className="category-dot"
                style={{ backgroundColor: swatch }}
                aria-hidden="true"
              />
            </label>
          );
        })}
      </fieldset>
      <label htmlFor={`${idPrefix}-colour`}>Custom colour</label>
      <input
        id={`${idPrefix}-colour`}
        type="color"
        value={colour}
        onChange={(event) => setColour(event.target.value)}
        aria-invalid={colourError !== undefined}
        aria-describedby={colourError === undefined ? undefined : `${idPrefix}-colour-error`}
      />
      {colourError !== undefined && (
        <p className="field-error" id={`${idPrefix}-colour-error`}>
          {colourError.message}
        </p>
      )}
      {failure !== null && <p role="alert">{failure}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={saving} onClick={() => void save()}>
          {category === undefined ? 'Create category' : 'Save category'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel category
        </button>
      </div>
    </fieldset>
  );
}
