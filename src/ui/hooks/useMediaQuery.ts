import { useCallback, useSyncExternalStore } from 'react';

// PRE: query is a CSS media query; window.matchMedia exists; called in a mounted React component
// POST: returns whether query currently matches, updating on changes and unsubscribing on unmount
export function useMediaQuery(query: string): boolean {
  // PRE: listener requests a React update
  // POST: subscribes listener to this query and returns its cleanup
  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    },
    [query],
  );
  // PRE: window.matchMedia exists
  // POST: returns the current match for query
  const matches = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, matches);
}
