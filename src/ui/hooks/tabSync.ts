// Keeps tabs of the app in step (WI-40, peer report #14). Every tab has its own engine over the
// same IndexedDB, so after one tab stores a change it tells the others on a BroadcastChannel, and
// they reload. The stored revision (TECH_SPEC §9.1) still guards a write racing the message.

import { TAB_CHANNEL_NAME } from '@/shared/constants';
import type { AppStore } from '../store/appStore';

const STORED_MESSAGE = 'stored';

// PRE:  none
// POST: returns a BroadcastChannel named TAB_CHANNEL_NAME, or null when the browser has none
export function openTabChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(TAB_CHANNEL_NAME) : null;
}

// PRE:  channel is open
// POST: every other tab listening on channel learns that the repository changed
export function announceStoredChange(channel: BroadcastChannel): void {
  channel.postMessage(STORED_MESSAGE);
}

// PRE:  channel is open; store is this tab's store
// POST: from now on, each stored-change message from another tab runs reloadFromOtherTab;
//       other messages are ignored
export function reloadOnOtherTabChanges(channel: BroadcastChannel, store: AppStore): void {
  channel.onmessage = (message: MessageEvent<unknown>) => {
    if (message.data === STORED_MESSAGE) {
      void store.getState().actions.reloadFromOtherTab();
    }
  };
}
