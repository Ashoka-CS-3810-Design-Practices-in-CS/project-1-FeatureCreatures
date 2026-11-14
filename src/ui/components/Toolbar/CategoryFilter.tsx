import { useEffect, useId, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { CategoryTag } from '../Categories/CategoryTag';

// PRE: StoreProvider supplies existing categories, hiddenCategoryIds and toggleEventCategory
//      + additional props from: CategoryTag
// POST: exposes a named checkbox disclosure; Escape restores trigger focus; Show all restores categories
export function CategoryFilter() {
  const categories = useAppStore((state) => state.snapshot.categories);
  const hidden = useAppStore((state) => state.hiddenCategoryIds);
  const actions = useAppStore((state) => state.actions);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const visibleCount = categories.filter((category) => !hidden.includes(category.id)).length;

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    // PRE: event is a document pointer event
    // POST: closes the disclosure only when the pointer is outside it
    function closeOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div
      ref={root}
      className="category-filter"
      role="group"
      aria-label="Category filter"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Category filter"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {visibleCount === categories.length
          ? 'Categories'
          : `Categories (${visibleCount} of ${categories.length})`}
      </button>
      <div ref={panel} id={panelId} className="category-filter-popover" hidden={!open}>
        {categories.map((category) => (
          <label key={category.id}>
            <input
              type="checkbox"
              aria-label={category.name}
              checked={!hidden.includes(category.id)}
              onChange={() => actions.toggleEventCategory(category.id)}
            />
            <CategoryTag category={category} />
          </label>
        ))}
        <button
          type="button"
          onClick={() => {
            hidden.forEach((id) => actions.toggleEventCategory(id));
          }}
        >
          Show all
        </button>
      </div>
    </div>
  );
}
