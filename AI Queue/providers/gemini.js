// Gemini-specific panel creation
function createGeminiPanel() {
  createBasePanel('Gemini Prompt Queue', true);
}

// Using shared drag handler (window.setupPanelDrag)

// Gemini-specific rendering with failed queue
function renderGeminiQueue() {
  const list = window.pqPanel.querySelector('#pq-list');
  const failedList = window.pqPanel.querySelector('#pq-failed-list');
  const failedTitle = window.pqPanel.querySelector('#pq-failed-title');

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  window.aiQueue.queue.forEach((item, index) => {
    const { li, text, editBtn, deleteBtn } = window.createQueueItemElement(item, {
      renderQueue: renderGeminiQueue,
      saveQueue: saveGeminiQueue,
    });

    if (window.aiQueue.editingId == item.id) {
      li.querySelector('div').style.backgroundColor = '#333';
      li.querySelector('div').style.padding = '4px';
      li.querySelector('div').style.borderRadius = '4px';
    }

    text.addEventListener('dblclick', () => {
      editQueueItem(item.id, window.aiQueue.queue, (id, prompt) => {
        window.aiQueue.editingId = id;
        window.pqInput.value = prompt;
        window.pqAddBtn.textContent = 'Save Changes';
        window.pqInput.focus();
        window.pqInput.selectionStart = window.pqInput.selectionEnd = window.pqInput.value.length;
        editBtn.style.display = 'inline-block';
        deleteBtn.style.display = 'inline-block';
      });
    });

    editBtn.addEventListener('click', () => {
      editQueueItem(item.id, window.aiQueue.queue, (id, prompt) => {
        window.aiQueue.editingId = id;
        window.pqInput.value = prompt;
        window.pqAddBtn.textContent = 'Save Changes';
        window.pqInput.focus();
        window.pqInput.selectionStart = window.pqInput.selectionEnd = window.pqInput.value.length;
      });
    });

    deleteBtn.addEventListener('click', () => {
      deleteQueueItem(item.id, window.aiQueue.queue, renderGeminiQueue, saveGeminiQueue);
    });

    list.appendChild(li);
  });

  if (failedList) {
    while (failedList.firstChild) {
      failedList.removeChild(failedList.firstChild);
    }

    if (window.aiQueue.failedQueue.length > 0) {
      failedTitle.style.display = 'block';
    } else {
      failedTitle.style.display = 'none';
    }

    window.aiQueue.failedQueue.forEach(item => {
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
        const index = window.aiQueue.failedQueue.findIndex(i => i.id === item.id);
        if (index !== -1) {
          const [retryItem] = window.aiQueue.failedQueue.splice(index, 1);
          retryItem.attempts = 0;
          window.aiQueue.queue.push(retryItem);
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
        deleteQueueItem(item.id, window.aiQueue.failedQueue, renderGeminiQueue, saveGeminiQueue);
      });

      row.appendChild(text);
      row.appendChild(retryBtn);
      row.appendChild(deleteBtn);

      li.appendChild(row);
      failedList.appendChild(li);
    });
  }

  updateToolbarButton(window.pqToolbarButton, window.aiQueue.queue, window.aiQueue.running);
  log('queue rendered safely');
}

function saveGeminiQueue() {
  saveQueue(window.aiQueue.queue, window.aiQueue.failedQueue, 'pq-gemini-queue');
}

function loadGeminiQueue() {
  loadQueue(window.aiQueue.queue, window.aiQueue.failedQueue, 'pq-gemini-queue');
}

// Export for main script
window.GeminiQueueProvider = {
  createPanel: createGeminiPanel,
  setupPanelDrag: window.setupPanelDrag,
  renderQueue: renderGeminiQueue,
  saveQueue: saveGeminiQueue,
  loadQueue: loadGeminiQueue,
};
