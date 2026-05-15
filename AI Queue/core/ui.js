import { log, error } from './logging.js';
import { isAttached, isOwnMutation } from './utils.js';
import toolbarStyles from '../styles/ui.css';

let repairTimer = null;
let lastRepairAt = 0;
let repairing = false;
let urlWatcher = null;
let lastKnownUrl = location.href;
let mutationObserver = null;

export function ensureToolbarStyles() {
  if (document.querySelector('#pq-styles')) return;

  const style = document.createElement('style');
  style.id = 'pq-styles';
  style.textContent = toolbarStyles;
  document.head.appendChild(style);
}

export function getPanel() {
  return document.querySelector('#pq-panel');
}

export function forceShowPanel(panel) {
  if (!panel) return;

  panel.hidden = false;
  panel.style.visibility = 'visible';
  panel.style.opacity = '1';
  panel.style.setProperty('display', 'block', 'important');
  panel.style.setProperty('pointer-events', 'auto', 'important');
}

export function ensurePanelAttached(panel = getPanel()) {
  const currentPanel = getPanel() || panel || null;

  if (!currentPanel) return false;

  const root = document.documentElement || document.body;
  if (!root) return false;

  if (!root.contains(currentPanel)) {
    root.appendChild(currentPanel);
  }

  log('attached', root.contains(currentPanel));
  log('parent node', currentPanel.parentNode);
  return true;
}

export function showPanel(createPanel) {
  log('TOGGLE PANEL');

  let panel = getPanel();

  if (!panel) {
    createPanel?.();
    panel = getPanel();
  }

  if (!panel) {
    error('panel missing');
    return;
  }

  const isHidden = panel.hidden || getComputedStyle(panel).display === 'none';

  if (isHidden) {
    if (!ensurePanelAttached(panel)) {
      error('failed to attach panel');
      return;
    }

    panel.hidden = false;
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
    panel.style.setProperty('pointer-events', 'auto', 'important');
    panel.style.setProperty('z-index', '2147483647', 'important');

    log('final state', {
      display: getComputedStyle(panel).display,
      visibility: getComputedStyle(panel).visibility,
      rect: panel.getBoundingClientRect(),
    });
    return;
  }

  panel.hidden = true;
  panel.style.setProperty('display', 'none', 'important');
  panel.style.setProperty('pointer-events', 'none', 'important');
  log('panel hidden');
}

export function hidePanel(panel = getPanel()) {
  if (!panel) return;

  panel.hidden = true;
  panel.style.setProperty('display', 'none', 'important');
  panel.style.setProperty('pointer-events', 'none', 'important');
  log('panel hidden');
}

export function updateToolbarButton(toolbarButton, queue, running) {
  if (!toolbarButton || !isAttached(toolbarButton)) return;

  const count = queue.length;
  toolbarButton.textContent = count > 0 ? `Queue (${count})` : 'Queue';
  toolbarButton.style.animation = running ? 'pq-pulse 1.2s infinite' : '';
  toolbarButton.style.opacity = running ? '1' : count > 0 ? '1' : '0.8';
}

export function repairUi(
  reason = 'repair',
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton
) {
  if (repairing) return;

  repairing = true;

  try {
    log('repair', reason);
    createPanel();
    setupPanelEvents?.();
    setupPanelDrag?.();
    ensureToolbarButton?.();
  } finally {
    repairing = false;
  }
}

export function requestRepair(
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

export function startDomObserver(
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton,
  isOwnMutationOverride
) {
  if (mutationObserver) return;

  const target = document.body || document.documentElement;
  if (!target) return;

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const hasExternalChange = [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) => node && !isOwnMutation(node)
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
        if (!isOwnMutationOverride?.(mutation.target)) {
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

export function patchHistoryMethod(methodName) {
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

export function startUrlWatcher(
  createPanel,
  setupPanelEvents,
  setupPanelDrag,
  ensureToolbarButton,
  onUrlChange
) {
  const handleUrlChange = (reason) => {
    onUrlChange?.();
    requestRepair(reason, createPanel, setupPanelEvents, setupPanelDrag, ensureToolbarButton);
  };

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');

  window.addEventListener('popstate', () => handleUrlChange('popstate'));
  window.addEventListener('hashchange', () => handleUrlChange('hashchange'));

  if (urlWatcher) clearInterval(urlWatcher);

  urlWatcher = setInterval(() => {
    if (location.href !== lastKnownUrl) {
      lastKnownUrl = location.href;
      handleUrlChange('url-change');
    }
  }, 1000);
}
