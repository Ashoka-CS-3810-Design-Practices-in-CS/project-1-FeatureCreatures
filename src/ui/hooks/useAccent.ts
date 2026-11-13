import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';

// PRE: called under StoreProvider in a mounted component
// POST: applies the current curated accent to the document, independently of calendar data
export function useAccent(): void {
  const accent = useAppStore((state) => state.accent);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
}
