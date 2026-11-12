// Render helpers for UI tests (jsdom): a store over a real engine, wrapped in its provider.

import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Engine } from '@/engine';
import type { Result } from '@/shared/result';
import type { Minute, Snapshot } from '@/shared/types';
import { createAppStore, StoreProvider, type AppStore } from '@/ui/store/appStore';
import { t } from './time';

export interface StoreOptions {
  storageWarning?: boolean;
  init?: Result<Snapshot>;
  resetStorage?: () => Promise<void>;
  now?: () => Minute;
}

// PRE:  engine is initialised
// POST: returns a store over engine (ready unless options.init says otherwise), using options.now
//       or Mon 08:00; time-sensitive tests can share the engine's clock
export function storeFor(engine: Engine, options: StoreOptions = {}): AppStore {
  return createAppStore(engine, {
    storageWarning: options.storageWarning ?? false,
    init: options.init ?? { ok: true, value: engine.snapshot() },
    now: options.now ?? (() => t('Mon 08:00')),
    resetStorage: options.resetStorage ?? (async () => undefined),
  });
}

// PRE:  ui is a React element that reads the store; store comes from createAppStore
// POST: renders ui inside StoreProvider and returns RTL's result
export function renderWithStore(ui: ReactElement, store: AppStore): RenderResult {
  return render(<StoreProvider store={store}>{ui}</StoreProvider>);
}
