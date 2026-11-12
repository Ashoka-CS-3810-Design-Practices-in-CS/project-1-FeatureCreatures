import { TAB_CHANNEL_NAME } from '@/shared/constants';
import type { AppStore } from '../store/appStore';
import { announceStoredChange, openTabChannel, reloadOnOtherTabChanges } from './tabSync';

// PRE:  reloadFromOtherTab is a spy
// POST: returns the smallest store stand-in reloadOnOtherTabChanges needs
function storeWith(reloadFromOtherTab: () => Promise<void>): AppStore {
  return { getState: () => ({ actions: { reloadFromOtherTab } }) } as unknown as AppStore;
}

describe('tabSync (WI-40)', () => {
  it('a stored change announced by one tab reloads the other tab, and only that message does', async () => {
    const tabA = openTabChannel();
    const tabB = openTabChannel();
    const stranger = new BroadcastChannel(TAB_CHANNEL_NAME);
    if (tabA === null || tabB === null) throw new Error('BroadcastChannel is missing');
    const reload = vi.fn(async () => undefined);
    reloadOnOtherTabChanges(tabB, storeWith(reload));

    stranger.postMessage('something else');
    announceStoredChange(tabA);

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    tabA.close();
    tabB.close();
    stranger.close();
  });

  it('openTabChannel returns null where BroadcastChannel does not exist', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    try {
      expect(openTabChannel()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
