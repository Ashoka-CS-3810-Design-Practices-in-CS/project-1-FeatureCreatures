import { DRAWER_BREAKPOINT_PX } from '@/shared/constants';
import { useMediaQuery } from './useMediaQuery';

const NARROW_QUERY = `(max-width: ${DRAWER_BREAKPOINT_PX - 1}px)`;

// PRE:  called in a mounted React component; window.matchMedia is available
// POST: returns the current narrow-layout state and updates it when the breakpoint is crossed
export function useNarrowLayout(): boolean {
  return useMediaQuery(NARROW_QUERY);
}
