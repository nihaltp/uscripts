// Gemini-specific panel creation
function createGeminiPanel() {
  if (window.pqPanel && isAttached(window.pqPanel)) {
    return;
  }

  if (window.pqPanel && !isAttached(window.pqPanel)) {
    if (document.body) {
      document.body.appendChild(window.pqPanel);
    }
    return;
  }

  if (!window.pqPanel) {
    window.pqPanel = document.createElement('div');
    window.pqPanel.id = 'pq-panel';

    Object.assign(window.pqPanel.style, {
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
    
    const stopBtn = document.createElement('button');
    stopBtn.id = 'pq-stop';
    stopBtn.style.marginTop = '10px';
    stopBtn.style.width = '100%';
    stopBtn.textContent = 'Stop Queue';
    stopBtn.style.display = 'none';

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

    window.pqPanel.appendChild(title);
    window.pqPanel.appendChild(textarea);
    window.pqPanel.appendChild(addBtn);
    window.pqPanel.appendChild(startBtn);
    window.pqPanel.appendChild(stopBtn);
    window.pqPanel.appendChild(status);
    window.pqPanel.appendChild(list);
    window.pqPanel.appendChild(failedTitle);
    window.pqPanel.appendChild(failedList);

    if (document.body) {
      document.body.appendChild(window.pqPanel);
    }

    window.pqPanelInitialized = true;
  }
}

// Gemini-specific drag functionality
function setupGeminiPanelDrag() {
  if (!window.pqPanel) return;

  window.pqPanel.addEventListener(
    'mousedown',
    e => {
      if (e.button !== 2) return;

      e.preventDefault();
      e.stopPropagation();

      window.pqPanelDragging = true;
      window.pqPanelDragStartX = e.clientX;
      window.pqPanelDragStartY = e.clientY;
      window.pqPanelStartX = window.pqPanel.offsetLeft;
      window.pqPanelStartY = window.pqPanel.offsetTop;

      log('panel drag started');
    },
    true
  );

  document.addEventListener('mousemove', e => {
    if (!window.pqPanelDragging) return;

    const deltaX = e.clientX - window.pqPanelDragStartX;
    const deltaY = e.clientY - window.pqPanelDragStartY;

    window.pqPanel.style.left = window.pqPanelStartX + deltaX + 'px';
    window.pqPanel.style.top = window.pqPanelStartY + deltaY + 'px';
    window.pqPanel.style.right = 'auto';
    window.pqPanel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (window.pqPanelDragging) {
      window.pqPanelDragging = false;
      log('panel drag ended');
    }
  });

  window.pqPanel.addEventListener('contextmenu', e => {
    if (window.pqPanelDragging) {
      e.preventDefault();
    }
  });
}

// Gemini-specific rendering with failed queue
function renderGeminiQueue() {
  const list = window.pqPanel.querySelector('#pq-list');
  const failedList = window.pqPanel.querySelector('#pq-failed-list');
  const failedTitle = window.pqPanel.querySelector('#pq-failed-title');

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  window.aiQueue.queue.forEach((item, index) => {
    const li = document.createElement('li');
    li.style.marginBottom = '10px';
    li.draggable = true;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.style.alignItems = 'flex-start';

    if (window.aiQueue.editingId == item.id) {
      row.style.backgroundColor = '#333';
      row.style.padding = '4px';
      row.style.borderRadius = '4px';
    }

    const text = document.createElement('div');
    text.textContent = item.prompt;
    text.style.flex = '1';
    text.style.wordBreak = 'break-word';
    text.style.fontSize = '14px';

    text.addEventListener('dblclick', () => {
      editQueueItem(item.id, window.aiQueue.queue, (id, prompt) => {
        window.aiQueue.editingId = id;
        window.pqInput.value = prompt;
        window.pqAddBtn.textContent = 'Save Changes';
        window.pqInput.focus();
        window.pqInput.selectionStart = window.pqInput.selectionEnd = window.pqInput.value.length;
      });
    });

    const editBtn = document.createElement('button');
    editBtn.textContent = '🖉';
    editBtn.title = 'Edit';
    editBtn.style.cursor = 'pointer';
    editBtn.style.color = '#7dd3fc';

    editBtn.addEventListener('click', () => {
      editQueueItem(item.id, window.aiQueue.queue, (id, prompt) => {
        window.aiQueue.editingId = id;
        window.pqInput.value = prompt;
        window.pqAddBtn.textContent = 'Save Changes';
        window.pqInput.focus();
        window.pqInput.selectionStart = window.pqInput.selectionEnd = window.pqInput.value.length;
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.color = '#ff6b6b';

    deleteBtn.addEventListener('click', () => {
      deleteQueueItem(item.id, window.aiQueue.queue, renderGeminiQueue, saveGeminiQueue);
    });

    row.appendChild(text);
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);

    li.appendChild(row);

    li.addEventListener('dragstart', () => {
      window.aiQueue.draggedId = item.id;
    });

    li.addEventListener('dragend', () => {
      window.aiQueue.draggedId = null;
    });

    li.addEventListener('dragover', e => {
      e.preventDefault();
      li.style.borderTop = '2px solid #7dd3fc';
    });

    li.addEventListener('dragleave', () => {
      li.style.borderTop = '';
    });

    li.addEventListener('drop', e => {
      e.preventDefault();
      li.style.borderTop = '';

      if (window.aiQueue.draggedId && window.aiQueue.draggedId !== item.id) {
        moveQueueItem(
          window.aiQueue.draggedId,
          item.id,
          window.aiQueue.queue,
          renderGeminiQueue,
          saveGeminiQueue
        );
      }
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
  setupPanelDrag: setupGeminiPanelDrag,
  renderQueue: renderGeminiQueue,
  saveQueue: saveGeminiQueue,
  loadQueue: loadGeminiQueue,
};
