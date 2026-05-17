import { log } from './logging.js';
import { queueState, resetQueueState } from './state.js';
import { startDomObserver, startUrlWatcher } from './ui.js';
import { applyScopeToQueuedItems } from './storage.js';
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

  const refreshForCurrentUrl = (previousUrl = location.href, currentUrl = location.href) => {
    const getScope = provider.getCurrentScope;
    const previousScope = typeof getScope === 'function' ? getScope(previousUrl) : null;
    const currentScope = typeof getScope === 'function' ? getScope(currentUrl) : null;

    if (queueState.running && queueState.awaitingChatScopeSync && !previousScope && currentScope) {
      const updated = applyScopeToQueuedItems(queueState.queue, queueState.failedQueue, currentScope);

      if (updated) {
        provider.saveQueue?.();
        provider.renderQueue?.();
        provider.ensureToolbarButton?.();
        if (storageKey) {
          refreshChatManager(storageKey);
        }
      }

      queueState.awaitingChatScopeSync = false;

      return;
    }

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
