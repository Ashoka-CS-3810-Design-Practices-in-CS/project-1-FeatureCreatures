import type { Category } from '@/shared/types';

// PRE:  category is an existing category with a validated colour and name
// POST: shows its colour dot and readable name, independent of the colour's text contrast
export function CategoryTag({ category }: { category: Category }) {
  return (
    <span className="tag category-tag">
      <span
        className="category-dot"
        style={{ backgroundColor: category.colour }}
        aria-hidden="true"
      />
      {category.name}
    </span>
  );
}
