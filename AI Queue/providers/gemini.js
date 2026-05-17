import { queueState } from '../core/state.js';
import { createBasePanel } from '../core/panel.js';
import { createQueueItemElement } from '../core/queue-ui.js';
import { deleteQueueItem, editQueueItem } from '../core/queue.js';
import { applyScopeToQueuedItems, saveQueue, loadQueue } from '../core/storage.js';
import { updateToolbarButton, showPanel, ensureToolbarStyles } from '../core/ui.js';
import { setupPanelControls } from '../core/panel-controls.js';
import { setupPanelDrag } from '../core/drag.js';
import { log, error, formatError } from '../core/logging.js';
import { setStatus } from '../core/queue.js';
import { sendPrompt } from '../core/keyboard.js';
import { waitForIdle } from '../core/generation.js';
import { bootstrapQueueApp } from '../core/bootstrap.js';
import { openChatManagerWindow, refreshChatManager } from '../core/chat-manager.js';
import { installSelectionPromptMenu } from '../core/selection-menu.js';

const STORAGE_KEY = 'pq-gemini-queue';
const DOMAINS = ['gemini.google.com'];

function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getCurrentGeminiChatCode(url = globalThis.location?.href || '') {
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

export function createGeminiPanel() {
  return createBasePanel('Gemini Prompt Queue', true);
}

export function renderGeminiQueue() {
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
      retryBtn.textContent = '🔄';
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
      deleteBtn.textContent = '✕';
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

export function saveGeminiQueue() {
  saveQueue(queueState.queue, queueState.failedQueue, STORAGE_KEY, getCurrentGeminiChatCode());
  refreshChatManager(STORAGE_KEY);
}

function syncQueuedItemsToCurrentChatCode(chatCode) {
  if (!chatCode) return false;

  const updated = applyScopeToQueuedItems(queueState.queue, queueState.failedQueue, chatCode);
  if (!updated) return false;

  saveGeminiQueue();
  refreshChatManager(STORAGE_KEY);
  return true;
}

export function loadGeminiQueue() {
  loadQueue(queueState.queue, queueState.failedQueue, STORAGE_KEY, getCurrentGeminiChatCode());
}

export function openGeminiChatManager() {
  openChatManagerWindow(STORAGE_KEY, 'Gemini Chat Prompt Manager');
}

export async function processGeminiQueue() {
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
    const beforeChatCode = getCurrentGeminiChatCode();

    queueState.awaitingChatScopeSync = !beforeChatCode;

    updateToolbarButton(
      document.querySelector('#pq-toolbar-button'),
      queueState.queue,
      queueState.running
    );
    renderGeminiQueue();

    setStatus(panel, `Sending: ${prompt.slice(0, 40)}...`);

    try {
      await sendPrompt(prompt);
      const afterChatCode = getCurrentGeminiChatCode();

      if (!beforeChatCode && afterChatCode) {
        syncQueuedItemsToCurrentChatCode(afterChatCode);
      }
      if (afterChatCode) {
        queueState.awaitingChatScopeSync = false;
      }
      item.attempts = 0;
    } catch (err) {
      queueState.awaitingChatScopeSync = false;
      error('Failed to send prompt:', formatError(err));
      item.status = 'failed';
      item.attempts = (item.attempts || 0) + 1;

      if (item.attempts < 3) {
        item.status = 'queued';
        queueState.queue.push(item);
      } else {
        queueState.failedQueue.push(item);
      }
    }

    if (beforeChatCode) {
      queueState.awaitingChatScopeSync = false;
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

export function ensureGeminiToolbarButton() {
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

export const geminiProvider = {
  storageKey: STORAGE_KEY,
  includeFailedQueue: true,
  getCurrentScope: getCurrentGeminiChatCode,
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
