import { queueState } from '../core/state.js';
import { createBasePanel } from '../core/panel.js';
import { createQueueItemElement } from '../core/queue-ui.js';
import { deleteQueueItem, editQueueItem } from '../core/queue.js';
import { applyScopeToQueuedItems, saveQueue as saveQueueToStorage, loadQueue as loadQueueFromStorage } from '../core/storage.js';
import { updateToolbarButton, showPanel, ensureToolbarStyles, observeInputBoundary } from '../core/ui.js';
import { setupPanelControls } from '../core/panel-controls.js';
import { setupPanelDrag } from '../core/drag.js';
import { setStatus } from '../core/queue.js';
import { sendPrompt } from '../core/keyboard.js';
import { waitForIdle } from '../core/generation.js';
import { error, formatError, log } from '../core/logging.js';
import { openChatManagerWindow, refreshChatManager } from '../core/chat-manager.js';
import { installSelectionPromptMenu } from '../core/selection-menu.js';
import { getSettings } from '../core/settings.js';
import { findRetryButton, hasErrorState, safeClick } from '../core/dom.js';
import { sleep } from '../core/utils.js';

function queryPanel() {
  return document.querySelector('#pq-panel');
}

function queryInput() {
  return queryPanel()?.querySelector('#pq-input');
}

function queryAddButton() {
  return queryPanel()?.querySelector('#pq-add');
}

