// UI helpers exported to AIQueue.ui
window.AIQueue = window.AIQueue || {};
window.AIQueue.ui = window.AIQueue.ui || {};

AIQueue.ui.repairTimer = AIQueue.ui.repairTimer || null;
AIQueue.ui.lastRepairAt = AIQueue.ui.lastRepairAt || 0;
AIQueue.ui.repairing = AIQueue.ui.repairing || false;
AIQueue.ui.urlWatcher = AIQueue.ui.urlWatcher || null;
AIQueue.ui.lastKnownUrl = AIQueue.ui.lastKnownUrl || location.href;
AIQueue.ui.mutationObserver = AIQueue.ui.mutationObserver || null;

AIQueue.ui.ensureToolbarStyles = function () {
  if (document.querySelector('#pq-styles')) return;

  const style = document.createElement('style');
  style.id = 'pq-styles';
  style.textContent = `
    @keyframes pq-pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.06); opacity: 0.75; }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
};

AIQueue.ui.togglePanel = function (panel, isPanelVisible) {
  if (!panel) return;

  isPanelVisible = !isPanelVisible;

  panel.style.display = isPanelVisible ? 'block' : 'none';
  panel.style.pointerEvents = isPanelVisible ? 'auto' : 'none';
  panel.style.visibility = 'visible';
  panel.style.opacity = '1';
  panel.style.top = '100px';
  panel.style.left = '100px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.inset = 'unset';

  AIQueue.logging.log('panel visible', isPanelVisible);
  return isPanelVisible;
};

AIQueue.ui.updateToolbarButton = function (toolbarButton, queue, running) {
  if (!toolbarButton || !AIQueue.utils.isAttached(toolbarButton)) return;

  const count = queue.length;
  toolbarButton.textContent = count > 0 ? `Queue (${count})` : 'Queue';
  toolbarButton.style.animation = running ? 'pq-pulse 1.2s infinite' : '';
  toolbarButton.style.opacity = running ? '1' : count > 0 ? '1' : '0.8';
};

AIQueue.ui.repairUi = function (
  reason = 'repair',
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton
) {
  if (AIQueue.ui.repairing) return;

  AIQueue.ui.repairing = true;

  try {
    createPanel();
    setupPanelEvents?.();
    setupPanelDrag?.();
    ensureToolbarButton?.();
  } finally {
    AIQueue.ui.repairing = false;
  }
};

AIQueue.ui.requestRepair = function (
  reason = 'repair',
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton
) {
  const now = Date.now();
  const delay = Math.max(0, 2000 - (now - AIQueue.ui.lastRepairAt));

  if (AIQueue.ui.repairTimer) {
    clearTimeout(AIQueue.ui.repairTimer);
  }

  AIQueue.ui.repairTimer = setTimeout(() => {
    AIQueue.ui.lastRepairAt = Date.now();
    AIQueue.ui.repairUi(reason, createPanel, setupPanelEvents, setupPanelDrag, ensureToolbarButton);
  }, delay);
};

AIQueue.ui.startDomObserver = function (
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton,
  isOwnMutation
) {
  if (AIQueue.ui.mutationObserver) return;

  const target = document.body || document.documentElement;
  if (!target) return;

  AIQueue.ui.mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const hasExternalChange = [...mutation.addedNodes, ...mutation.removedNodes].some(
          node => node && !AIQueue.utils.isOwnMutation(node)
        );

        if (hasExternalChange) {
          AIQueue.ui.requestRepair(
            'dom-mutation',
            createPanel,
            setupPanelEvents,
            setupPanelDrag,
            ensureToolbarButton
          );
          break;
        }
      }

      if (mutation.type === 'attributes') {
        if (!isOwnMutation(mutation.target)) {
          AIQueue.ui.requestRepair(
            'attribute-mutation',
            createPanel,
            setupPanelEvents,
            setupPanelDrag,
            ensureToolbarButton
          );
          break;
        }
      }
    }
  });

  AIQueue.ui.mutationObserver.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-busy', 'aria-disabled', 'disabled'],
  });
};

AIQueue.ui.patchHistoryMethod = function (methodName) {
  const original = history[methodName];

  if (typeof original !== 'function' || original.__pqPatched) return;

  const patched = function (...args) {
    const result = original.apply(this, args);
    AIQueue.ui.requestRepair('history-' + methodName);
    return result;
  };

  patched.__pqPatched = true;
  history[methodName] = patched;
};

AIQueue.ui.startUrlWatcher = function (
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton
) {
  AIQueue.ui.patchHistoryMethod('pushState');
  AIQueue.ui.patchHistoryMethod('replaceState');

  window.addEventListener('popstate', () =>
    AIQueue.ui.requestRepair(
      'popstate',
      createPanel,
      setupPanelEvents,
      setupPanelDrag,
      ensureToolbarButton
    )
  );
  window.addEventListener('hashchange', () =>
    AIQueue.ui.requestRepair(
      'hashchange',
      createPanel,
      setupPanelEvents,
      setupPanelDrag,
      ensureToolbarButton
    )
  );

  if (AIQueue.ui.urlWatcher) clearInterval(AIQueue.ui.urlWatcher);

  AIQueue.ui.urlWatcher = setInterval(() => {
    if (location.href !== AIQueue.ui.lastKnownUrl) {
      AIQueue.ui.lastKnownUrl = location.href;
      AIQueue.ui.requestRepair(
        'url-change',
        createPanel,
        setupPanelEvents,
        setupPanelDrag,
        ensureToolbarButton
      );
    }
  }, 1000);
};
