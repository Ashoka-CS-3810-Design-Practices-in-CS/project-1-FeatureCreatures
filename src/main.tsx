import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DexieRepository } from '@/data/dexieRepository';
import { MemoryRepository } from '@/data/memoryRepository';
import type { Repository } from '@/data/repository';
import { createEngine } from '@/engine';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { toMinute } from '@/shared/time';
import { App } from '@/ui/App';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary/ErrorBoundary';
import { downloadJson } from '@/ui/hooks/download';
import { rememberView, storedView } from '@/ui/hooks/preferences';
import { announceStoredChange, openTabChannel, reloadOnOtherTabChanges } from '@/ui/hooks/tabSync';
import { createAppStore, StoreProvider, type AppStore } from '@/ui/store/appStore';
import '@/ui/styles/tokens.css';
import '@/ui/styles/global.css';
import '@/ui/styles/fullcalendar.css';

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

// PRE:  repo is the app's repository
// POST: empties it to no events, no tasks and the default settings, at whatever revision it is
//       (the fatal screen's Reset local data has no loaded state to compare against)
async function emptyRepository(repo: Repository): Promise<void> {
  const { revision } = await repo.load();
  await repo.replaceAll({ events: [], tasks: [], settings: DEFAULT_SETTINGS }, revision);
}

// PRE:  store is the app's store
// POST: downloads the current data as an export file; throws if the engine cannot export
function exportFromStore(store: AppStore): void {
  const { fileName, json } = store.getState().actions.exportFile();
  downloadJson(fileName, json);
}

// PRE:  the page has been parsed (module scripts run after parsing)
// POST: opens storage, creates and initialises the engine, and renders the App with its store
//       (starting in the remembered view, and remembering view changes) inside the error
//       boundary, so a render crash shows Reload / Export data, not a blank page; with IndexedDB,
//       tabs tell each other about stored changes and reload (WI-40);
//       throws if index.html has no #root
async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (rootElement === null) {
    throw new Error('index.html must contain an element with id "root"');
  }
  const { repo, storageWarning } = await openRepository();
  // In degraded mode each tab has its own memory, so there is nothing to keep in step.
  const channel = storageWarning ? null : openTabChannel();
  const now = () => toMinute(new Date());
  const engine = createEngine({
    repo,
    now,
    newId: () => crypto.randomUUID(),
    onCommit: channel === null ? undefined : () => announceStoredChange(channel),
  });
  const init = await engine.init();
  const store = createAppStore(engine, {
    storageWarning,
    init,
    now,
    resetStorage: () => emptyRepository(repo),
    initialView: storedView(),
  });
  rememberView(store);
  if (channel !== null) {
    reloadOnOtherTabChanges(channel, store);
  }
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary
        onReload={() => window.location.reload()}
        onExport={() => exportFromStore(store)}
      >
        <StoreProvider store={store}>
          <App />
        </StoreProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