export function createProvider(config) {
  const {
    storageKey,
    panelTitle,
    getCurrentScope,
    includeFailedQueue = false,
    toolbarButtonClass = null,
    maxRetries = 0,
  } = config;

  function createPanel() {
    return createBasePanel(panelTitle, includeFailedQueue);
  }

  function renderQueue() {
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
      const { li, text, editBtn, sendBtn, deleteBtn } = createQueueItemElement(item, {
        renderQueue,
        saveQueue: saveQueueFn,
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

      sendBtn.addEventListener('click', async () => {
        if (queueState.running || sendBtn.disabled) return;

        const index = queueState.queue.findIndex(
          (queuedItem) => queuedItem.id === item.id
        );
        if (index === -1) return;

        queueState.queue.splice(index, 1);
        sendBtn.disabled = true;
        saveQueueFn();
        renderQueue();

        try {
          await waitForIdle();
          await sendPrompt(item.prompt);
        } catch (err) {
          queueState.queue.splice(index, 0, item);
          error('Failed to send queued prompt:', formatError(err));
          saveQueueFn();
          renderQueue();
        }
      });

      deleteBtn.addEventListener('click', () => {
        deleteQueueItem(item.id, queueState.queue, renderQueue, saveQueueFn);
      });

      list.appendChild(li);
    });

    if (includeFailedQueue && failedList && failedTitle) {
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
            renderQueue();
            saveQueueFn();
          }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.color = '#ff6b6b';
        deleteBtn.style.fontSize = '12px';

        deleteBtn.addEventListener('click', () => {
          deleteQueueItem(item.id, queueState.failedQueue, renderQueue, saveQueueFn);
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
  }

  function saveQueueFn() {
    const scope = getCurrentScope();
    const queue = queueState.queue;
    const failedQueue = includeFailedQueue ? queueState.failedQueue : null;
    saveQueueToStorage(queue, failedQueue, storageKey, scope);
    refreshChatManager(storageKey);
  }

  function syncQueuedItemsToCurrentScope(scope) {
    if (!scope) return false;

    const queue = queueState.queue;
    const failedQueue = includeFailedQueue ? queueState.failedQueue : null;
    const updated = applyScopeToQueuedItems(queue, failedQueue, scope);
    if (!updated) return false;

    saveQueueFn();
    refreshChatManager(storageKey);
    return true;
  }

  function loadQueueFn() {
    const scope = getCurrentScope();
    const queue = queueState.queue;
    const failedQueue = includeFailedQueue ? queueState.failedQueue : null;
    loadQueueFromStorage(queue, failedQueue, storageKey, scope);
  }

  function openChatManager() {
    openChatManagerWindow(storageKey, `${panelTitle} Prompt Manager`, document.querySelector('#pq-panel'));
  }

  async function processQueue() {
    const panel = queryPanel();
    if (!panel) return;

    setStatus(panel, 'Running');

    while (queueState.queue.length > 0 && queueState.running) {
      await waitForIdle();

      const nextItem = queueState.queue[0];
      if (nextItem && queueState.recentErrorIds.has(nextItem.id)) {
        log('Loop detected: next prompt recently failed, stopping queue');
        setStatus(panel, 'Loop detected, stopping queue');
        queueState.running = false;
        break;
      }

      const item = queueState.queue.shift();
      if (!item || typeof item.prompt !== 'string') {
        error('Skipping invalid queue item:', item);
        continue;
      }

      const prompt = item.prompt;
      const beforeScope = getCurrentScope();

      queueState.awaitingChatScopeSync = !beforeScope;

      updateToolbarButton(
        document.querySelector('#pq-toolbar-button'),
        queueState.queue,
        queueState.running
      );
      renderQueue();

      setStatus(panel, `Sending: ${prompt.slice(0, 40)}...`);

      try {
        await sendPrompt(prompt);
        const afterScope = getCurrentScope();

        if (!beforeScope && afterScope) {
          syncQueuedItemsToCurrentScope(afterScope);
        }

        if (afterScope) {
          queueState.awaitingChatScopeSync = false;
        }

        item.attempts = 0;
        queueState.currentRetryCount = 0;

        await sleep(2000);

        const settings = getSettings();
        if (settings.autoRetryEnabled && hasErrorState(prompt)) {
          queueState.recentErrorIds.add(item.id);
          if (queueState.recentErrorIds.size > 5) {
            const firstId = queueState.recentErrorIds.values().next().value;
            queueState.recentErrorIds.delete(firstId);
          }

          queueState.currentRetryCount = 0;

          while (queueState.currentRetryCount < settings.maxRetries && queueState.running) {
            queueState.currentRetryCount++;
            setStatus(panel, `Retrying (${queueState.currentRetryCount}/${settings.maxRetries}): ${prompt.slice(0, 40)}...`);

            const retryButton = findRetryButton(prompt);
            if (retryButton) {
              safeClick(retryButton);
              await sleep(300);
              await waitForIdle();
              await sleep(2000);

              if (!hasErrorState(prompt)) {
                log('Retry successful');
                item.attempts = 0;
                queueState.currentRetryCount = 0;
                break;
              }
            } else {
              error('Retry button not found');
              break;
            }
          }

          if (hasErrorState(prompt) && queueState.currentRetryCount >= settings.maxRetries) {
            log('Retry limit reached, applying action:', settings.retryLimitAction);
            if (settings.retryLimitAction === 'stop') {
              setStatus(panel, 'Retry limit reached, stopping queue');
              queueState.running = false;
              if (includeFailedQueue) {
                queueState.failedQueue.push(item);
              }
            } else if (settings.retryLimitAction === 'continue') {
              setStatus(panel, 'Retry limit reached, continuing with next');
              queueState.queue.push(item);
            }
          }
        }
      } catch (err) {
        queueState.awaitingChatScopeSync = false;
        error('Failed to send prompt:', formatError(err));

        if (maxRetries > 0) {
          item.status = 'failed';
          item.attempts = (item.attempts || 0) + 1;

          if (item.attempts < maxRetries) {
            item.status = 'queued';
            queueState.queue.push(item);
          } else if (includeFailedQueue) {
            queueState.failedQueue.push(item);
          }
        }
      }

      if (beforeScope) {
        queueState.awaitingChatScopeSync = false;
      }

      saveQueueFn();
    }

    setStatus(panel, queueState.running ? 'Finished' : 'Stopped');
    queueState.running = false;
    updateToolbarButton(
      document.querySelector('#pq-toolbar-button'),
      queueState.queue,
      queueState.running
    );
  }

  function ensureToolbarButton() {
    ensureToolbarStyles();

    installSelectionPromptMenu({
      createItem: provider.createItem,
      renderQueue,
      saveQueue: saveQueueFn,
      updateToolbarButton,
    });

    let button = document.querySelector('#pq-toolbar-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'pq-toolbar-button';
      button.type = 'button';
      button.textContent = 'Queue';
      button.addEventListener('click', () => showPanel(() => createPanel()));
    }

    if (toolbarButtonClass) {
      button.classList.add(toolbarButtonClass);
    }

    Object.assign(button.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      padding: '10px 14px',
      borderRadius: '9999px',
      background: 'var(--pq-ui-bg)',
      color: 'var(--pq-ui-text)',
      border: '1px solid var(--pq-ui-border)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      zIndex: '2147483647',
      cursor: 'pointer',
    });

    if (button.parentElement !== document.body) {
      document.body.appendChild(button);
    }

    observeInputBoundary(button);
  }

  const provider = {
    storageKey,
    includeFailedQueue,
    getCurrentScope,
    createItem(text) {
      const scope = getCurrentScope();
      const baseItem = {
        id: crypto.randomUUID(),
        prompt: text,
        attempts: 0,
        status: 'queued',
        createdAt: Date.now(),
      };

      if (scope) {
        if (typeof scope === 'string') {
          baseItem.chatCode = scope;
        } else if (scope.chatId) {
          baseItem.chatId = scope.chatId;
          baseItem.chatCode = scope.chatId;
        }
        if (scope.groupId) {
          baseItem.groupId = scope.groupId;
        }
      }

      return baseItem;
    },
    createPanel,
    renderQueue,
    saveQueue: saveQueueFn,
    loadQueue: loadQueueFn,
    processQueue,
    setupPanelControls,
    setupPanelDrag,
    ensureToolbarButton,
    openChatManager,
    isOwnMutation(target) {
      return !!target && (target.closest?.('#pq-panel') || target.closest?.('.pq-toolbar'));
    },
  };

  return provider;
}
