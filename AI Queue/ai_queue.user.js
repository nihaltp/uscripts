// ==UserScript==
// @name         ChatGPT Prompt Queue
// @description  Queue multiple prompts for ChatGPT
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://chatgpt.com/favicon.ico
// @version      1.0.0
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/ai_queue.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/ai_queue.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const queue = [];
  let running = false;
  let editingId = null;
  let draggedId = null;
  window.aiQueueDebug = false; // set to true to enable debug logs

  // -----------------------------
  // MARK: UI
  // -----------------------------

  let panel;
  let isPanelVisible = false;

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

  // MARK: create panel
  function createPanel() {
    panel = document.createElement('div');

    panel.id = 'pq-panel';

    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '120px',
      right: '20px',
      width: '320px',
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
      outline: '2px solid #555',
    });

    panel.innerHTML = `
      <div style="font-size:18px;font-weight:bold;margin-bottom:10px;">
        Prompt Queue
      </div>

      <textarea
        id="pq-input"
        placeholder="Enter prompt..."
        style="
          width:100%;
          height:80px;
          resize:vertical;
          color:#fff;
          background:#222;
          border:1px solid #444;
          border-radius:6px;
          padding:8px;
          box-sizing:border-box;
        "
      ></textarea>

      <button id="pq-add" style="margin-top:10px;width:100%;">
        Add To Queue
      </button>

      <button id="pq-start" style="margin-top:10px;width:100%;">
        Start Queue
      </button>

      <div id="pq-status" style="margin-top:10px;">
        Idle
      </div>

      <ol id="pq-list" style="margin-top:10px;padding-left:20px;"></ol>
    `;

    document.documentElement.appendChild(panel);

    setupPanelEvents();
  }

  // MARK: setupPanelEvents
  function setupPanelEvents() {
    const input = panel.querySelector('#pq-input');
    const addBtn = panel.querySelector('#pq-add');
    const startBtn = panel.querySelector('#pq-start');

    window.pqInput = input;
    window.pqAddBtn = addBtn;

    addBtn.addEventListener('click', () => {
      const text = input.value.trim();

      if (!text) {
        return;
      }

      // editing existing item
      if (editingId !== null) {

        const item = queue.find(item => item.id === editingId);

        if (!item) {
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

    list.innerHTML = '';

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
          return;
        }

        moveQueueItem(draggedId, item.id);
      });

      list.appendChild(li);
    });

    updateToolbarButton();
  }

  // MARK: deleteQueueItem
  function deleteQueueItem(id) {
    const index = queue.findIndex(item => item.id === id);

    if (index === -1) {
      return;
    }

    queue.splice(index, 1);

    renderQueue();
  }

  // MARK: editQueueItem
  function editQueueItem(id) {
    const item = queue.find(item => item.id === id);

    if (!item) {
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
  }

  // MARK: setStatus
  function setStatus(text) {
    const status = panel.querySelector('#pq-status');

    if (status) {
      status.textContent = text;
    }
  }

  // MARK: togglePanel
  function togglePanel() {
    isPanelVisible = !isPanelVisible;

    panel.style.display = isPanelVisible
      ? 'block'
      : 'none';
    panel.style.visibility = 'visible';
    panel.style.opacity = '1';

    log('Panel element:', panel);
    log('Panel visible:', isPanelVisible);
  }

  // MARK: createToolbarButton
  function createToolbarButton() {
    if (document.querySelector('#pq-toolbar-button')) {
      return;
    }

    // specifically target dictation button
    const dictationButton = document.querySelector(
      'button[aria-label="Start dictation"]'
    );

    if (!dictationButton) {
      return;
    }

    const button = document.createElement('button');

    button.id = 'pq-toolbar-button';

    button.type = 'button';

    button.textContent = 'Queue';

    button.className = 'composer-btn h-9 min-h-9';

    button.style.padding = '0 12px';
    button.style.borderRadius = '9999px';

    button.addEventListener('click', togglePanel);

    // place BEFORE dictation button
    dictationButton.before(button);

    const style = document.createElement('style');

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

  function updateToolbarButton() {
    const button = document.querySelector('#pq-toolbar-button');

    if (!button) {
      return;
    }

    const count = queue.length;

    button.textContent =
      count > 0
        ? `Queue (${count})`
        : 'Queue';

    // running animation
    if (running) {
      button.style.animation = 'pq-pulse 1.2s infinite';
      button.style.opacity = '1';
    } else {
      button.style.animation = '';
      button.style.opacity = count > 0 ? '1' : '0.8';
    }
  }

  createPanel();

  // continuously reattach button because ChatGPT rerenders UI
  setInterval(createToolbarButton, 2000);

  // -----------------------------
  // MARK: ChatGPT Helpers
  // -----------------------------

  function getTextarea() {
    return document.querySelector('#prompt-textarea');
  }

  function getSendButton() {
    return document.querySelector('button[data-testid="send-button"]');
  }

  function isGenerating() {
    return !!document.querySelector('button[data-testid="stop-button"]');
  }

  async function waitForIdle() {
    while (isGenerating()) {
      await sleep(1000);
    }

    // extra delay for stability
    await sleep(1500);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // MARK: sendPrompt
  async function sendPrompt(prompt) {
    const editor = document.querySelector('#prompt-textarea');

    if (!editor) {
      throwError('Editor not found');
    }

    editor.focus();

    // clear existing content
    editor.innerHTML = '';

    // simulate paste
    const dataTransfer = new DataTransfer();

    dataTransfer.setData('text/plain', prompt);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });

    editor.dispatchEvent(pasteEvent);

    await sleep(300);

    const sendButton = document.querySelector(
      'button[data-testid="send-button"]'
    );

    if (!sendButton) {
      throwError('Send button not found');
    }

    sendButton.click();
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
        await sendPrompt(prompt);

        await sleep(1000);

        await waitForIdle();
      } catch (err) {
        error('Error processing prompt:', err);

        setStatus('Error: ' + err.message);

        running = false;
        updateToolbarButton();
        return;
      }
    }

    setStatus('Finished');
    running = false;
    updateToolbarButton();
  }
})();
