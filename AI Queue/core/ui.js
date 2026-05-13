// UI helpers
let repairTimer = null;
let lastRepairAt = 0;
let repairing = false;
let urlWatcher = null;
let lastKnownUrl = location.href;
let mutationObserver = null;

function ensureToolbarStyles() {
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
}

function togglePanel(panel, isPanelVisible) {
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

  log('panel visible', isPanelVisible);
  return isPanelVisible;
}

function updateToolbarButton(toolbarButton, queue, running) {
  if (!toolbarButton || !isAttached(toolbarButton)) return;

  const count = queue.length;
  toolbarButton.textContent = count > 0 ? `Queue (${count})` : 'Queue';
  toolbarButton.style.animation = running ? 'pq-pulse 1.2s infinite' : '';
  toolbarButton.style.opacity = running ? '1' : count > 0 ? '1' : '0.8';
}

function repairUi(
  reason = 'repair',
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton
) {
  if (repairing) return;

  repairing = true;

  try {
    createPanel();
    setupPanelEvents?.();
    setupPanelDrag?.();
    ensureToolbarButton?.();
  } finally {
    repairing = false;
  }
}

function requestRepair(
  reason = 'repair',
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton
) {
  const now = Date.now();
  const delay = Math.max(0, 2000 - (now - lastRepairAt));

  if (repairTimer) {
    clearTimeout(repairTimer);
  }

  repairTimer = setTimeout(() => {
    lastRepairAt = Date.now();
    repairUi(reason, createPanel, setupPanelEvents, setupPanelDrag, ensureToolbarButton);
  }, delay);
}

function startDomObserver(
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton,
  isOwnMutation
) {
  if (mutationObserver) return;

  const target = document.body || document.documentElement;
  if (!target) return;

  mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const hasExternalChange = [...mutation.addedNodes, ...mutation.removedNodes].some(
          node => node && !isOwnMutation(node)
        );

        if (hasExternalChange) {
          requestRepair(
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
          requestRepair(
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

  mutationObserver.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-busy', 'aria-disabled', 'disabled'],
  });
}

function patchHistoryMethod(methodName) {
  const original = history[methodName];

  if (typeof original !== 'function' || original.__pqPatched) return;

  const patched = function (...args) {
    const result = original.apply(this, args);
    requestRepair('history-' + methodName);
    return result;
  };

  patched.__pqPatched = true;
  history[methodName] = patched;
}

function startUrlWatcher(createPanel, setupPanelEvents, setupPanelDrag, ensureToolbarButton) {
  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');

  window.addEventListener('popstate', () =>
    requestRepair('popstate', createPanel, setupPanelEvents, setupPanelDrag, ensureToolbarButton)
  );
  window.addEventListener('hashchange', () =>
    requestRepair('hashchange', createPanel, setupPanelEvents, setupPanelDrag, ensureToolbarButton)
  );

  if (urlWatcher) clearInterval(urlWatcher);

  urlWatcher = setInterval(() => {
    if (location.href !== lastKnownUrl) {
      lastKnownUrl = location.href;
      requestRepair(
        'url-change',
        createPanel,
        setupPanelEvents,
        setupPanelDrag,
        ensureToolbarButton
      );
    }
  }, 1000);
}
