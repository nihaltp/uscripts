import { queueState, resetQueueState } from './state.js';
import { startDomObserver, startUrlWatcher } from './ui.js';

export function bootstrapQueueApp(provider) {
  globalThis.aiQueue = queueState;

  resetQueueState({ includeFailedQueue: !!provider.includeFailedQueue });

  provider.loadQueue?.();
  provider.createPanel();
  provider.setupPanelControls?.({
    createItem: provider.createItem,
    renderQueue: provider.renderQueue,
    saveQueue: provider.saveQueue,
    processQueue: provider.processQueue,
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
      }),
    provider.setupPanelDrag,
    provider.ensureToolbarButton
  );
}
