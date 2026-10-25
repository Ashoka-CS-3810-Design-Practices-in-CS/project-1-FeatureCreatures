import { useSyncExternalStore } from 'react';
import { DRAWER_BREAKPOINT_PX } from '@/shared/constants';

const NARROW_QUERY = `(max-width: ${DRAWER_BREAKPOINT_PX - 1}px)`;

// PRE:  listener requests a React render when the media query changes
// POST: listens for breakpoint crossings and returns its unsubscribe function
function subscribe(listener: () => void): () => void {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

// PRE:  window.matchMedia is available
// POST: returns whether the viewport is narrower than the side-column breakpoint
function isNarrow(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

// PRE:  called in a mounted React component; window.matchMedia is available
// POST: returns the current narrow-layout state and updates it when the breakpoint is crossed
export function useNarrowLayout(): boolean {
  return useSyncExternalStore(subscribe, isNarrow);
}
