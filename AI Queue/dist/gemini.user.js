// ==UserScript==
// @name         Gemini Prompt Queue
// @description  A userscript to manage a queue of prompts for Gemini.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20Gemini%20Prompt%20Queue%20dist%2Fgemini.user.js&body=File%3A%20AI%20Queue%2Fdist%2Fgemini.user.js%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://gemini.google.com/app
// @match        https://gemini.google.com/app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @version      3.0.16
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/gemini.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/gemini.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  // AI Queue/core/state.js
  var queueState = {
    queue: [],
    failedQueue: [],
    running: false,
    editingId: null,
    draggedId: null,
  };
  function resetQueueState({ includeFailedQueue = false } = {}) {
    queueState.queue.length = 0;
    if (includeFailedQueue) {
      queueState.failedQueue.length = 0;
    }
    queueState.running = false;
    queueState.editingId = null;
    queueState.draggedId = null;
  }

  // AI Queue/core/logging.js
  window.aiQueueDebug = false;
  function isDebugEnabled() {
    return Boolean(globalThis.aiQueueDebug);
  }
  function log(...args) {
    const force = typeof args[args.length - 1] === 'boolean' ? args.pop() : false;
    if (!force && !isDebugEnabled()) return;
    console.log('[AI QUEUE]', ...args);
  }
  function error(...args) {
    console.error('[AI QUEUE]', ...args);
  }
  function throwError(...args) {
    error(...args);
    throw new Error(args.join(' '));
  }

  // AI Queue/core/utils.js
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function isAttached(element) {
    return !!element && document.contains(element);
  }
  function isVisible(element) {
    if (!isAttached(element)) return false;
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }
  function isActionButtonElement(element) {
    return (
      !!element &&
      element instanceof HTMLElement &&
      element.matches('button, [role="button"], input[type="button"], input[type="submit"]')
    );
  }
  function isOwnMutation(target) {
    return (
      !!target &&
      (target.closest?.('#pq-panel') || target.closest?.('.pq-toolbar') || target.id === 'pq-panel')
    );
  }

  // AI Queue/styles/ui.css
  var ui_default =
    '@keyframes pq-pulse {\r\n  0% {\r\n    transform: scale(1);\r\n    opacity: 1;\r\n  }\r\n\r\n  50% {\r\n    transform: scale(1.06);\r\n    opacity: 0.75;\r\n  }\r\n\r\n  100% {\r\n    transform: scale(1);\r\n    opacity: 1;\r\n  }\r\n}';

  // AI Queue/core/ui.js
  var repairTimer = null;
  var lastRepairAt = 0;
  var repairing = false;
  var urlWatcher = null;
  var lastKnownUrl = location.href;
  var mutationObserver = null;
  function ensureToolbarStyles() {
    if (document.querySelector('#pq-styles')) return;
    const style = document.createElement('style');
    style.id = 'pq-styles';
    style.textContent = ui_default;
    document.head.appendChild(style);
  }
  function getPanel() {
    return document.querySelector('#pq-panel');
  }
  function ensurePanelAttached(panel = getPanel()) {
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
  function showPanel(createPanel) {
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
  function hidePanel(panel = getPanel()) {
    if (!panel) return;
    panel.hidden = true;
    panel.style.setProperty('display', 'none', 'important');
    panel.style.setProperty('pointer-events', 'none', 'important');
    log('panel hidden');
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
    setupPanelDrag2,
    ensureToolbarButton
  ) {
    if (repairing) return;
    repairing = true;
    try {
      log('repair', reason);
      createPanel();
      setupPanelEvents?.();
      setupPanelDrag2?.();
      ensureToolbarButton?.();
    } finally {
      repairing = false;
    }
  }
  function requestRepair(
    reason = 'repair',
    createPanel,
    setupPanelEvents,
    setupPanelDrag2,
    ensureToolbarButton
  ) {
    const now = Date.now();
    const delay = Math.max(0, 2e3 - (now - lastRepairAt));
    if (repairTimer) {
      clearTimeout(repairTimer);
    }
    repairTimer = setTimeout(() => {
      lastRepairAt = Date.now();
      repairUi(reason, createPanel, setupPanelEvents, setupPanelDrag2, ensureToolbarButton);
    }, delay);
  }
  function startDomObserver(
    createPanel,
    setupPanelEvents,
    setupPanelDrag2,
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
              setupPanelDrag2,
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
              setupPanelDrag2,
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
  function startUrlWatcher(
    createPanel,
    setupPanelEvents,
    setupPanelDrag2,
    ensureToolbarButton,
    onUrlChange
  ) {
    const handleUrlChange = (reason) => {
      onUrlChange?.();
      requestRepair(reason, createPanel, setupPanelEvents, setupPanelDrag2, ensureToolbarButton);
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
    }, 1e3);
  }

  // AI Queue/core/panel.js
  function createBasePanel(titleText, includeFailedList = false) {
    log('createBasePanel called');
    let panel = document.querySelector('#pq-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'pq-panel';
      Object.assign(panel.style, {
        position: 'fixed',
        top: '80px',
        left: '24px',
        bottom: 'auto',
        right: 'auto',
        width: '320px',
        minHeight: '200px',
        maxHeight: '70vh',
        overflowY: 'auto',
        background: '#202123',
        color: 'white',
        border: '1px solid #444',
        borderRadius: '16px',
        padding: '12px',
        zIndex: '2147483647',
        boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
        display: 'none',
        transform: 'none',
      });
      const title = document.createElement('div');
      title.style.display = 'flex';
      title.style.alignItems = 'center';
      title.style.justifyContent = 'space-between';
      title.style.gap = '12px';
      title.style.fontSize = '18px';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '10px';
      const titleLabel = document.createElement('span');
      titleLabel.textContent = titleText;
      const closeBtn = document.createElement('button');
      closeBtn.id = 'pq-close';
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      Object.assign(closeBtn.style, {
        flexShrink: '0',
        padding: '4px 10px',
        borderRadius: '9999px',
        border: '1px solid #555',
        background: '#2a2a2a',
        color: '#fff',
        cursor: 'pointer',
      });
      closeBtn.addEventListener('click', () => hidePanel(panel));
      title.appendChild(titleLabel);
      title.appendChild(closeBtn);
      const textarea = document.createElement('textarea');
      textarea.id = 'pq-input';
      textarea.placeholder = 'Enter prompt...';
      Object.assign(textarea.style, {
        width: '100%',
        height: '80px',
        resize: 'vertical',
        color: '#fff',
        background: '#222',
        border: '1px solid #444',
        borderRadius: '6px',
        padding: '8px',
        boxSizing: 'border-box',
      });
      const addBtn = document.createElement('button');
      addBtn.id = 'pq-add';
      addBtn.style.marginTop = '10px';
      addBtn.style.width = '100%';
      addBtn.textContent = 'Add To Queue';
      const manageChatsBtn = document.createElement('button');
      manageChatsBtn.id = 'pq-manage-chats';
      manageChatsBtn.style.marginTop = '10px';
      manageChatsBtn.style.width = '100%';
      manageChatsBtn.textContent = 'Manage Chat Prompts';
      const startBtn = document.createElement('button');
      startBtn.id = 'pq-start';
      startBtn.style.marginTop = '10px';
      startBtn.style.width = '100%';
      startBtn.textContent = 'Start Queue';
      const status = document.createElement('div');
      status.id = 'pq-status';
      status.style.marginTop = '10px';
      status.textContent = 'Idle';
      const list = document.createElement('ol');
      list.id = 'pq-list';
      list.style.marginTop = '10px';
      list.style.paddingLeft = '20px';
      panel.appendChild(title);
      panel.appendChild(textarea);
      panel.appendChild(addBtn);
      panel.appendChild(manageChatsBtn);
      panel.appendChild(startBtn);
      panel.appendChild(status);
      panel.appendChild(list);
      if (includeFailedList) {
        const failedTitle = document.createElement('div');
        failedTitle.id = 'pq-failed-title';
        failedTitle.style.marginTop = '12px';
        failedTitle.style.fontSize = '13px';
        failedTitle.style.opacity = '0.8';
        failedTitle.textContent = 'Failed Prompts';
        const failedList = document.createElement('ol');
        failedList.id = 'pq-failed-list';
        failedList.style.marginTop = '6px';
        failedList.style.paddingLeft = '20px';
        panel.appendChild(failedTitle);
        panel.appendChild(failedList);
      }
      const root = document.documentElement || document.body;
      if (root) {
        root.appendChild(panel);
      }
    } else {
      ensurePanelAttached(panel);
    }
    log('createBasePanel panel', panel);
    setTimeout(() => {
      log('panel element', panel);
      log('computed display', getComputedStyle(panel).display);
      log('computed visibility', getComputedStyle(panel).visibility);
      log('rect', panel.getBoundingClientRect());
      log('parent', panel.parentElement);
    }, 0);
    return panel;
  }

  // AI Queue/core/queue.js
  function deleteQueueItem(id, queue, renderQueue, saveQueue2) {
    const index = queue.findIndex((item) => item.id === id);
    if (index === -1) {
      log('Item to delete not found in queue:', id);
      return;
    }
    queue.splice(index, 1);
    renderQueue();
    saveQueue2?.();
  }
  function editQueueItem(id, queue, updateUI) {
    const item = queue.find((item2) => item2.id === id);
    if (!item) {
      log('Item to edit not found in queue:', id);
      return;
    }
    updateUI(id, item.prompt);
  }
  function moveQueueItem(fromId, toId, queue, renderQueue, saveQueue2) {
    const fromIndex = queue.findIndex((item) => item.id === fromId);
    const toIndex = queue.findIndex((item) => item.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [movedItem] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, movedItem);
    renderQueue();
    saveQueue2?.();
  }
  function setStatus(panel, text) {
    if (!panel) return;
    const status = panel.querySelector('#pq-status');
    if (status) {
      status.textContent = text;
    }
  }

  // AI Queue/core/queue-ui.js
  function createQueueItemElement(item, { renderQueue, saveQueue: saveQueue2 }) {
    const li = document.createElement('li');
    li.style.marginBottom = '10px';
    li.draggable = false;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.style.alignItems = 'flex-start';
    const text = document.createElement('div');
    text.textContent = item.prompt;
    text.style.flex = '1';
    text.style.wordBreak = 'break-word';
    text.style.fontSize = '14px';
    const editBtn = document.createElement('button');
    editBtn.textContent = '\u{1F589}';
    editBtn.title = 'Edit';
    editBtn.style.cursor = 'pointer';
    editBtn.style.color = '#7dd3fc';
    editBtn.style.display = 'none';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '\u2715';
    deleteBtn.title = 'Delete';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.color = '#ff6b6b';
    deleteBtn.style.display = 'none';
    row.appendChild(text);
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);
    const dragHandle = document.createElement('span');
    dragHandle.textContent = '\u2630';
    dragHandle.title = 'Drag to reorder';
    dragHandle.style.cursor = 'grab';
    dragHandle.style.userSelect = 'none';
    dragHandle.style.alignSelf = 'center';
    dragHandle.style.marginLeft = '6px';
    dragHandle.style.display = 'none';
    dragHandle.addEventListener('dragstart', (e) => {
      queueState.draggedId = item.id;
      try {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      } catch (err) {
        error('Drag start dataTransfer error:', err);
      }
      li.style.opacity = '0.6';
    });
    dragHandle.addEventListener('dragend', () => {
      queueState.draggedId = null;
      li.style.opacity = '';
    });
    row.appendChild(dragHandle);
    li.appendChild(row);
    li.addEventListener('mouseenter', () => {
      editBtn.style.display = 'inline-block';
      deleteBtn.style.display = 'inline-block';
      dragHandle.style.display = 'inline-block';
    });
    li.addEventListener('mouseleave', () => {
      if (queueState.editingId === item.id) return;
      editBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      if (queueState.draggedId === item.id) return;
      dragHandle.style.display = 'none';
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = 'move';
      } catch (err) {
        error('Drag over dataTransfer error:', err);
      }
      li.style.borderTop = '2px solid #7dd3fc';
    });
    li.addEventListener('dragleave', () => {
      li.style.borderTop = '';
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.style.borderTop = '';
      const draggedId =
        queueState.draggedId ||
        (e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData('text/plain'));
      if (draggedId && draggedId !== item.id) {
        moveQueueItem(draggedId, item.id, queueState.queue, renderQueue, saveQueue2);
      }
    });
    return { li, text, editBtn, deleteBtn };
  }

  // AI Queue/core/storage.js
  var GLOBAL_CHAT_KEY = '__global__';
  var DEFAULT_ITEM_STATUS = 'queued';
  var DEFAULT_FAILED_STATUS = 'failed';
  function toChatCode(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  function resolveScope(currentScope = null) {
    if (typeof currentScope === 'string') {
      return {
        chatId: toChatCode(currentScope),
        groupId: null,
      };
    }
    if (!currentScope || typeof currentScope !== 'object') {
      return {
        chatId: null,
        groupId: null,
      };
    }
    const chatId = toChatCode(currentScope.chatId || currentScope.chatCode || null);
    const groupId = toChatCode(currentScope.groupId || null);
    return {
      chatId,
      groupId,
    };
  }
  function resolveScopeKeys(currentScope = null) {
    const scope = resolveScope(currentScope);
    return [...new Set([scope.groupId, scope.chatId].filter(Boolean))];
  }
  function toChatKey(value) {
    return toChatCode(value) || GLOBAL_CHAT_KEY;
  }
  function generateId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function toCreatedAt(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }
  function sanitizeItem(item, defaultStatus = DEFAULT_ITEM_STATUS) {
    if (!item || typeof item.prompt !== 'string') return null;
    const chatId = toChatCode(item.chatId || item.chatCode || null);
    const groupId = toChatCode(item.groupId || null);
    const normalized = {
      id: typeof item.id === 'string' && item.id ? item.id : generateId(),
      prompt: item.prompt,
      attempts: Number.isFinite(Number(item.attempts)) ? Number(item.attempts) : 0,
      status:
        typeof item.status === 'string' && item.status.trim() ? item.status.trim() : defaultStatus,
      createdAt: toCreatedAt(item.createdAt),
    };
    if (chatId) {
      normalized.chatId = chatId;
      normalized.chatCode = chatId;
    }
    if (groupId) {
      normalized.groupId = groupId;
    }
    return normalized;
  }
  function sanitizeItems(items, defaultStatus = DEFAULT_ITEM_STATUS) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => sanitizeItem(item, defaultStatus)).filter(Boolean);
  }
  function emptyChats() {
    return {};
  }
  function sanitizeChatBuckets(chats) {
    const normalized = emptyChats();
    if (!chats || typeof chats !== 'object' || Array.isArray(chats)) {
      return normalized;
    }
    for (const [chatKey, bucket] of Object.entries(chats)) {
      normalized[toChatKey(chatKey)] = {
        items: sanitizeItems(bucket?.items, DEFAULT_ITEM_STATUS),
        failedItems: sanitizeItems(bucket?.failedItems, DEFAULT_FAILED_STATUS),
      };
    }
    return normalized;
  }
  function addLegacyItem(chats, item, defaultStatus, bucketName) {
    const normalizedItem = sanitizeItem(item, defaultStatus);
    if (!normalizedItem) return;
    const chatKey = toChatKey(item?.chatCode);
    if (!chats[chatKey]) {
      chats[chatKey] = { items: [], failedItems: [] };
    }
    chats[chatKey][bucketName].push(normalizedItem);
  }
  function mergeUniqueItems(itemsA, itemsB) {
    const merged = /* @__PURE__ */ new Map();
    [...(itemsA || []), ...(itemsB || [])].forEach((item) => {
      if (!item || typeof item.id !== 'string') return;
      if (!merged.has(item.id)) {
        merged.set(item.id, { ...item });
      }
    });
    return [...merged.values()];
  }
  function buildLegacyData(parsed) {
    const chats = emptyChats();
    if (Array.isArray(parsed?.items)) {
      parsed.items.forEach((item) => addLegacyItem(chats, item, DEFAULT_ITEM_STATUS, 'items'));
    } else if (Array.isArray(parsed?.queue)) {
      parsed.queue.forEach((item) => addLegacyItem(chats, item, DEFAULT_ITEM_STATUS, 'items'));
    }
    if (Array.isArray(parsed?.failedItems)) {
      parsed.failedItems.forEach((item) =>
        addLegacyItem(chats, item, DEFAULT_FAILED_STATUS, 'failedItems')
      );
    } else if (Array.isArray(parsed?.failedQueue)) {
      parsed.failedQueue.forEach((item) =>
        addLegacyItem(chats, item, DEFAULT_FAILED_STATUS, 'failedItems')
      );
    }
    return { chats };
  }
  function normalizeData(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return { chats: emptyChats() };
    }
    if (parsed.chats && typeof parsed.chats === 'object' && !Array.isArray(parsed.chats)) {
      return {
        chats: sanitizeChatBuckets(parsed.chats),
      };
    }
    return buildLegacyData(parsed);
  }
  function readScopedQueueData(storageKey = 'pq-queue-state') {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        return { chats: emptyChats() };
      }
      const parsed = JSON.parse(stored);
      return normalizeData(parsed);
    } catch (err) {
      error('Failed to read queue storage:', err);
      return { chats: emptyChats() };
    }
  }
  function writeScopedQueueData(storageKey = 'pq-queue-state', data = {}) {
    try {
      const normalized = normalizeData(data);
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    } catch (err) {
      error('Failed to write queue storage:', err);
    }
  }
  function saveQueue(queue, failedQueue, storageKey = 'pq-queue-state', currentScope = null) {
    try {
      const scope = resolveScope(currentScope);
      const scopeKeys = resolveScopeKeys(currentScope);
      const data = readScopedQueueData(storageKey);
      const existingBuckets = scopeKeys.map(
        (scopeKey) => data.chats[scopeKey] || { items: [], failedItems: [] }
      );
      const nextItems = sanitizeItems(queue || [], DEFAULT_ITEM_STATUS).map((item) => ({
        ...item,
        ...(scope.chatId
          ? {
              chatId: scope.chatId,
              chatCode: scope.chatId,
            }
          : {}),
        ...(scope.groupId ? { groupId: scope.groupId } : {}),
      }));
      const nextFailedItems = Array.isArray(failedQueue)
        ? sanitizeItems(failedQueue || [], DEFAULT_FAILED_STATUS).map((item) => ({
            ...item,
            ...(scope.chatId
              ? {
                  chatId: scope.chatId,
                  chatCode: scope.chatId,
                }
              : {}),
            ...(scope.groupId ? { groupId: scope.groupId } : {}),
          }))
        : mergeUniqueItems(
            ...existingBuckets.map((bucket) =>
              sanitizeItems(bucket.failedItems, DEFAULT_FAILED_STATUS)
            )
          );
      const nextBucket = {
        items: nextItems,
        failedItems: nextFailedItems,
      };
      const nextChats = { ...data.chats };
      scopeKeys.forEach((scopeKey) => {
        nextChats[scopeKey] = {
          items: nextItems.map((item) => ({ ...item })),
          failedItems: nextFailedItems.map((item) => ({ ...item })),
        };
      });
      writeScopedQueueData(storageKey, {
        chats: nextChats,
      });
      log('queue saved to storage', {
        storageKey,
        currentChatCode: scopeKeys,
        visibleItems: nextBucket.items.length,
      });
    } catch (err) {
      error('Failed to save queue:', err);
    }
  }
  function loadQueue(queue, failedQueue, storageKey = 'pq-queue-state', currentScope = null) {
    try {
      const scopeKeys = resolveScopeKeys(currentScope);
      const data = readScopedQueueData(storageKey);
      const buckets = scopeKeys.map(
        (scopeKey) => data.chats[scopeKey] || { items: [], failedItems: [] }
      );
      const visibleQueueItems = mergeUniqueItems(...buckets.map((bucket) => bucket.items));
      queue.push(...visibleQueueItems.map((item) => ({ ...item })));
      if (Array.isArray(failedQueue)) {
        const visibleFailedItems = mergeUniqueItems(...buckets.map((bucket) => bucket.failedItems));
        failedQueue.push(...visibleFailedItems.map((item) => ({ ...item })));
      }
      log('queue loaded from storage', {
        storageKey,
        currentChatCode: scopeKeys,
        visibleItems: visibleQueueItems.length,
      });
    } catch (err) {
      error('Failed to load queue:', err);
    }
  }

  // AI Queue/core/panel-controls.js
  var boundPanels = /* @__PURE__ */ new WeakSet();
  function setupPanelControls({
    createItem,
    renderQueue,
    saveQueue: saveQueue2,
    processQueue,
    openChatManager,
  }) {
    const panel = getPanel();
    if (!panel) return;
    if (boundPanels.has(panel)) return;
    const input = panel.querySelector('#pq-input');
    const addBtn = panel.querySelector('#pq-add');
    const manageChatsBtn = panel.querySelector('#pq-manage-chats');
    const startBtn = panel.querySelector('#pq-start');
    const getToolbarButton = () => document.querySelector('#pq-toolbar-button');
    const handleAddClick = () => {
      const text = input.value.trim();
      if (!text) {
        log('Empty prompt, not adding to queue');
        return;
      }
      if (queueState.editingId !== null) {
        const item = queueState.queue.find((item2) => item2.id === queueState.editingId);
        if (!item) {
          log('Editing item not found in queue:', queueState.editingId);
          queueState.queue.push(createItem(text));
        } else {
          item.prompt = text;
        }
        queueState.editingId = null;
        addBtn.textContent = 'Add To Queue';
      } else {
        queueState.queue.push(createItem(text));
      }
      updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
      input.value = '';
      renderQueue();
      saveQueue2();
    };
    addBtn.addEventListener('click', handleAddClick);
    if (manageChatsBtn) {
      manageChatsBtn.addEventListener('click', () => {
        openChatManager?.();
      });
    }
    input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddClick();
      }
    });
    function updateStartStopButtons() {
      if (!startBtn) return;
      startBtn.textContent = queueState.running ? 'Stop Queue' : 'Start Queue';
      startBtn.disabled = false;
    }
    startBtn.addEventListener('click', async () => {
      if (queueState.running) {
        queueState.running = false;
        setStatus(panel, 'Stopped');
        updateStartStopButtons();
        updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
        return;
      }
      queueState.running = true;
      updateStartStopButtons();
      updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
      try {
        await processQueue();
      } catch (err) {
        error('Queue processor error:', err);
      } finally {
        queueState.running = false;
        updateStartStopButtons();
        updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
      }
    });
    boundPanels.add(panel);
    updateStartStopButtons();
  }

  // AI Queue/core/drag.js
  var dragBoundPanel = null;
  var listenersBound = false;
  var dragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var panelStartX = 0;
  var panelStartY = 0;
  function onMouseMove(e) {
    if (!dragging) return;
    const panel = getPanel();
    if (!panel) return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    panel.style.left = panelStartX + deltaX + 'px';
    panel.style.top = panelStartY + deltaY + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  function onMouseUp() {
    if (dragging) {
      dragging = false;
      log('panel drag ended');
    }
  }
  function bindDocumentListeners() {
    if (listenersBound) return;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    listenersBound = true;
  }
  function setupPanelDrag() {
    const panel = getPanel();
    if (!panel) return;
    bindDocumentListeners();
    if (dragBoundPanel === panel) return;
    dragBoundPanel = panel;
    panel.addEventListener(
      'mousedown',
      (e) => {
        if (e.button !== 2) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panelStartX = panel.offsetLeft;
        panelStartY = panel.offsetTop;
        log('panel drag started');
      },
      true
    );
    panel.addEventListener('contextmenu', (e) => {
      if (dragging) {
        e.preventDefault();
      }
    });
  }

  // AI Queue/core/dom.js
  function waitForCondition(
    predicate,
    { timeoutMs = 1e4, intervalMs = 100, description = 'condition' } = {}
  ) {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const result = await Promise.resolve(predicate());
          if (result) {
            resolve(result);
            return;
          }
        } catch (err) {
          error('waitForCondition check error:', err);
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed > timeoutMs) {
          reject(error(`Timeout waiting for ${description} (${elapsed}ms)`));
          return;
        }
        setTimeout(check, intervalMs);
      };
      check();
    });
  }
  function waitForElement(getter, options = {}) {
    return waitForCondition(() => getter(), options);
  }
  function safeClick(element) {
    if (!isAttached(element) || !isVisible(element)) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.focus?.({ preventScroll: true });
    if (typeof element.click === 'function') {
      element.click();
      return true;
    }
    element.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
    );
    element.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
    );
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
    );
    return true;
  }
  function getEditorText(editor) {
    if (!editor) return '';
    if ('value' in editor) return String(editor.value || '');
    return String(editor.textContent || '');
  }
  function isEditableCandidate(element) {
    if (!element) return false;
    if (!(element instanceof HTMLElement)) return false;
    if (!isAttached(element)) return false;
    if (!isVisible(element)) return false;
    const isTextarea = element instanceof HTMLTextAreaElement;
    const isContentEditable =
      element.isContentEditable || element.getAttribute('contenteditable') === 'true';
    if (!isTextarea && !isContentEditable) return false;
    if (element.matches('button, [role="button"], input[type="button"], input[type="submit"]'))
      return false;
    if (element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
    if (element.closest('#pq-panel')) return false;
    return true;
  }
  function scoreEditor(editor) {
    const rect = editor.getBoundingClientRect();
    let score = rect.top;
    if (editor === document.activeElement) score += 1e3;
    if (editor.matches('textarea')) score += 100;
    if (editor.matches('[contenteditable="true"]')) score += 80;
    if ((editor.getAttribute('role') || '').toLowerCase() === 'textbox') score += 60;
    if (editor.closest('form')) score += 30;
    if (editor.closest('[role="form"]')) score += 20;
    if (rect.bottom > window.innerHeight * 0.5) score += 50;
    return score;
  }
  function getComposerEditor() {
    const activeElement = document.activeElement;
    if (isEditableCandidate(activeElement)) {
      if (isActionButtonElement(activeElement)) return null;
      log('editor found', activeElement);
      return activeElement;
    }
    const candidates = [
      ...document.querySelectorAll(
        'textarea:not(#pq-input), [contenteditable="true"][role="textbox"], [contenteditable="true"]'
      ),
    ]
      .filter(isEditableCandidate)
      .sort((left, right) => scoreEditor(right) - scoreEditor(left));
    candidates.forEach((candidate) => log('editor candidate', candidate.tagName, candidate));
    const editor = candidates[0] || null;
    if (editor && editor.matches('button, [role="button"]')) return null;
    if (editor) log('editor found', editor);
    return editor;
  }
  function getComposerHost(editor = getComposerEditor()) {
    if (!editor) return null;
    const host =
      editor.closest(
        'form, [role="form"], [aria-label*="prompt" i], [aria-label*="composer" i], [aria-label*="message" i], [data-testid*="prompt" i], [data-testid*="composer" i]'
      ) ||
      editor.parentElement ||
      null;
    if (!host || host === editor || editor.contains(host) || host.contains?.(editor)) return null;
    if (
      host.isContentEditable ||
      host.matches?.(
        '[contenteditable="true"], textarea, input, button, [role="button"], input[type="button"], input[type="submit"]'
      )
    )
      return null;
    return host;
  }
  function getButtonLabel(button) {
    return [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function isActionButtonVisible(button) {
    return isAttached(button) && isVisible(button);
  }
  function getSendButton({ includeDisabled = false } = {}) {
    const host = getComposerHost();
    const selectors = [
      'button[data-testid="send-button"]',
      '[role="button"][data-testid="send-button"]',
      'button[aria-label*="Send" i]',
      'button[title*="Send" i]',
      '[role="button"][aria-label*="Send" i]',
      '[role="button"][title*="Send" i]',
    ];
    const candidates = [];
    for (const selector of selectors) {
      candidates.push(...document.querySelectorAll(selector));
    }
    if (host) {
      candidates.push(...host.querySelectorAll('button, [role="button"]'));
    }
    const button =
      candidates.find((candidate) => {
        if (!candidate || !(candidate instanceof HTMLElement)) return false;
        if (!isActionButtonVisible(candidate)) return false;
        const label = getButtonLabel(candidate);
        const exactSend = candidate.matches('[data-testid="send-button"]');
        const looksLikeSend = /\bsend\b/i.test(label) || /\bsubmit\b/i.test(label);
        if (!exactSend && !looksLikeSend) return false;
        if (!includeDisabled && candidate.disabled) return false;
        return true;
      }) || null;
    if (button) log('send button found', button);
    return button;
  }
  function findStopButton() {
    const selectors = [
      'button[data-testid="stop-button"]',
      '[role="button"][data-testid="stop-button"]',
      'button[aria-label*="Stop" i]',
      'button[title*="Stop" i]',
      '[role="button"][aria-label*="Stop" i]',
      '[role="button"][title*="Stop" i]',
    ];
    for (const selector of selectors) {
      const button = [...document.querySelectorAll(selector)].find(isActionButtonVisible) || null;
      if (button) {
        log('stop button found', button);
        return button;
      }
    }
    return null;
  }
  function hasBusyIndicators() {
    return [
      ...document.querySelectorAll(
        '[aria-busy="true"], [data-loading="true"], [role="progressbar"]'
      ),
    ].some(isActionButtonVisible);
  }

  // AI Queue/core/keyboard.js
  function dispatchEnterKey(target) {
    const eventInit = {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
    };
    for (const type of ['keydown', 'keypress', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, eventInit));
    }
  }
  function setEditorValue(editor, prompt) {
    if (!editor) throwError('Editor not found');
    if (!isAttached(editor)) throwError('Editor is detached');
    editor.focus?.({ preventScroll: true });
    if ('value' in editor) {
      const setter =
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(editor, prompt);
      } else {
        editor.value = prompt;
      }
      if ('selectionStart' in editor) {
        editor.selectionStart = editor.selectionEnd = editor.value.length;
      }
      editor.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: prompt,
        })
      );
      editor.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: prompt,
        })
      );
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (editor.isContentEditable) {
      editor.focus?.({ preventScroll: true });
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false);
      }
      editor.textContent = prompt;
      editor.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: prompt,
        })
      );
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    throwError('Unsupported editor type');
  }
  async function sendPrompt(prompt) {
    const editor = await waitForElement(() => getComposerEditor(), {
      timeoutMs: 15e3,
      intervalMs: 200,
      description: 'Composer editor',
    });
    setEditorValue(editor, prompt);
    try {
      await waitForCondition(
        () => {
          const btn = getSendButton();
          return btn && !btn.disabled;
        },
        {
          timeoutMs: 5e3,
          intervalMs: 100,
          description: 'send button to enable',
        }
      );
      const sendButton = getSendButton();
      if (sendButton) {
        safeClick(sendButton);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (err) {
      error('send button unavailable, falling back to Enter', err.message);
    }
    dispatchEnterKey(editor);
    if (editor.form && typeof editor.form.requestSubmit === 'function') {
      editor.form.requestSubmit();
    }
  }

  // AI Queue/core/generation.js
  var lastGenerationLabel = '';
  function getGenerationState() {
    const editor = getComposerEditor();
    const sendButton = getSendButton({ includeDisabled: true });
    const stopButton = findStopButton();
    const hasPrompt = !!getEditorText(editor).trim();
    const busyIndicators = hasBusyIndicators();
    const generating = Boolean(
      stopButton || busyIndicators || (sendButton && sendButton.disabled && hasPrompt)
    );
    const label = JSON.stringify({
      generating,
      hasPrompt,
      busyIndicators,
      sendDisabled: !!(sendButton && sendButton.disabled),
      stopButton: !!stopButton,
    });
    if (label !== lastGenerationLabel) {
      lastGenerationLabel = label;
      log('generation state', {
        generating,
        hasPrompt,
        busyIndicators,
        sendDisabled: !!(sendButton && sendButton.disabled),
        stopButton: !!stopButton,
      });
    }
    return { generating, editor, sendButton, stopButton, busyIndicators, hasPrompt };
  }
  async function waitForIdle({ timeoutMs = 6e4, intervalMs = 200 } = {}) {
    try {
      await waitForCondition(
        async () => {
          const { generating } = getGenerationState();
          return !generating;
        },
        {
          timeoutMs,
          intervalMs,
          description: 'AI to become idle',
        }
      );
      await sleep(300);
    } catch (err) {
      log('waitForIdle timed out:', err.message);
      await sleep(300);
    }
  }
  async function waitForGenerationStart({ timeoutMs = 8e3, intervalMs = 100 } = {}) {
    return waitForCondition(() => getGenerationState().generating, {
      timeoutMs,
      intervalMs,
      description: 'Generation to start',
    });
  }
  async function waitForPromptProcessing() {
    try {
      await waitForGenerationStart();
    } catch (err) {
      log('Generation did not start:', err.message);
    }
    await waitForIdle();
  }

  // AI Queue/styles/chat-manager.css
  var chat_manager_default =
    ':root {\r\n  color-scheme: dark;\r\n  --pq-manager-bg: #0b1220;\r\n  --pq-manager-panel: rgba(17, 24, 39, 0.96);\r\n  --pq-manager-card: rgba(31, 41, 55, 0.96);\r\n  --pq-manager-text: #f3f4f6;\r\n  --pq-manager-muted: #9ca3af;\r\n  --pq-manager-border: #374151;\r\n  --pq-manager-accent: #60a5fa;\r\n  --pq-manager-accent-strong: #22c55e;\r\n}\r\n\r\n#pq-chat-manager-panel {\r\n  position: fixed;\r\n  top: 6vh;\r\n  left: 50%;\r\n  transform: translateX(-50%);\r\n  width: min(1100px, calc(100vw - 32px));\r\n  height: min(760px, calc(100vh - 32px));\r\n  z-index: 2147483647;\r\n  display: flex;\r\n  flex-direction: column;\r\n  background: radial-gradient(circle at top right, rgba(31, 41, 55, 0.95), rgba(11, 18, 32, 0.98) 60%);\r\n  color: var(--pq-manager-text);\r\n  border: 1px solid var(--pq-manager-border);\r\n  border-radius: 16px;\r\n  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);\r\n  overflow: hidden;\r\n}\r\n\r\n.pq-manager-shell {\r\n  display: flex;\r\n  flex-direction: column;\r\n  height: 100%;\r\n  min-height: 0;\r\n}\r\n\r\n.pq-manager-header {\r\n  display: flex;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n  gap: 16px;\r\n  padding: 16px 18px 12px;\r\n  border-bottom: 1px solid var(--pq-manager-border);\r\n  background: linear-gradient(180deg, rgba(17, 24, 39, 0.95), rgba(17, 24, 39, 0.82));\r\n}\r\n\r\n.pq-manager-title {\r\n  font-size: 18px;\r\n  font-weight: 700;\r\n  line-height: 1.2;\r\n  margin: 0;\r\n}\r\n\r\n.pq-manager-subtitle {\r\n  margin-top: 4px;\r\n  color: var(--pq-manager-muted);\r\n  font-size: 13px;\r\n  line-height: 1.4;\r\n  max-width: 72ch;\r\n}\r\n\r\n.pq-manager-actions {\r\n  display: flex;\r\n  gap: 8px;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.pq-manager-actions button {\r\n  appearance: none;\r\n  border: 1px solid var(--pq-manager-border);\r\n  background: rgba(31, 41, 55, 0.95);\r\n  color: var(--pq-manager-text);\r\n  border-radius: 999px;\r\n  padding: 8px 12px;\r\n  font: inherit;\r\n  cursor: pointer;\r\n}\r\n\r\n.pq-manager-actions button:hover {\r\n  border-color: var(--pq-manager-accent);\r\n}\r\n\r\n.pq-manager-body {\r\n  display: flex;\r\n  flex-direction: column;\r\n  min-height: 0;\r\n  padding: 16px 18px 18px;\r\n  gap: 12px;\r\n  overflow: hidden;\r\n}\r\n\r\n.pq-manager-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));\r\n  gap: 12px;\r\n  align-items: start;\r\n  flex: 1;\r\n  min-height: 0;\r\n  overflow: auto;\r\n  padding-right: 4px;\r\n}\r\n\r\n.chat-card {\r\n  background: linear-gradient(180deg, var(--pq-manager-panel), var(--pq-manager-card));\r\n  border: 1px solid var(--pq-manager-border);\r\n  border-radius: 12px;\r\n  overflow: hidden;\r\n  min-height: 140px;\r\n}\r\n\r\n.chat-title {\r\n  padding: 10px 12px;\r\n  border-bottom: 1px solid var(--pq-manager-border);\r\n  font-size: 12px;\r\n  letter-spacing: 0.2px;\r\n  text-transform: uppercase;\r\n  color: #d1d5db;\r\n  display: flex;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n}\r\n\r\n.chat-title .chat-controls {\r\n  display: inline-flex;\r\n  gap: 8px;\r\n  align-items: center;\r\n}\r\n\r\n.chat-delete {\r\n  appearance: none;\r\n  border: 1px solid transparent;\r\n  background: transparent;\r\n  color: var(--pq-manager-muted);\r\n  border-radius: 8px;\r\n  padding: 4px 8px;\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n}\r\n\r\n.chat-delete:hover {\r\n  color: var(--pq-manager-accent);\r\n  border-color: rgba(96, 165, 250, 0.12);\r\n  background: rgba(96, 165, 250, 0.03);\r\n}\r\n\r\n.chat-list {\r\n  list-style: none;\r\n  margin: 0;\r\n  padding: 8px;\r\n  min-height: 90px;\r\n}\r\n\r\n.chat-item {\r\n  background: rgba(17, 24, 39, 0.7);\r\n  border: 1px solid #334155;\r\n  border-radius: 8px;\r\n  padding: 8px;\r\n  margin-bottom: 8px;\r\n  cursor: grab;\r\n  user-select: none;\r\n  font-size: 13px;\r\n  line-height: 1.35;\r\n  word-break: break-word;\r\n}\r\n\r\n.chat-item.dragging {\r\n  opacity: 0.5;\r\n}\r\n\r\n.chat-list.drag-over,\r\n.chat-item.drag-over {\r\n  outline: 2px dashed var(--pq-manager-accent);\r\n  outline-offset: 2px;\r\n}\r\n\r\n.empty {\r\n  color: var(--pq-manager-muted);\r\n  font-size: 12px;\r\n  padding: 8px;\r\n  border: 1px dashed var(--pq-manager-border);\r\n  border-radius: 8px;\r\n  text-align: center;\r\n}\r\n\r\n.pq-manager-footer {\r\n  color: var(--pq-manager-muted);\r\n  font-size: 12px;\r\n  border-top: 1px solid var(--pq-manager-border);\r\n  padding-top: 12px;\r\n}';

  // AI Queue/core/chat-manager.js
  var GLOBAL_CHAT_KEY2 = '__global__';
  var MANAGER_PANEL_ID = 'pq-chat-manager-panel';
  var MANAGER_GRID_ID = 'pq-chat-manager-grid';
  var MANAGER_BODY_ID = 'pq-chat-manager-body';
  var activeManagers = /* @__PURE__ */ new Map();
  function toChatCode2(chatKey) {
    return chatKey === GLOBAL_CHAT_KEY2 ? null : chatKey;
  }
  function chatLabel(chatKey) {
    if (chatKey === GLOBAL_CHAT_KEY2) {
      return 'Global (all chats)';
    }
    return chatKey;
  }
  function cloneItem(item) {
    return { ...item };
  }
  function cloneItems(items) {
    return Array.isArray(items) ? items.map((item) => cloneItem(item)) : [];
  }
  function groupItems(chats) {
    const grouped = { [GLOBAL_CHAT_KEY2]: [] };
    Object.entries(chats || {}).forEach(([chatKey, bucket]) => {
      if (!grouped[chatKey]) {
        grouped[chatKey] = [];
      }
      grouped[chatKey].push(...cloneItems(bucket?.items));
    });
    return grouped;
  }
  function orderedKeys(groups) {
    const keys = Object.keys(groups).filter((key) => groups[key]?.length > 0);
    const nonGlobal = keys
      .filter((key) => key !== GLOBAL_CHAT_KEY2)
      .sort((a, b) => a.localeCompare(b));
    if (groups[GLOBAL_CHAT_KEY2]?.length > 0) {
      return [GLOBAL_CHAT_KEY2, ...nonGlobal];
    }
    return nonGlobal;
  }
  function flattenGroups(groups, existingChats = {}) {
    const nextChats = {};
    orderedKeys(groups).forEach((key) => {
      nextChats[key] = {
        items: cloneItems(groups[key]),
        failedItems: cloneItems(existingChats[key]?.failedItems),
      };
    });
    Object.entries(existingChats).forEach(([chatKey, bucket]) => {
      if (nextChats[chatKey]) return;
      if (Array.isArray(bucket?.failedItems) && bucket.failedItems.length > 0) {
        nextChats[chatKey] = {
          items: [],
          failedItems: cloneItems(bucket.failedItems),
        };
      }
    });
    return nextChats;
  }
  function findItemIndex(groups, chatKey, itemId) {
    const list = groups[chatKey] || [];
    return list.findIndex((item) => item.id === itemId);
  }
  function ensureManagerStyles(doc) {
    if (doc.querySelector('#pq-chat-manager-styles')) return;
    const style = doc.createElement('style');
    style.id = 'pq-chat-manager-styles';
    style.textContent = chat_manager_default;
    doc.head.appendChild(style);
  }
  function ensureManagerShell(doc, title, mountTarget) {
    ensureManagerStyles(doc);
    let panel = doc.getElementById(MANAGER_PANEL_ID);
    if (!panel) {
      panel = doc.createElement('section');
      panel.id = MANAGER_PANEL_ID;
      const shell = doc.createElement('div');
      shell.className = 'pq-manager-shell';
      const header = doc.createElement('div');
      header.className = 'pq-manager-header';
      const titleWrap = doc.createElement('div');
      const heading = doc.createElement('div');
      heading.className = 'pq-manager-title';
      const subtitle = doc.createElement('div');
      subtitle.className = 'pq-manager-subtitle';
      titleWrap.appendChild(heading);
      titleWrap.appendChild(subtitle);
      const actions = doc.createElement('div');
      actions.className = 'pq-manager-actions';
      const refreshButton = doc.createElement('button');
      refreshButton.type = 'button';
      refreshButton.id = 'pq-chat-manager-refresh';
      refreshButton.textContent = 'Refresh';
      const closeButton = doc.createElement('button');
      closeButton.type = 'button';
      closeButton.id = 'pq-chat-manager-close';
      closeButton.textContent = 'Close';
      actions.appendChild(refreshButton);
      actions.appendChild(closeButton);
      header.appendChild(titleWrap);
      header.appendChild(actions);
      const body = doc.createElement('div');
      body.className = 'pq-manager-body';
      body.id = MANAGER_BODY_ID;
      const grid = doc.createElement('div');
      grid.className = 'pq-manager-grid';
      grid.id = MANAGER_GRID_ID;
      const footer = doc.createElement('div');
      footer.className = 'pq-manager-footer';
      footer.textContent =
        'Drag prompts between chats. Changes are saved immediately to localStorage.';
      body.appendChild(grid);
      body.appendChild(footer);
      shell.appendChild(header);
      shell.appendChild(body);
      panel.appendChild(shell);
      closeButton.addEventListener('click', () => {
        panel.hidden = true;
        panel.style.display = 'none';
      });
    }
    const titleNode = panel.querySelector('.pq-manager-title');
    const subtitleNode = panel.querySelector('.pq-manager-subtitle');
    if (titleNode) {
      titleNode.textContent = title;
    }
    if (subtitleNode) {
      subtitleNode.textContent =
        'Reorder prompts within a chat or move them into another chat card. This panel stays inside the page instead of opening a popup.';
    }
    const root = mountTarget || doc.documentElement || doc.body;
    if (root && !root.contains(panel)) {
      root.appendChild(panel);
    }
    panel.hidden = false;
    panel.style.display = 'flex';
    return panel;
  }
  function moveByDrop(state, fromChatKey, itemId, toChatKey2, toIndex) {
    const fromList = state.groups[fromChatKey] || [];
    const fromIndex = findItemIndex(state.groups, fromChatKey, itemId);
    if (fromIndex === -1) {
      return false;
    }
    const [movedItem] = fromList.splice(fromIndex, 1);
    if (!state.groups[toChatKey2]) {
      state.groups[toChatKey2] = [];
    }
    const targetList = state.groups[toChatKey2];
    let normalizedIndex = Number.isInteger(toIndex) ? toIndex : targetList.length;
    if (normalizedIndex < 0) normalizedIndex = 0;
    if (normalizedIndex > targetList.length) normalizedIndex = targetList.length;
    if (fromChatKey === toChatKey2 && normalizedIndex > fromIndex) {
      normalizedIndex -= 1;
    }
    movedItem.chatCode = toChatCode2(toChatKey2) || void 0;
    targetList.splice(normalizedIndex, 0, movedItem);
    if (fromChatKey !== GLOBAL_CHAT_KEY2 && (state.groups[fromChatKey] || []).length === 0) {
      delete state.groups[fromChatKey];
    }
    return true;
  }
  function persistState(storageKey, state) {
    state.data.chats = flattenGroups(state.groups, state.data.chats);
    writeScopedQueueData(storageKey, state.data);
  }
  function renderCards(grid, storageKey, state, rerender) {
    if (!grid) return;
    grid.replaceChildren();
    const keys = orderedKeys(state.groups);
    if (keys.length === 0) {
      const doc2 = grid.ownerDocument;
      const empty = doc2.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No prompts found in storage.';
      grid.appendChild(empty);
      return;
    }
    const doc = grid.ownerDocument;
    keys.forEach((chatKey) => {
      const card = doc.createElement('section');
      card.className = 'chat-card';
      const title = doc.createElement('div');
      title.className = 'chat-title';
      const label = doc.createElement('span');
      label.textContent = chatLabel(chatKey);
      const count = doc.createElement('span');
      count.textContent = String(state.groups[chatKey].length);
      const controls = doc.createElement('span');
      controls.className = 'chat-controls';
      const deleteButton = doc.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'chat-delete';
      deleteButton.textContent = 'Delete';
      deleteButton.title = 'Delete all prompts in this chat';
      deleteButton.addEventListener('click', () => {
        const chatName = chatLabel(chatKey);
        if (
          !doc.defaultView?.confirm(`Delete all prompts in "${chatName}"? This cannot be undone.`)
        )
          return;
        if (state.groups[chatKey]) {
          delete state.groups[chatKey];
        }
        persistState(storageKey, state);
        rerender();
      });
      controls.appendChild(count);
      controls.appendChild(deleteButton);
      title.appendChild(label);
      title.appendChild(controls);
      const list = doc.createElement('ul');
      list.className = 'chat-list';
      list.dataset.chatKey = chatKey;
      const items = state.groups[chatKey];
      if (!items || items.length === 0) {
        const empty = doc.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Drop a prompt here.';
        list.appendChild(empty);
      } else {
        items.forEach((item, index) => {
          const entry = doc.createElement('li');
          entry.className = 'chat-item';
          entry.draggable = true;
          entry.dataset.chatKey = chatKey;
          entry.dataset.itemId = item.id;
          entry.dataset.index = String(index);
          entry.textContent = item.prompt;
          entry.addEventListener('dragstart', (event) => {
            state.drag = {
              itemId: item.id,
              fromChatKey: chatKey,
            };
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.id);
            entry.classList.add('dragging');
          });
          entry.addEventListener('dragend', () => {
            state.drag = null;
            entry.classList.remove('dragging');
            doc.querySelectorAll(`#${MANAGER_PANEL_ID} .drag-over`).forEach((element) => {
              element.classList.remove('drag-over');
            });
          });
          entry.addEventListener('dragover', (event) => {
            event.preventDefault();
            entry.classList.add('drag-over');
          });
          entry.addEventListener('dragleave', () => {
            entry.classList.remove('drag-over');
          });
          entry.addEventListener('drop', (event) => {
            event.preventDefault();
            entry.classList.remove('drag-over');
            if (!state.drag) return;
            const moved = moveByDrop(
              state,
              state.drag.fromChatKey,
              state.drag.itemId,
              chatKey,
              Number(entry.dataset.index)
            );
            if (!moved) return;
            persistState(storageKey, state);
            rerender();
          });
          list.appendChild(entry);
        });
      }
      list.addEventListener('dragover', (event) => {
        event.preventDefault();
        list.classList.add('drag-over');
      });
      list.addEventListener('dragleave', () => {
        list.classList.remove('drag-over');
      });
      list.addEventListener('drop', (event) => {
        event.preventDefault();
        list.classList.remove('drag-over');
        if (!state.drag) return;
        const moved = moveByDrop(
          state,
          state.drag.fromChatKey,
          state.drag.itemId,
          chatKey,
          state.groups[chatKey]?.length
        );
        if (!moved) return;
        persistState(storageKey, state);
        rerender();
      });
      card.appendChild(title);
      card.appendChild(list);
      grid.appendChild(card);
    });
  }
  function openChatManagerWindow(storageKey, title = 'Prompt Queue Chat Manager', mountTarget) {
    const data = readScopedQueueData(storageKey);
    const state = {
      data,
      groups: groupItems(data.chats),
      drag: null,
    };
    const doc = mountTarget?.ownerDocument || document;
    const panel = ensureManagerShell(doc, title, mountTarget);
    panel.dataset.storageKey = storageKey;
    const rerender = () => {
      const grid = panel.querySelector(`#${MANAGER_GRID_ID}`);
      renderCards(grid, storageKey, state, rerender);
    };
    rerender();
    const refreshButton = panel.querySelector('#pq-chat-manager-refresh');
    if (refreshButton) {
      refreshButton.onclick = () => {
        const refreshedData = readScopedQueueData(storageKey);
        state.data = refreshedData;
        state.groups = groupItems(refreshedData.chats);
        state.drag = null;
        rerender();
      };
    }
    panel.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: 'smooth' });
    log('chat manager opened in-page', { storageKey });
    activeManagers.set(storageKey, {
      panel,
      state,
      title,
      rerender,
    });
  }
  function refreshChatManager(storageKey) {
    const manager = activeManagers.get(storageKey);
    if (!manager || !manager.panel || manager.panel.hidden) return false;
    const refreshedData = readScopedQueueData(storageKey);
    manager.state.data = refreshedData;
    manager.state.groups = groupItems(refreshedData.chats);
    manager.state.drag = null;
    const grid = manager.panel.querySelector(`#${MANAGER_GRID_ID}`);
    renderCards(grid, storageKey, manager.state, manager.rerender);
    return true;
  }

  // AI Queue/core/bootstrap.js
  function bootstrapQueueApp(provider) {
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

  // AI Queue/styles/selection-menu.css
  var selection_menu_default =
    '#pq-selection-menu {\r\n  position: fixed;\r\n  z-index: 2147483647;\r\n  display: none;\r\n  min-width: 180px;\r\n  padding: 6px;\r\n  border: 1px solid #444;\r\n  border-radius: 12px;\r\n  background: #202123;\r\n  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);\r\n}\r\n\r\n#pq-selection-menu button {\r\n  appearance: none;\r\n  display: block;\r\n  width: 100%;\r\n  padding: 8px 12px;\r\n  border: 1px solid #555;\r\n  border-radius: 10px;\r\n  background: #2a2a2a;\r\n  color: #fff;\r\n  cursor: pointer;\r\n  font: inherit;\r\n  text-align: left;\r\n}\r\n\r\n#pq-selection-menu button:hover {\r\n  background: #343434;\r\n}';

  // AI Queue/core/selection-menu.js
  var SELECTION_MENU_ID = 'pq-selection-menu';
  var installed = false;
  function getSelectedPageText() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) return '';
    return selection.toString().trim();
  }
  function hideSelectionMenu() {
    const menu = document.querySelector(`#${SELECTION_MENU_ID}`);
    if (!menu) return;
    menu.hidden = true;
    menu.style.display = 'none';
  }
  function ensureSelectionMenu(onAddSelection) {
    let menu = document.querySelector(`#${SELECTION_MENU_ID}`);
    if (menu) return menu;
    if (!document.querySelector('#pq-selection-menu-styles')) {
      const style = document.createElement('style');
      style.id = 'pq-selection-menu-styles';
      style.textContent = selection_menu_default;
      document.head.appendChild(style);
    }
    menu = document.createElement('div');
    menu.id = SELECTION_MENU_ID;
    menu.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Add to Prompt Queue';
    button.addEventListener('click', () => {
      const prompt = menu.dataset.prompt || '';
      if (prompt) {
        onAddSelection(prompt);
      }
      hideSelectionMenu();
    });
    menu.appendChild(button);
    document.body.appendChild(menu);
    return menu;
  }
  function showSelectionMenu(selectionText, x, y, onAddSelection) {
    const menu = ensureSelectionMenu(onAddSelection);
    menu.dataset.prompt = selectionText;
    const margin = 12;
    const left = Math.min(x + margin, window.innerWidth - 200);
    const top = Math.min(y + margin, window.innerHeight - 64);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.hidden = false;
    menu.style.display = 'block';
  }
  function addSelectionToQueue(createItem, renderQueue, saveQueue2, updateToolbarButton2) {
    return (selectionText) => {
      const prompt = selectionText.trim();
      if (!prompt) return;
      queueState.queue.push(createItem(prompt));
      updateToolbarButton2(
        document.querySelector('#pq-toolbar-button'),
        queueState.queue,
        queueState.running
      );
      renderQueue?.();
      saveQueue2();
    };
  }
  function installSelectionPromptMenu({
    createItem,
    renderQueue,
    saveQueue: saveQueue2,
    updateToolbarButton: updateToolbarButton2,
  }) {
    if (installed) return;
    installed = true;
    const onAddSelection = addSelectionToQueue(
      createItem,
      renderQueue,
      saveQueue2,
      updateToolbarButton2
    );
    document.addEventListener(
      'contextmenu',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('#pq-panel') || target.closest(`#${SELECTION_MENU_ID}`)) {
          hideSelectionMenu();
          return;
        }
        const selectionText = getSelectedPageText();
        if (!selectionText) {
          hideSelectionMenu();
          return;
        }
        event.preventDefault();
        showSelectionMenu(selectionText, event.clientX, event.clientY, onAddSelection);
      },
      true
    );
    document.addEventListener('click', (event) => {
      const menu = document.querySelector(`#${SELECTION_MENU_ID}`);
      if (!menu) return;
      if (menu.contains(event.target)) return;
      hideSelectionMenu();
    });
    window.addEventListener('blur', hideSelectionMenu);
    window.addEventListener('scroll', hideSelectionMenu, true);
    window.addEventListener('resize', hideSelectionMenu);
  }

  // AI Queue/providers/gemini.js
  var STORAGE_KEY = 'pq-gemini-queue';
  var DOMAINS = ['gemini.google.com'];
  function normalizeCode(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  function getCurrentGeminiChatCode(url = globalThis.location?.href || '') {
    try {
      const parsedUrl = new URL(url, globalThis.location?.origin || 'https://example.com');
      if (!DOMAINS.includes(parsedUrl.hostname.toLowerCase())) {
        return null;
      }
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      if (segments[0] !== 'app') return null;
      return normalizeCode(segments[1]);
    } catch {
      return null;
    }
  }
  function queryPanel() {
    return document.querySelector('#pq-panel');
  }
  function queryInput() {
    return queryPanel()?.querySelector('#pq-input');
  }
  function queryAddButton() {
    return queryPanel()?.querySelector('#pq-add');
  }
  function createGeminiPanel() {
    return createBasePanel('Gemini Prompt Queue', true);
  }
  function renderGeminiQueue() {
    const panel = queryPanel();
    if (!panel) return;
    const list = panel.querySelector('#pq-list');
    const failedList = panel.querySelector('#pq-failed-list');
    const failedTitle = panel.querySelector('#pq-failed-title');
    if (!list) return;
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    queueState.queue.forEach((item) => {
      const { li, text, editBtn, deleteBtn } = createQueueItemElement(item, {
        renderQueue: renderGeminiQueue,
        saveQueue: saveGeminiQueue,
      });
      if (queueState.editingId == item.id) {
        li.querySelector('div').style.backgroundColor = '#333';
        li.querySelector('div').style.padding = '4px';
        li.querySelector('div').style.borderRadius = '4px';
      }
      text.addEventListener('dblclick', () => {
        editQueueItem(item.id, queueState.queue, (id, prompt) => {
          queueState.editingId = id;
          const input = queryInput();
          const addButton = queryAddButton();
          if (input && addButton) {
            input.value = prompt;
            addButton.textContent = 'Save Changes';
            input.focus();
            input.selectionStart = input.selectionEnd = input.value.length;
          }
          editBtn.style.display = 'inline-block';
          deleteBtn.style.display = 'inline-block';
        });
      });
      editBtn.addEventListener('click', () => {
        editQueueItem(item.id, queueState.queue, (id, prompt) => {
          queueState.editingId = id;
          const input = queryInput();
          const addButton = queryAddButton();
          if (input && addButton) {
            input.value = prompt;
            addButton.textContent = 'Save Changes';
            input.focus();
            input.selectionStart = input.selectionEnd = input.value.length;
          }
        });
      });
      deleteBtn.addEventListener('click', () => {
        deleteQueueItem(item.id, queueState.queue, renderGeminiQueue, saveGeminiQueue);
      });
      list.appendChild(li);
    });
    if (failedList && failedTitle) {
      while (failedList.firstChild) {
        failedList.removeChild(failedList.firstChild);
      }
      failedTitle.style.display = queueState.failedQueue.length > 0 ? 'block' : 'none';
      queueState.failedQueue.forEach((item) => {
        const li = document.createElement('li');
        li.style.marginBottom = '8px';
        li.style.color = '#ff9999';
        li.style.fontSize = '13px';
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '6px';
        row.style.alignItems = 'flex-start';
        const text = document.createElement('div');
        text.textContent = item.prompt;
        text.style.flex = '1';
        text.style.wordBreak = 'break-word';
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '\u{1F504}';
        retryBtn.title = 'Retry';
        retryBtn.style.cursor = 'pointer';
        retryBtn.style.color = '#7dd3fc';
        retryBtn.style.fontSize = '12px';
        retryBtn.addEventListener('click', () => {
          const index = queueState.failedQueue.findIndex((i) => i.id === item.id);
          if (index !== -1) {
            const [retryItem] = queueState.failedQueue.splice(index, 1);
            retryItem.attempts = 0;
            retryItem.status = 'queued';
            queueState.queue.push(retryItem);
            renderGeminiQueue();
            saveGeminiQueue();
          }
        });
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '\u2715';
        deleteBtn.title = 'Delete';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.color = '#ff6b6b';
        deleteBtn.style.fontSize = '12px';
        deleteBtn.addEventListener('click', () => {
          deleteQueueItem(item.id, queueState.failedQueue, renderGeminiQueue, saveGeminiQueue);
        });
        row.appendChild(text);
        row.appendChild(retryBtn);
        row.appendChild(deleteBtn);
        li.appendChild(row);
        failedList.appendChild(li);
      });
    }
    updateToolbarButton(
      document.querySelector('#pq-toolbar-button'),
      queueState.queue,
      queueState.running
    );
    log('queue rendered safely');
  }
  function saveGeminiQueue() {
    saveQueue(queueState.queue, queueState.failedQueue, STORAGE_KEY, getCurrentGeminiChatCode());
  }
  function loadGeminiQueue() {
    loadQueue(queueState.queue, queueState.failedQueue, STORAGE_KEY, getCurrentGeminiChatCode());
  }
  function openGeminiChatManager() {
    openChatManagerWindow(STORAGE_KEY, 'Gemini Chat Prompt Manager');
  }
  async function processGeminiQueue() {
    const panel = queryPanel();
    if (!panel) return;
    setStatus(panel, 'Running');
    while (queueState.queue.length > 0 && queueState.running) {
      await waitForIdle();
      const item = queueState.queue.shift();
      if (!item || typeof item.prompt !== 'string') {
        error('Skipping invalid queue item:', item);
        continue;
      }
      const prompt = item.prompt;
      updateToolbarButton(
        document.querySelector('#pq-toolbar-button'),
        queueState.queue,
        queueState.running
      );
      renderGeminiQueue();
      setStatus(panel, `Sending: ${prompt.slice(0, 40)}...`);
      try {
        await sendPrompt(prompt);
        await waitForPromptProcessing();
        item.attempts = 0;
      } catch (err) {
        error('Failed to send prompt:', err.message);
        item.status = 'failed';
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts < 3) {
          item.status = 'queued';
          queueState.queue.push(item);
        } else {
          queueState.failedQueue.push(item);
        }
      }
      saveGeminiQueue();
    }
    setStatus(panel, queueState.running ? 'Finished' : 'Stopped');
    queueState.running = false;
    updateToolbarButton(
      document.querySelector('#pq-toolbar-button'),
      queueState.queue,
      queueState.running
    );
  }
  function ensureGeminiToolbarButton() {
    ensureToolbarStyles();
    installSelectionPromptMenu({
      createItem: geminiProvider.createItem,
      renderQueue: renderGeminiQueue,
      saveQueue: saveGeminiQueue,
      updateToolbarButton,
    });
    let button = document.querySelector('#pq-toolbar-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'pq-toolbar-button';
      button.classList.add('pq-toolbar');
      button.type = 'button';
      button.textContent = 'Queue';
      button.addEventListener('click', () => showPanel(() => createGeminiPanel()));
    }
    button.className = 'pq-toolbar';
    Object.assign(button.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      padding: '10px 14px',
      borderRadius: '9999px',
      background: '#1f1f1f',
      color: '#fff',
      border: '1px solid #555',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      zIndex: '2147483647',
      cursor: 'pointer',
    });
    if (button.parentElement !== document.body) {
      document.body.appendChild(button);
    }
  }
  var geminiProvider = {
    storageKey: STORAGE_KEY,
    includeFailedQueue: true,
    createItem(text) {
      const chatCode = getCurrentGeminiChatCode();
      return {
        id: crypto.randomUUID(),
        prompt: text,
        attempts: 0,
        status: 'queued',
        createdAt: Date.now(),
        ...(chatCode ? { chatCode } : {}),
      };
    },
    createPanel: createGeminiPanel,
    renderQueue: renderGeminiQueue,
    saveQueue: saveGeminiQueue,
    loadQueue: loadGeminiQueue,
    processQueue: processGeminiQueue,
    setupPanelControls,
    setupPanelDrag,
    ensureToolbarButton: ensureGeminiToolbarButton,
    openChatManager: openGeminiChatManager,
    isOwnMutation(target) {
      return !!target && (target.closest?.('#pq-panel') || target.closest?.('.pq-toolbar'));
    },
  };
  bootstrapQueueApp(geminiProvider);
})();
//# sourceMappingURL=gemini.user.js.map
