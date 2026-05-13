// ==UserScript==
// @name         Gemini Prompt Queue
// @description  Queue multiple prompts for Gemini
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20AI%20Queue%2Fgemini.user.js&body=File%3A%20AI%20Queue%2Fgemini.user.js%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://gemini.google.com/app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @version      1.0.4
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/gemini.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/gemini.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const queue = [];
  const failedQueue = [];
  let running = false;
  let editingId = null;
  let draggedId = null;
  window.aiQueueDebug = false; // set to true to enable debug logs

  // -----------------------------
  // MARK: UI
  // -----------------------------

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

  // MARK: logging helpers
  function log(...args) {
    if (!window.aiQueueDebug) return;
    console.log("[AI QUEUE]", ...args);
  }

  function error(...args) {
    console.error("[AI QUEUE]", ...args);
  }

  function throwError(...args) {
    error(...args);
    throw new Error(args.join(' '));
  }

  // MARK: utility functions
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function debounce(fn, waitMs = 200) {
    let timeoutId = null;

    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), waitMs);
    };
  }

  function isAttached(element) {
    return !!element && document.contains(element);
  }

  // MARK: is visibile
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

  // MARK: isActionButtonElement
  function isActionButtonElement(element) {
    return !!element && element instanceof HTMLElement && element.matches(
      'button, [role="button"], input[type="button"], input[type="submit"]'
    );
  }

  // MARK: isOwnMutation
  function isOwnMutation(target) {
    return !!target && (
      target.closest?.('#pq-panel') ||
      target.closest?.('.pq-toolbar') ||
      target.id === 'pq-panel'
    );
  }

  // MARK: wait helpers
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

  // MARK: safe click
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

  // MARK: create panel
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

      // Build panel DOM without using innerHTML to avoid CSP/innerHTML restrictions
      const title = document.createElement('div');
      title.style.fontSize = '18px';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '10px';
      title.textContent = 'Gemini Prompt Queue';

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

      panel.appendChild(title);
      panel.appendChild(textarea);
      panel.appendChild(addBtn);
      panel.appendChild(startBtn);
      panel.appendChild(status);
      panel.appendChild(list);
      panel.appendChild(failedTitle);
      panel.appendChild(failedList);

      if (document.body) {
        document.body.appendChild(panel);
      }

      setupPanelEvents();
      panelInitialized = true;
    }
  }

  // MARK: setupPanelEvents
  function setupPanelEvents() {
    const input = panel.querySelector('#pq-input');
    const addBtn = panel.querySelector('#pq-add');
    const startBtn = panel.querySelector('#pq-start');

    window.pqInput = input;
    window.pqAddBtn = addBtn;

    const handleAddClick = () => {
      const text = input.value.trim();

      if (!text) {
        error('Empty prompt, not adding to queue');
        return;
      }

      // editing existing item
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

        // add new item
        queue.push({
          id: crypto.randomUUID(),
          prompt: text,
        });
      }

      updateToolbarButton();

      input.value = '';

      renderQueue();
      saveQueue();
    };

    addBtn.addEventListener('click', handleAddClick);

    input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddClick();
      }
    });

    startBtn.addEventListener('click', async () => {
      if (running) return;

      running = true;

      updateToolbarButton();
      processQueue();
    });
  }

  // MARK: renderQueue
  function renderQueue() {
    const list = panel.querySelector('#pq-list');
    const failedList = panel.querySelector('#pq-failed-list');
    const failedTitle = panel.querySelector('#pq-failed-title');

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    queue.forEach((item, index) => {
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
        const preview =
          item.prompt.length > 80
            ? item.prompt.slice(0, 80) + '...'
            : item.prompt;

        const confirmed = confirm(
          `Delete this prompt?\n\n${preview}`
        );

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

    // render failed queue
    if (failedList) {
      while (failedList.firstChild) {
        failedList.removeChild(failedList.firstChild);
      }

      if (failedQueue.length > 0) {
        failedTitle.style.display = 'block';
      } else if (failedTitle) {
        failedTitle.style.display = 'none';
      }

      failedQueue.forEach((item) => {
        const li = document.createElement('li');
        li.style.marginBottom = '8px';

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '6px';
        row.style.alignItems = 'flex-start';

        const text = document.createElement('div');
        text.textContent = item.prompt;
        text.style.flex = '1';
        text.style.wordBreak = 'break-word';
        text.style.fontSize = '13px';
        text.style.opacity = '0.9';

        const attemptBadge = document.createElement('div');
        attemptBadge.textContent = `Attempts: ${item.attempts || 0}`;
        attemptBadge.style.opacity = '0.7';
        attemptBadge.style.fontSize = '12px';

        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'Retry';
        retryBtn.style.cursor = 'pointer';
        retryBtn.addEventListener('click', () => retryFailedItem(item.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.color = '#ff6b6b';
        deleteBtn.addEventListener('click', () => deleteFailedItem(item.id));

        row.appendChild(text);
        row.appendChild(attemptBadge);
        row.appendChild(retryBtn);
        row.appendChild(deleteBtn);

        li.appendChild(row);
        failedList.appendChild(li);
      });
    }

    updateToolbarButton();
    log('queue rendered safely');
  }

  // MARK: deleteQueueItem
  function deleteQueueItem(id) {
    const index = queue.findIndex(item => item.id === id);

    if (index === -1) {
      error('Item to delete not found in queue:', id);
      return;
    }

    queue.splice(index, 1);

    renderQueue();
    saveQueue();
  }

  // MARK: deleteFailedItem
  function deleteFailedItem(id) {
    const index = failedQueue.findIndex(item => item.id === id);

    if (index === -1) {
      error('Failed item to delete not found:', id);
      return;
    }

    failedQueue.splice(index, 1);
    renderQueue();
    saveQueue();
  }

  // MARK: retryFailedItem
  function retryFailedItem(id) {
    const index = failedQueue.findIndex(item => item.id === id);

    if (index === -1) {
      error('Failed item to retry not found:', id);
      return;
    }

    const [item] = failedQueue.splice(index, 1);

    // reset attempts so it will be retried fresh
    item.attempts = 0;
    queue.push(item);

    renderQueue();
    saveQueue();
  }

  // MARK: editQueueItem
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

    // move cursor to end
    window.pqInput.selectionStart =
      window.pqInput.selectionEnd =
        window.pqInput.value.length;
  }

  // MARK: moveQueueItem
  function moveQueueItem(fromId, toId) {
    const fromIndex = queue.findIndex(item => item.id === fromId);

    const toIndex = queue.findIndex(item => item.id === toId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const [movedItem] = queue.splice(fromIndex, 1);

    queue.splice(toIndex, 0, movedItem);

    renderQueue();
    saveQueue();
  }

  // MARK: setStatus
  function setStatus(text) {
    if (!panel) return;

    const status = panel.querySelector('#pq-status');

    if (status) {
      status.textContent = text;
    }
  }

  // MARK: togglePanel
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

    log('panel visible', isPanelVisible);
  }

  // MARK: ensureToolbarStyles
  function ensureToolbarStyles() {
    if (document.querySelector('#pq-styles')) {
      return;
    }

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

  // MARK: getEditorText
  function getEditorText(editor) {
    if (!editor) return '';

    if ('value' in editor) {
      return String(editor.value || '');
    }

    return String(editor.textContent || '');
  }

  // MARK: isEditableCandidate
  function isEditableCandidate(element) {
    if (!element) return false;
    if (!(element instanceof HTMLElement)) return false;
    if (!isAttached(element)) return false;
    if (!isVisible(element)) return false;

    const isTextarea = element instanceof HTMLTextAreaElement;

    const isContentEditable =
      element.isContentEditable ||
      element.getAttribute('contenteditable') === 'true';

    if (!isTextarea && !isContentEditable) {
      return false;
    }

    if (
      element.matches(
        'button, [role="button"], input[type="button"], input[type="submit"]'
      )
    ) {
      return false;
    }

    if (
      element.disabled ||
      element.getAttribute('aria-disabled') === 'true'
    ) {
      return false;
    }

    if (element.closest('#pq-panel')) {
      return false;
    }

    return true;
  }

  // MARK: scoreEditor
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

  // MARK: getComposerEditor
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

    candidates.forEach(candidate => {
      log('editor candidate', candidate.tagName, candidate);
    });

    const editor = candidates[0] || null;

    if (editor && editor.matches('button, [role="button"]')) {
      return null;
    }

    if (editor) {
      log('editor found', editor);
    }

    return editor;
  }

  // MARK: getComposerHost
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

  // MARK: button helpers
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

  // MARK: generation state helpers
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

  function isGenerating() {
    return getGenerationState().generating;
  }

  // MARK: waitForIdle
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
        description: 'Gemini to become idle',
      });

      await sleep(300);
    } catch (err) {
      log('waitForIdle timed out:', err.message);

      // Give a short grace period and continue.
      await sleep(300);
    }
  }

  // MARK: waitForGenerationStart
  async function waitForGenerationStart({ timeoutMs = 8000, intervalMs = 100 } = {}) {
    return waitForCondition(() => getGenerationState().generating, {
      timeoutMs,
      intervalMs,
      description: 'Gemini generation to start',
    });
  }

  // MARK: setEditorValue
  function setEditorValue(editor, prompt) {
    if (!editor) {
      throwError('Editor not found');
    }

    if (!isAttached(editor)) {
      throwError('Editor is detached');
    }

    editor.focus?.({ preventScroll: true });

    if ('value' in editor) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

      if (setter) {
        setter.call(editor, prompt);
      } else {
        editor.value = prompt;
      }

      if ('selectionStart' in editor) {
        editor.selectionStart = prompt.length;
        editor.selectionEnd = prompt.length;
      }

      editor.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: prompt,
      }));

      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: prompt,
      }));

      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (editor.isContentEditable) {
      // Prefer replacing the entire editable content to avoid accidental
      // leading newlines from appending at block boundaries. Select all
      // content then insert text (execCommand) which replaces the selection.
      editor.focus?.({ preventScroll: true });

      const selection = window.getSelection();

      if (selection) {
        try {
          const range = document.createRange();
          range.selectNodeContents(editor);

          selection.removeAllRanges();
          selection.addRange(range);

          editor.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: prompt,
          }));

          let inserted = false;

          try {
            inserted = document.execCommand && document.execCommand('insertText', false, prompt);
          } catch (e) {
            inserted = false;
          }

          if (!inserted) {
            editor.textContent = prompt;
          }

          // Move caret to end
          const endRange = document.createRange();
          endRange.selectNodeContents(editor);
          endRange.collapse(false);

          selection.removeAllRanges();
          selection.addRange(endRange);

          editor.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: prompt,
          }));

          editor.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        } catch (err) {
          log('setEditorValue(contenteditable) failed, falling back to textContent', err);
        }
      }

      // Fallback: directly set textContent
      editor.textContent = prompt;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    throwError('Unsupported editor type');
  }

  // MARK: dispatchEnterKey
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

  // MARK: sendPrompt
  async function sendPrompt(prompt) {
    const editor = await waitForElement(() => getComposerEditor(), {
      timeoutMs: 15000,
      intervalMs: 200,
      description: 'Gemini composer editor',
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

  // MARK: storage persistence
  function saveQueue() {
    try {
      const data = {
        queue: queue,
        failedQueue: failedQueue,
      };
      localStorage.setItem('pq-queue-state', JSON.stringify(data));
      log('queue saved to storage');
    } catch (err) {
      error('Failed to save queue:', err);
    }
  }

  function loadQueue() {
    try {
      const stored = localStorage.getItem('pq-queue-state');
      if (stored) {
        const data = JSON.parse(stored);
        if (Array.isArray(data.queue)) {
          queue.push(...data.queue);
        }
        if (Array.isArray(data.failedQueue)) {
          failedQueue.push(...data.failedQueue);
        }
        log('queue loaded from storage', queue.length, 'items');
      }
    } catch (err) {
      error('Failed to load queue:', err);
    }
  }

  // MARK: getToolbarHost
  function getToolbarHost() {
    const editor = getComposerEditor();

    if (!editor) {
      return null;
    }

    return getComposerHost(editor);
  }

  // MARK: ensureToolbarButton
  function ensureToolbarButton() {
    ensureToolbarStyles();

    if (!toolbarButton) {
      toolbarButton = document.createElement('button');
      toolbarButton.id = 'pq-toolbar-button';
      toolbarButton.classList.add('pq-toolbar');
      toolbarButton.type = 'button';
      toolbarButton.textContent = 'Queue';
      toolbarButton.addEventListener('click', togglePanel);
    }

    const host = getToolbarHost();

    if (host === toolbarButton || (host && toolbarButton.contains(host))) {
      return;
    }

    if (host && (
      host === getComposerEditor() ||
      host.isContentEditable ||
      host.matches?.('[contenteditable="true"], textarea, input')
    )) {
      return;
    }

    if (host) {
      toolbarButton.className = 'composer-btn h-9 min-h-9';
      Object.assign(toolbarButton.style, {
        position: '',
        bottom: '',
        right: '',
        left: '',
        zIndex: '',
        padding: '0 12px',
        borderRadius: '9999px',
        marginInlineStart: '8px',
        background: '#1f1f1f',
        color: '#fff',
        border: '1px solid #555',
        cursor: 'pointer',
      });

      if (toolbarButton.parentElement !== host) {
        host.appendChild(toolbarButton);
        log('toolbar attached', { mode: 'host', host });
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

    if (toolbarButton.parentElement !== document.body) {
      document.body.appendChild(toolbarButton);
      log('toolbar attached', { mode: 'floating' });
    }
  }

  // MARK: updateToolbarButton
  function updateToolbarButton() {
    if (!toolbarButton || !isAttached(toolbarButton)) {
      ensureToolbarButton();
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

  // MARK: repairUi
  function repairUi(reason = 'repair') {
    if (repairing) {
      return;
    }

    repairing = true;

    try {
    createPanel();
    ensureToolbarButton();
    updateToolbarButton();
    log('ui repaired', reason);
    } finally {
      repairing = false;
    }
  }

  // MARK: requestRepair
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

  // MARK: startDomObserver
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

  // MARK: patchHistoryMethod
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

  // MARK: startUrlWatcher
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

  // MARK: waitForPromptProcessing
  async function waitForPromptProcessing() {
    try {
      await waitForGenerationStart();
    } catch (err) {
      log('generation start not observed', err.message);
    }

    await waitForIdle();
  }

  // MARK: processQueue
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
        // Try sending with a few quick retries. On persistent failure,
        // requeue the prompt once (so it can be retried later) and continue
        // processing the rest of the queue instead of aborting.
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
            log('Moving prompt to failed queue after max attempts', { id: item.id, attempts: item.attempts });
            failedQueue.push(item);
          }

          renderQueue();
          updateToolbarButton();

          // Continue with next item rather than aborting the entire queue.
          continue;
        }
      } catch (err) {
        // Defensive catch: ensure the loop keeps running on unexpected errors.
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

  // MARK: init
  function init() {
    loadQueue();
    createPanel();
    renderQueue();
    repairUi('init');
    startDomObserver();
    startUrlWatcher();
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
