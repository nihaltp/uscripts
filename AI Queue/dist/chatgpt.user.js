// ==UserScript==
// @name         ChatGPT Prompt Queue
// @description  A userscript to manage a queue of prompts for ChatGPT.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20ChatGPT%20Prompt%20Queue%20dist%2Fchatgpt.user.js&body=File%3A%20AI%20Queue%2Fdist%2Fchatgpt.user.js%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://chatgpt.com/favicon.ico
// @version      3.0.2
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/chatgpt.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/dist/chatgpt.user.js
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
  function isDebugEnabled() {
    return Boolean(globalThis.aiQueueDebug);
  }
  function log(...args) {
    if (!isDebugEnabled()) return;
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
    style.textContent = `
    @keyframes pq-pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.06); opacity: 0.75; }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
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
  function startUrlWatcher(createPanel, setupPanelEvents, setupPanelDrag2, ensureToolbarButton) {
    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
    window.addEventListener('popstate', () =>
      requestRepair('popstate', createPanel, setupPanelEvents, setupPanelDrag2, ensureToolbarButton)
    );
    window.addEventListener('hashchange', () =>
      requestRepair(
        'hashchange',
        createPanel,
        setupPanelEvents,
        setupPanelDrag2,
        ensureToolbarButton
      )
    );
    if (urlWatcher) clearInterval(urlWatcher);
    urlWatcher = setInterval(() => {
      if (location.href !== lastKnownUrl) {
        lastKnownUrl = location.href;
        requestRepair(
          'url-change',
          createPanel,
          setupPanelEvents,
          setupPanelDrag2,
          ensureToolbarButton
        );
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
      title.style.fontSize = '18px';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '10px';
      title.textContent = titleText;
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
      error('Item to delete not found in queue:', id);
      return;
    }
    queue.splice(index, 1);
    renderQueue();
    saveQueue2?.();
  }
  function editQueueItem(id, queue, updateUI) {
    const item = queue.find((item2) => item2.id === id);
    if (!item) {
      error('Item to edit not found in queue:', id);
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
      } catch (error2) {
        log('Drag start dataTransfer error:', error2);
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
      } catch (error2) {
        log('Drag over dataTransfer error:', error2);
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
  function saveQueue(queue, failedQueue, storageKey = 'pq-queue-state') {
    try {
      const data = {
        queue,
        failedQueue,
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
      log('queue saved to storage');
    } catch (err) {
      error('Failed to save queue:', err);
    }
  }
  function loadQueue(queue, failedQueue, storageKey = 'pq-queue-state') {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (Array.isArray(data.queue)) {
          queue.push(...data.queue.filter((item) => item && typeof item.prompt === 'string'));
        }
        if (Array.isArray(data.failedQueue) && failedQueue) {
          failedQueue.push(
            ...data.failedQueue.filter((item) => item && typeof item.prompt === 'string')
          );
        }
        log('queue loaded from storage', queue.length, 'items');
      }
    } catch (err) {
      error('Failed to load queue:', err);
    }
  }

  // AI Queue/core/panel-controls.js
  var boundPanels = /* @__PURE__ */ new WeakSet();
  function setupPanelControls({ createItem, renderQueue, saveQueue: saveQueue2, processQueue }) {
    const panel = getPanel();
    if (!panel) return;
    if (boundPanels.has(panel)) return;
    const input = panel.querySelector('#pq-input');
    const addBtn = panel.querySelector('#pq-add');
    const startBtn = panel.querySelector('#pq-start');
    const getToolbarButton = () => document.querySelector('#pq-toolbar-button');
    const handleAddClick = () => {
      const text = input.value.trim();
      if (!text) {
        error('Empty prompt, not adding to queue');
        return;
      }
      if (queueState.editingId !== null) {
        const item = queueState.queue.find((item2) => item2.id === queueState.editingId);
        if (!item) {
          error('Editing item not found in queue:', queueState.editingId);
          return;
        }
        item.prompt = text;
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
          log('waitForCondition check error:', err);
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed > timeoutMs) {
          reject(new Error(`Timeout waiting for ${description} (${elapsed}ms)`));
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
      log('send button unavailable, falling back to Enter', err.message);
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

  // AI Queue/core/bootstrap.js
  function bootstrapQueueApp(provider) {
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

  // AI Queue/providers/chatgpt.js
  function queryPanel() {
    return document.querySelector('#pq-panel');
  }
  function queryInput() {
    return queryPanel()?.querySelector('#pq-input');
  }
  function queryAddButton() {
    return queryPanel()?.querySelector('#pq-add');
  }
  function createChatGPTPanel() {
    return createBasePanel('ChatGPT Prompt Queue', false);
  }
  function renderChatGPTQueue() {
    const panel = queryPanel();
    if (!panel) return;
    const list = panel.querySelector('#pq-list');
    if (!list) return;
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    queueState.queue.forEach((item) => {
      const { li, text, editBtn, deleteBtn } = createQueueItemElement(item, {
        renderQueue: renderChatGPTQueue,
        saveQueue: saveChatGPTQueue,
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
        deleteQueueItem(item.id, queueState.queue, renderChatGPTQueue, saveChatGPTQueue);
      });
      list.appendChild(li);
    });
    updateToolbarButton(
      document.querySelector('#pq-toolbar-button'),
      queueState.queue,
      queueState.running
    );
  }
  function saveChatGPTQueue() {
    saveQueue(queueState.queue, null, 'pq-chatgpt-queue');
  }
  function loadChatGPTQueue() {
    loadQueue(queueState.queue, null, 'pq-chatgpt-queue');
  }
  async function processChatGPTQueue() {
    const panel = queryPanel();
    if (!panel) return;
    setStatus(panel, 'Running');
    while (queueState.queue.length > 0 && queueState.running) {
      await waitForIdle();
      const item = queueState.queue.shift();
      const prompt = item.prompt;
      updateToolbarButton(
        document.querySelector('#pq-toolbar-button'),
        queueState.queue,
        queueState.running
      );
      renderChatGPTQueue();
      setStatus(panel, `Sending: ${prompt.slice(0, 40)}...`);
      try {
        await sendPrompt(prompt);
        await waitForPromptProcessing();
      } catch (err) {
        error('Failed to send prompt:', err.message);
      }
      saveChatGPTQueue();
    }
    setStatus(panel, queueState.running ? 'Finished' : 'Stopped');
    queueState.running = false;
    updateToolbarButton(
      document.querySelector('#pq-toolbar-button'),
      queueState.queue,
      queueState.running
    );
  }
  function ensureChatGPTToolbarButton() {
    ensureToolbarStyles();
    let button = document.querySelector('#pq-toolbar-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'pq-toolbar-button';
      button.type = 'button';
      button.textContent = 'Queue';
      button.addEventListener('click', () => showPanel(() => createChatGPTPanel()));
    }
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
  var chatgptProvider = {
    includeFailedQueue: false,
    createItem(text) {
      return {
        id: crypto.randomUUID(),
        prompt: text,
      };
    },
    createPanel: createChatGPTPanel,
    renderQueue: renderChatGPTQueue,
    saveQueue: saveChatGPTQueue,
    loadQueue: loadChatGPTQueue,
    processQueue: processChatGPTQueue,
    setupPanelControls,
    setupPanelDrag,
    ensureToolbarButton: ensureChatGPTToolbarButton,
    isOwnMutation(target) {
      return !!target && (target.closest?.('#pq-panel') || target.closest?.('.pq-toolbar'));
    },
  };
  bootstrapQueueApp(chatgptProvider);
})();
//# sourceMappingURL=chatgpt.user.js.map
