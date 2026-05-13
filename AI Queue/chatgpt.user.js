// ==UserScript==
// @name         ChatGPT Prompt Queue
// @description  Queue multiple prompts for ChatGPT
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20AI%20Queue%2Fchatgpt.user.js&body=File%3A%20AI%20Queue%2Fchatgpt.user.js%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://chatgpt.com/favicon.ico
// @version      1.0.1
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/chatgpt.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/chatgpt.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const queue = [];
  let running = false;
  let editingId = null;
  let draggedId = null;
  window.aiQueueDebug = false; // set to true to enable debug logs

  let panel;
  let panelInitialized = false;
  let isPanelVisible = false;
  let toolbarButton = null;
  let repairTimer = null;
  let lastRepairAt = 0;
  let repairing = false;
  let mutationObserver = null;
  let urlWatcher = null;
  let lastKnownUrl = location.href;
  let lastGenerationLabel = '';

  function log(...args) {
    if (!window.aiQueueDebug) return;
    console.log('[AI QUEUE]', ...args);
  }

  function error(...args) {
    console.error('[AI QUEUE]', ...args);
  }

  function throwError(...args) {
    error(...args);
    throw new Error(args.join(' '));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function isActionButtonElement(element) {
    return !!element && element instanceof HTMLElement && element.matches('button, [role="button"], input[type="button"], input[type="submit"]');
  }

  function isOwnMutation(target) {
    return !!target && (
      target.closest?.('#pq-panel') ||
      target.closest?.('#pq-toolbar-button') ||
      target.id === 'pq-panel' ||
      target.id === 'pq-toolbar-button'
    );
  }

  function waitForCondition(predicate, { timeoutMs = 10000, intervalMs = 100, description = 'condition' } = {}) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const result = await predicate();
          if (result) {
            resolve(result);
            return;
          }
        } catch (err) {
          log('waitForCondition predicate failed', description, err);
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${description}`));
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

    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function createPanel() {
    if (panel && isAttached(panel)) {
      return;
    }

    if (panel && !isAttached(panel)) {
      if (document.body) {
        document.body.appendChild(panel);
      }
      return;
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'pq-panel';

      Object.assign(panel.style, {
        position: 'fixed',
        top: '100px',
        left: '100px',
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
      });

      const title = document.createElement('div');
      title.style.fontSize = '18px';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '10px';
      title.textContent = 'Prompt Queue';

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

      if (document.body) {
        document.body.appendChild(panel);
      }

      setupPanelEvents();
      panelInitialized = true;
    }
  }

  function setupPanelEvents() {
    const input = panel.querySelector('#pq-input');
    const addBtn = panel.querySelector('#pq-add');
    const startBtn = panel.querySelector('#pq-start');

    window.pqInput = input;
    window.pqAddBtn = addBtn;

    addBtn.addEventListener('click', () => {
      const text = input.value.trim();

      if (!text) {
        error('Empty prompt, not adding to queue');
        return;
      }

      if (editingId !== null) {
        const item = queue.find(item => item.id === editingId);

        if (!item) {
          error('Editing item not found in queue:', editingId);
          return;
        }

        item.prompt = text;
        editingId = null;
        addBtn.textContent = 'Add To Queue';
      } else {
        queue.push({
          id: crypto.randomUUID(),
          prompt: text,
        });
      }

      updateToolbarButton();
      input.value = '';
      renderQueue();
    });

    startBtn.addEventListener('click', async () => {
      if (running) return;

      running = true;
      updateToolbarButton();
      processQueue();
    });
  }

  function renderQueue() {
    if (!panel) return;

    const list = panel.querySelector('#pq-list');
    if (!list) return;

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    queue.forEach((item) => {
      const li = document.createElement('li');

      li.style.marginBottom = '10px';
      li.draggable = true;

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      row.style.alignItems = 'flex-start';

      if (editingId == item.id) {
        row.style.background = '#333';
        row.style.padding = '6px';
        row.style.borderRadius = '6px';
        row.style.outline = '1px solid #7dd3fc';
      }

      const text = document.createElement('div');
      text.textContent = item.prompt;
      text.style.flex = '1';
      text.style.wordBreak = 'break-word';
      text.style.fontSize = '14px';

      text.addEventListener('dblclick', () => {
        editQueueItem(item.id);
      });

      const editBtn = document.createElement('button');
      editBtn.textContent = '🖉';
      editBtn.title = 'Edit';
      editBtn.style.cursor = 'pointer';
      editBtn.style.color = '#7dd3fc';
      editBtn.addEventListener('click', () => {
        editQueueItem(item.id);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Delete';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.color = '#ff6b6b';
      deleteBtn.addEventListener('click', () => {
        const preview = item.prompt.length > 80 ? item.prompt.slice(0, 80) + '...' : item.prompt;
        const confirmed = confirm(`Delete this prompt?\n\n${preview}`);

        if (!confirmed) {
          error('Deletion cancelled for item:', item.id);
          return;
        }

        deleteQueueItem(item.id);
      });

      row.appendChild(text);
      row.appendChild(editBtn);
      row.appendChild(deleteBtn);
      li.appendChild(row);

      li.addEventListener('dragstart', () => {
        draggedId = item.id;
        li.style.opacity = '0.5';
      });

      li.addEventListener('dragend', () => {
        draggedId = null;
        li.style.opacity = '1';
      });

      li.addEventListener('dragover', e => {
        e.preventDefault();
        li.style.borderTop = '2px solid #888';
      });

      li.addEventListener('dragleave', () => {
        li.style.borderTop = '';
      });

      li.addEventListener('drop', e => {
        e.preventDefault();
        li.style.borderTop = '';

        if (draggedId === item.id) {
          error('Dropped on itself, ignoring:', item.id);
          return;
        }

        moveQueueItem(draggedId, item.id);
      });

      list.appendChild(li);
    });

    updateToolbarButton();
  }

  function deleteQueueItem(id) {
    const index = queue.findIndex(item => item.id === id);

    if (index === -1) {
      error('Item to delete not found in queue:', id);
      return;
    }

    queue.splice(index, 1);
    renderQueue();
  }

  function editQueueItem(id) {
    const item = queue.find(item => item.id === id);

    if (!item) {
      error('Item to edit not found in queue:', id);
      return;
    }

    editingId = id;
    window.pqInput.value = item.prompt;
    window.pqAddBtn.textContent = 'Save Changes';
    window.pqInput.focus();
    window.pqInput.selectionStart = window.pqInput.selectionEnd = window.pqInput.value.length;
  }

  function moveQueueItem(fromId, toId) {
    const fromIndex = queue.findIndex(item => item.id === fromId);
    const toIndex = queue.findIndex(item => item.id === toId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const [movedItem] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, movedItem);
    renderQueue();
  }

  function setStatus(text) {
    if (!panel) return;

    const status = panel.querySelector('#pq-status');

    if (status) {
      status.textContent = text;
    }
  }

  function togglePanel() {
    createPanel();

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

    log('Panel element:', panel);
    log('Panel visible:', isPanelVisible);
  }

  function ensureToolbarStyles() {
    if (document.querySelector('#pq-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'pq-styles';
    style.textContent = `
      @keyframes pq-pulse {
        0% {
          transform: scale(1);
          opacity: 1;
        }

        50% {
          transform: scale(1.06);
          opacity: 0.75;
        }

        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createToolbarButton() {
    ensureToolbarStyles();

    if (toolbarButton && isAttached(toolbarButton)) {
      return;
    }

    if (!toolbarButton) {
      toolbarButton = document.createElement('button');
      toolbarButton.id = 'pq-toolbar-button';
      toolbarButton.type = 'button';
      toolbarButton.textContent = 'Queue';
      toolbarButton.className = 'composer-btn h-9 min-h-9';
      toolbarButton.style.padding = '0 12px';
      toolbarButton.style.borderRadius = '9999px';
      toolbarButton.addEventListener('click', togglePanel);
    }

    const trailing = [...document.querySelectorAll('div')].find(el =>
      el.classList.contains('ms-auto') &&
      el.classList.contains('flex') &&
      el.classList.contains('items-center')
    );

    if (trailing) {
      if (toolbarButton.parentElement !== trailing) {
        trailing.prepend(toolbarButton);
      }
      return;
    }

    toolbarButton.className = '';
    Object.assign(toolbarButton.style, {
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

    if (toolbarButton.parentElement !== document.body && document.body) {
      document.body.appendChild(toolbarButton);
    }
  }

  function updateToolbarButton() {
    if (!toolbarButton || !isAttached(toolbarButton)) {
      createToolbarButton();
    }

    if (!toolbarButton) {
      error('Toolbar button not found, cannot update');
      return;
    }

    const count = queue.length;
    toolbarButton.textContent = count > 0 ? `Queue (${count})` : 'Queue';
    toolbarButton.style.animation = running ? 'pq-pulse 1.2s infinite' : '';
    toolbarButton.style.opacity = running ? '1' : (count > 0 ? '1' : '0.8');
  }

  function repairUi(reason = 'repair') {
    if (repairing) {
      return;
    }

    repairing = true;

    try {
      createPanel();
      createToolbarButton();
      updateToolbarButton();
      renderQueue();
      log('ui repaired', reason);
    } finally {
      repairing = false;
    }
  }

  function requestRepair(reason = 'repair') {
    const now = Date.now();
    const delay = Math.max(0, 2000 - (now - lastRepairAt));

    if (repairTimer) {
      return;
    }

    repairTimer = setTimeout(() => {
      repairTimer = null;
      lastRepairAt = Date.now();
      repairUi(reason);
    }, delay);
  }

  function startDomObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    const target = document.body || document.documentElement;

    if (!target) {
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      mutations = mutations || [];

      if (mutations.length > 0 && mutations.every(mutation => isOwnMutation(mutation.target))) {
        return;
      }

      const toolbarMissing = !toolbarButton || !isAttached(toolbarButton);
      const panelMissing = !panel || !isAttached(panel);

      if (!toolbarMissing && !panelMissing) {
        return;
      }

      requestRepair(toolbarMissing ? 'toolbar-missing' : 'panel-detached');
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

    if (typeof original !== 'function' || original.__pqPatched) {
      return;
    }

    const patched = function (...args) {
      const result = original.apply(this, args);
      Promise.resolve().then(() => requestRepair('history-navigation'));
      return result;
    };

    patched.__pqPatched = true;
    history[methodName] = patched;
  }

  function startUrlWatcher() {
    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');

    window.addEventListener('popstate', () => requestRepair('popstate'));
    window.addEventListener('hashchange', () => requestRepair('hashchange'));

    if (urlWatcher) {
      clearInterval(urlWatcher);
    }

    urlWatcher = setInterval(() => {
      if (location.href !== lastKnownUrl) {
        lastKnownUrl = location.href;
        log('url changed', lastKnownUrl);
        requestRepair('url-change');
      }
    }, 1000);
  }

  function getEditorText(editor) {
    if (!editor) return '';

    if ('value' in editor) {
      return String(editor.value || '');
    }

    return String(editor.textContent || '');
  }

  function isEditableCandidate(element) {
    if (!element) return false;
    if (!(element instanceof HTMLElement)) return false;
    if (!isAttached(element)) return false;
    if (!isVisible(element)) return false;

    const isTextarea = element instanceof HTMLTextAreaElement;
    const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';

    if (!isTextarea && !isContentEditable) {
      return false;
    }

    if (element.matches('button, [role="button"], input[type="button"], input[type="submit"]')) {
      return false;
    }

    if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
      return false;
    }

    if (element.closest('#pq-panel')) {
      return false;
    }

    return true;
  }

  function scoreEditor(editor) {
    const rect = editor.getBoundingClientRect();
    let score = rect.top;

    if (editor === document.activeElement) score += 1000;
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
      log('editor candidate', activeElement.tagName, activeElement);
      if (isActionButtonElement(activeElement)) {
        return null;
      }
      log('editor found', activeElement);
      return activeElement;
    }

    const candidates = [...document.querySelectorAll('textarea:not(#pq-input), [contenteditable="true"][role="textbox"], [contenteditable="true"]')]
      .filter(isEditableCandidate)
      .sort((left, right) => scoreEditor(right) - scoreEditor(left));

    const editor = candidates[0] || null;

    if (editor) {
      log('editor found', editor);
    }

    return editor;
  }

  function getComposerHost(editor = getComposerEditor()) {
    if (!editor) {
      return null;
    }

    if (isActionButtonElement(editor) || editor === toolbarButton) {
      return null;
    }

    const host =
      editor.closest('form, [role="form"], [aria-label*="prompt" i], [aria-label*="composer" i], [aria-label*="message" i], [data-testid*="prompt" i], [data-testid*="composer" i]') ||
      editor.parentElement ||
      null;

    if (
      !host ||
      host === editor ||
      host === toolbarButton ||
      toolbarButton?.contains(host) ||
      editor.contains(host) ||
      host.contains?.(editor)
    ) {
      return null;
    }

    if (
      host.isContentEditable ||
      host.matches?.('[contenteditable="true"], textarea, input, button, [role="button"], input[type="button"], input[type="submit"]')
    ) {
      return null;
    }

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
      '[role="button"][title*="Send" i]'
    ];

    const candidates = [];

    for (const selector of selectors) {
      candidates.push(...document.querySelectorAll(selector));
    }

    if (host) {
      candidates.push(...host.querySelectorAll('button, [role="button"]'));
    }

    const button = candidates.find(candidate => {
      if (!candidate || !(candidate instanceof HTMLElement)) return false;
      if (!isActionButtonVisible(candidate)) return false;

      const label = getButtonLabel(candidate);
      const exactSend = candidate.matches('[data-testid="send-button"]');
      const looksLikeSend = /\bsend\b/i.test(label) || /\bsubmit\b/i.test(label);

      if (!exactSend && !looksLikeSend) return false;
      if (!includeDisabled && candidate.disabled) return false;

      return true;
    }) || null;

    if (button) {
      log('send button found', button);
    }

    return button;
  }

  function findStopButton() {
    const selectors = [
      'button[data-testid="stop-button"]',
      '[role="button"][data-testid="stop-button"]',
      'button[aria-label*="Stop" i]',
      'button[title*="Stop" i]',
      '[role="button"][aria-label*="Stop" i]',
      '[role="button"][title*="Stop" i]'
    ];

    for (const selector of selectors) {
      const button = [...document.querySelectorAll(selector)].find(isActionButtonVisible) || null;

      if (button) {
        return button;
      }
    }

    return null;
  }

  function hasBusyIndicators() {
    return [...document.querySelectorAll('[aria-busy="true"], [data-loading="true"], [role="progressbar"]')]
      .some(isActionButtonVisible);
  }

  function getGenerationState() {
    const editor = getComposerEditor();
    const sendButton = getSendButton({ includeDisabled: true });
    const stopButton = findStopButton();
    const hasPrompt = !!getEditorText(editor).trim();
    const busyIndicators = hasBusyIndicators();
    const generating = Boolean(stopButton || busyIndicators || (sendButton && sendButton.disabled && hasPrompt));

    const label = JSON.stringify({ generating, hasPrompt, busyIndicators, sendDisabled: !!(sendButton && sendButton.disabled), stopButton: !!stopButton });

    if (label !== lastGenerationLabel) {
      lastGenerationLabel = label;
      log('generation state', { generating, hasPrompt, busyIndicators, sendDisabled: !!(sendButton && sendButton.disabled), stopButton: !!stopButton });
    }

    return { generating, editor, sendButton, stopButton, busyIndicators, hasPrompt };
  }

  function isGenerating() {
    return getGenerationState().generating;
  }

  async function waitForIdle({ timeoutMs = 60000, intervalMs = 200 } = {}) {
    try {
      await waitForCondition(async () => {
        const initialState = getGenerationState();

        if (initialState.generating) {
          return false;
        }

        await sleep(intervalMs);

        return !getGenerationState().generating;
      }, {
        timeoutMs,
        intervalMs,
        description: 'ChatGPT to become idle',
      });

      await sleep(300);
    } catch (err) {
      log('waitForIdle timed out:', err.message);
      await sleep(300);
    }
  }

  function getTextSetter(editor) {
    if (editor instanceof HTMLTextAreaElement) {
      return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    }

    if (editor instanceof HTMLInputElement) {
      return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    }

    return null;
  }

  function setEditorValue(editor, prompt) {
    if (!editor) {
      throwError('Editor not found');
    }

    if (!isAttached(editor)) {
      throwError('Editor is detached');
    }

    editor.focus?.({ preventScroll: true });

    if ('value' in editor) {
      const setter = getTextSetter(editor);

      if (setter) {
        setter.call(editor, prompt);
      } else {
        editor.value = prompt;
      }

      if ('selectionStart' in editor) {
        editor.selectionStart = prompt.length;
        editor.selectionEnd = prompt.length;
      }

      editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }));
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (editor.isContentEditable) {
      editor.focus?.({ preventScroll: true });

      const selection = window.getSelection();

      if (selection) {
        try {
          const range = document.createRange();
          range.selectNodeContents(editor);

          selection.removeAllRanges();
          selection.addRange(range);

          editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }));

          let inserted = false;

          try {
            inserted = document.execCommand && document.execCommand('insertText', false, prompt);
          } catch (e) {
            inserted = false;
          }

          if (!inserted) {
            editor.textContent = prompt;
          }

          const endRange = document.createRange();
          endRange.selectNodeContents(editor);
          endRange.collapse(false);

          selection.removeAllRanges();
          selection.addRange(endRange);

          editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        } catch (err) {
          log('setEditorValue(contenteditable) failed, falling back to textContent', err);
        }
      }

      editor.textContent = prompt;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    throwError('Unsupported editor type');
  }

  function dispatchEnterKey(target) {
    const eventInit = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };

    for (const type of ['keydown', 'keypress', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, eventInit));
    }
  }

  async function sendPrompt(prompt) {
    const editor = await waitForElement(() => getComposerEditor(), {
      timeoutMs: 15000,
      intervalMs: 200,
      description: 'ChatGPT composer editor',
    });

    setEditorValue(editor, prompt);

    try {
      await waitForCondition(() => {
        const sendButton = getSendButton();
        return sendButton && !sendButton.disabled;
      }, {
        timeoutMs: 5000,
        intervalMs: 100,
        description: 'send button to enable',
      });

      const sendButton = getSendButton();

      if (sendButton) {
        safeClick(sendButton);
        log('send button clicked');
        return;
      }
    } catch (err) {
      log('send button unavailable, falling back to Enter', err.message);
    }

    dispatchEnterKey(editor);

    if (editor.form && typeof editor.form.requestSubmit === 'function') {
      editor.form.requestSubmit();
    }
  }

  async function waitForPromptProcessing() {
    try {
      await waitForCondition(() => isGenerating(), {
        timeoutMs: 8000,
        intervalMs: 100,
        description: 'ChatGPT generation to start',
      });
    } catch (err) {
      log('generation start not observed', err.message);
    }

    await waitForIdle();
  }

  async function processQueue() {
    setStatus('Running');

    while (queue.length > 0) {
      await waitForIdle();

      const item = queue.shift();
      const prompt = item.prompt;

      updateToolbarButton();
      renderQueue();

      setStatus(`Sending: ${prompt.slice(0, 40)}...`);

      try {
        const maxRetries = 2;
        let sent = false;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await sendPrompt(prompt);
            await waitForPromptProcessing();
            sent = true;
            break;
          } catch (err) {
            error(`Error processing prompt (attempt ${attempt}):`, err);
            setStatus(`Error sending prompt (attempt ${attempt}): ${err.message}`);
            await sleep(1000 * attempt);
          }
        }

        if (!sent) {
          item.attempts = (item.attempts || 0) + 1;

          const maxTotalAttempts = 3;

          if (item.attempts < maxTotalAttempts) {
            log('Re-queueing failed prompt for later retry', { id: item.id, attempts: item.attempts });
            queue.push(item);
          } else {
            error('Prompt failed too many times, dropping from queue', { id: item.id, attempts: item.attempts });
          }

          renderQueue();
          updateToolbarButton();
          continue;
        }
      } catch (err) {
        error('Unexpected error in processQueue:', err);
        renderQueue();
        updateToolbarButton();
        continue;
      }
    }

    setStatus('Finished');
    running = false;
    updateToolbarButton();
    repairUi('queue-finished');
  }

  function renderQueue() {
    if (!panel) return;

    const list = panel.querySelector('#pq-list');

    if (!list) return;

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    queue.forEach((item) => {
      const li = document.createElement('li');

      li.style.marginBottom = '10px';
      li.draggable = true;

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      row.style.alignItems = 'flex-start';

      if (editingId == item.id) {
        row.style.background = '#333';
        row.style.padding = '6px';
        row.style.borderRadius = '6px';
        row.style.outline = '1px solid #7dd3fc';
      }

      const text = document.createElement('div');
      text.textContent = item.prompt;
      text.style.flex = '1';
      text.style.wordBreak = 'break-word';
      text.style.fontSize = '14px';

      text.addEventListener('dblclick', () => {
        editQueueItem(item.id);
      });

      const editBtn = document.createElement('button');
      editBtn.textContent = '🖉';
      editBtn.title = 'Edit';
      editBtn.style.cursor = 'pointer';
      editBtn.style.color = '#7dd3fc';

      editBtn.addEventListener('click', () => {
        editQueueItem(item.id);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Delete';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.color = '#ff6b6b';

      deleteBtn.addEventListener('click', () => {
        const preview = item.prompt.length > 80 ? item.prompt.slice(0, 80) + '...' : item.prompt;

        const confirmed = confirm(`Delete this prompt?\n\n${preview}`);

        if (!confirmed) {
          error('Deletion cancelled for item:', item.id);
          return;
        }

        deleteQueueItem(item.id);
      });

      row.appendChild(text);
      row.appendChild(editBtn);
      row.appendChild(deleteBtn);
      li.appendChild(row);

      li.addEventListener('dragstart', () => {
        draggedId = item.id;
        li.style.opacity = '0.5';
      });

      li.addEventListener('dragend', () => {
        draggedId = null;
        li.style.opacity = '1';
      });

      li.addEventListener('dragover', e => {
        e.preventDefault();
        li.style.borderTop = '2px solid #888';
      });

      li.addEventListener('dragleave', () => {
        li.style.borderTop = '';
      });

      li.addEventListener('drop', e => {
        e.preventDefault();
        li.style.borderTop = '';

        if (draggedId === item.id) {
          error('Dropped on itself, ignoring:', item.id);
          return;
        }

        moveQueueItem(draggedId, item.id);
      });

      list.appendChild(li);
    });

    updateToolbarButton();
  }

  function deleteQueueItem(id) {
    const index = queue.findIndex(item => item.id === id);

    if (index === -1) {
      error('Item to delete not found in queue:', id);
      return;
    }

    queue.splice(index, 1);
    renderQueue();
  }

  function editQueueItem(id) {
    const item = queue.find(item => item.id === id);

    if (!item) {
      error('Item to edit not found in queue:', id);
      return;
    }

    editingId = id;

    window.pqInput.value = item.prompt;
    window.pqAddBtn.textContent = 'Save Changes';
    window.pqInput.focus();
    window.pqInput.selectionStart = window.pqInput.selectionEnd = window.pqInput.value.length;
  }

  function moveQueueItem(fromId, toId) {
    const fromIndex = queue.findIndex(item => item.id === fromId);
    const toIndex = queue.findIndex(item => item.id === toId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const [movedItem] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, movedItem);
    renderQueue();
  }

  function setStatus(text) {
    if (!panel) return;

    const status = panel.querySelector('#pq-status');

    if (status) {
      status.textContent = text;
    }
  }

  function repairUi(reason = 'repair') {
    if (repairing) {
      return;
    }

    repairing = true;

    try {
      createPanel();
      createToolbarButton();
      updateToolbarButton();
      renderQueue();
      log('ui repaired', reason);
    } finally {
      repairing = false;
    }
  }

  function requestRepair(reason = 'repair') {
    const now = Date.now();
    const delay = Math.max(0, 2000 - (now - lastRepairAt));

    if (repairTimer) {
      return;
    }

    repairTimer = setTimeout(() => {
      repairTimer = null;
      lastRepairAt = Date.now();
      repairUi(reason);
    }, delay);
  }

  function patchHistoryMethod(methodName) {
    const original = history[methodName];

    if (typeof original !== 'function' || original.__pqPatched) {
      return;
    }

    const patched = function (...args) {
      const result = original.apply(this, args);
      Promise.resolve().then(() => requestRepair('history-navigation'));
      return result;
    };

    patched.__pqPatched = true;
    history[methodName] = patched;
  }

  function startDomObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    const target = document.body || document.documentElement;

    if (!target) {
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      mutations = mutations || [];

      if (mutations.length > 0 && mutations.every(mutation => isOwnMutation(mutation.target))) {
        return;
      }

      const toolbarMissing = !toolbarButton || !isAttached(toolbarButton);
      const panelMissing = !panel || !isAttached(panel);

      if (!toolbarMissing && !panelMissing) {
        return;
      }

      requestRepair(toolbarMissing ? 'toolbar-missing' : 'panel-detached');
    });

    mutationObserver.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-busy', 'aria-disabled', 'disabled'],
    });
  }

  function startUrlWatcher() {
    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');

    window.addEventListener('popstate', () => requestRepair('popstate'));
    window.addEventListener('hashchange', () => requestRepair('hashchange'));

    if (urlWatcher) {
      clearInterval(urlWatcher);
    }

    urlWatcher = setInterval(() => {
      if (location.href !== lastKnownUrl) {
        lastKnownUrl = location.href;
        log('url changed', lastKnownUrl);
        requestRepair('url-change');
      }
    }, 1000);
  }

  function init() {
    createPanel();
    repairUi('init');
    startDomObserver();
    startUrlWatcher();
    renderQueue();
    updateToolbarButton();
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
