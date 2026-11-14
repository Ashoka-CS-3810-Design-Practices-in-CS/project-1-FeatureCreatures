import { PRIORITY_TAGS } from '@/shared/constants';
import type { Priority } from '@/shared/types';

// PRE: priority is a supported priority; className optionally supplies layout-only classes
// POST: renders the shared coloured [H]/[M]/[L] tag, always retaining its full text
export function PriorityTag({
  priority,
  className = '',
}: {
  priority: Priority;
  className?: string;
}) {
  return (
    <span className={`tag prio-${priority} ${className}`.trim()}>{PRIORITY_TAGS[priority]}</span>
  );
}
