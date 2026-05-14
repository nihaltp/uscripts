import { queueState } from '../core/state.js';
import { createBasePanel } from '../core/panel.js';
import { createQueueItemElement } from '../core/queue-ui.js';
import { deleteQueueItem, editQueueItem } from '../core/queue.js';
import { saveQueue, loadQueue } from '../core/storage.js';
import { updateToolbarButton, showPanel, ensureToolbarStyles } from '../core/ui.js';
import { setupPanelControls } from '../core/panel-controls.js';
import { setupPanelDrag } from '../core/drag.js';
import { setStatus } from '../core/queue.js';
import { sendPrompt } from '../core/keyboard.js';
import { waitForIdle, waitForPromptProcessing } from '../core/generation.js';
import { error } from '../core/logging.js';
import { bootstrapQueueApp } from '../core/bootstrap.js';

function queryPanel() {
  return document.querySelector('#pq-panel');
}

function queryInput() {
  return queryPanel()?.querySelector('#pq-input');
}

function queryAddButton() {
  return queryPanel()?.querySelector('#pq-add');
}

export function createChatGPTPanel() {
  return createBasePanel('ChatGPT Prompt Queue', false);
}

export function renderChatGPTQueue() {
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

export function saveChatGPTQueue() {
  saveQueue(queueState.queue, null, 'pq-chatgpt-queue');
}

export function loadChatGPTQueue() {
  loadQueue(queueState.queue, null, 'pq-chatgpt-queue');
}

export async function processChatGPTQueue() {
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

export function ensureChatGPTToolbarButton() {
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

export const chatgptProvider = {
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
