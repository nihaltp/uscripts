import { log } from './logging.js';
import { queueState, resetQueueState } from './state.js';
import { startDomObserver, startUrlWatcher } from './ui.js';
import { refreshChatManager } from './chat-manager.js';

export function bootstrapQueueApp(provider) {
  globalThis.aiQueue = queueState;
  log('AI Queue running', true);

  const storageKey = provider.storageKey;

  const syncFromStorage = () => {
    resetQueueState({ includeFailedQueue: !!provider.includeFailedQueue });
    provider.loadQueue?.();
    provider.renderQueue?.();
    provider.ensureToolbarButton?.();
    if (storageKey) {
      refreshChatManager(storageKey);
    }
  };

  const refreshForCurrentUrl = () => {
    if (queueState.running) {
      queueState.running = false;
    }

    syncFromStorage();
  };

  syncFromStorage();
  provider.createPanel();
  provider.setupPanelControls?.({
    createItem: provider.createItem,
    renderQueue: provider.renderQueue,
    saveQueue: provider.saveQueue,
    processQueue: provider.processQueue,
    openChatManager: provider.openChatManager,
  });
  provider.setupPanelDrag?.();
  provider.renderQueue?.();
  provider.ensureToolbarButton?.();

  if (storageKey) {
    window.addEventListener('storage', (event) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== storageKey) return;
      syncFromStorage();
    });
  }

  startDomObserver(
    provider.createPanel,
    () =>
      provider.setupPanelControls?.({
        createItem: provider.createItem,
        renderQueue: provider.renderQueue,
        saveQueue: provider.saveQueue,
        processQueue: provider.processQueue,
        openChatManager: provider.openChatManager,
      }),
    provider.setupPanelDrag,
    provider.ensureToolbarButton,
    provider.isOwnMutation
  );
  startUrlWatcher(
    provider.createPanel,
    () =>
      provider.setupPanelControls?.({
        createItem: provider.createItem,
        renderQueue: provider.renderQueue,
        saveQueue: provider.saveQueue,
        processQueue: provider.processQueue,
        openChatManager: provider.openChatManager,
      }),
    provider.setupPanelDrag,
    provider.ensureToolbarButton,
    refreshForCurrentUrl
  );
}
