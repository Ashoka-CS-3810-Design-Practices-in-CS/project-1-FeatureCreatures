import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DexieRepository } from '@/data/dexieRepository';
import { MemoryRepository } from '@/data/memoryRepository';
import type { Repository } from '@/data/repository';
import { createEngine } from '@/engine';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { toMinute } from '@/shared/time';
import { App } from '@/ui/App';
import { createAppStore, StoreProvider } from '@/ui/store/appStore';

// COMPOSITION ROOT (TECH_SPEC §4): the only place that picks the repository and wires the
// engine, the store and the UI together.

const DATABASE_NAME = 'feature-creatures-calendar';

// PRE:  none
// POST: returns the IndexedDB repository, or the in-memory one with storageWarning when IndexedDB
//       cannot be opened (degraded mode)
async function openRepository(): Promise<{ repo: Repository; storageWarning: boolean }> {
  try {
    return { repo: await DexieRepository.open(DATABASE_NAME), storageWarning: false };
  } catch {
    return { repo: new MemoryRepository(), storageWarning: true };
  }
}

// PRE:  the page has been parsed (module scripts run after parsing)
// POST: opens storage, creates and initialises the engine, and renders the App with its store;
//       throws if index.html has no #root
async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (rootElement === null) {
    throw new Error('index.html must contain an element with id "root"');
  }
  const { repo, storageWarning } = await openRepository();
  const now = () => toMinute(new Date());
  const engine = createEngine({ repo, now, newId: () => crypto.randomUUID() });
  const init = await engine.init();
  const store = createAppStore(engine, {
    storageWarning,
    init,
    now,
    resetStorage: () => repo.replaceAll({ events: [], tasks: [], settings: DEFAULT_SETTINGS }),
  });
  createRoot(rootElement).render(
    <StrictMode>
      <StoreProvider store={store}>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
}

void bootstrap();
