// ChatGPT-specific panel creation
function createChatGPTPanel() {
  createBasePanel('ChatGPT Prompt Queue', false);
}

// ChatGPT-specific rendering
function renderChatGPTQueue() {
  const list = window.pqPanel.querySelector('#pq-list');

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  window.aiQueue.queue.forEach((item, index) => {
    const { li, text, editBtn, deleteBtn } = window.createQueueItemElement(item, {
      renderQueue: renderChatGPTQueue,
      saveQueue: saveChatGPTQueue,
    });

    if (window.aiQueue.editingId == item.id) {
      li.querySelector('div').style.backgroundColor = '#333';
      li.querySelector('div').style.padding = '4px';
      li.querySelector('div').style.borderRadius = '4px';
    }

    text.addEventListener('dblclick', () => {
      AIQueue.queue.editQueueItem(item.id, window.aiQueue.queue, (id, prompt) => {
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
      AIQueue.queue.editQueueItem(item.id, window.aiQueue.queue, (id, prompt) => {
        window.aiQueue.editingId = id;
        window.pqInput.value = prompt;
        window.pqAddBtn.textContent = 'Save Changes';
        window.pqInput.focus();
        window.pqInput.selectionStart = window.pqInput.selectionEnd = window.pqInput.value.length;
      });
    });

    deleteBtn.addEventListener('click', () => {
      AIQueue.queue.deleteQueueItem(
        item.id,
        window.aiQueue.queue,
        renderChatGPTQueue,
        saveChatGPTQueue
      );
    });

    list.appendChild(li);
  });

  AIQueue.ui.updateToolbarButton(
    window.pqToolbarButton,
    window.aiQueue.queue,
    window.aiQueue.running
  );
}

function saveChatGPTQueue() {
  saveQueue(window.aiQueue.queue, null, 'pq-chatgpt-queue');
}

function loadChatGPTQueue() {
  loadQueue(window.aiQueue.queue, null, 'pq-chatgpt-queue');
}

// Export for main script
window.ChatGPTQueueProvider = {
  createPanel: createChatGPTPanel,
  setupPanelDrag: window.setupPanelDrag,
  renderQueue: renderChatGPTQueue,
  saveQueue: saveChatGPTQueue,
  loadQueue: loadChatGPTQueue,
};
