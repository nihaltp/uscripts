import { queueState, resetQueueState } from './state.js';
import { startDomObserver, startUrlWatcher } from './ui.js';

export function bootstrapQueueApp(provider) {
  globalThis.aiQueue = queueState;

  const refreshForCurrentUrl = () => {
    if (queueState.running) {
      queueState.running = false;
    }

    resetQueueState({ includeFailedQueue: !!provider.includeFailedQueue });
    provider.loadQueue?.();
    provider.renderQueue?.();
    provider.ensureToolbarButton?.();
  };

  resetQueueState({ includeFailedQueue: !!provider.includeFailedQueue });

  provider.loadQueue?.();
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
