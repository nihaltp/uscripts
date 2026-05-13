// Queue management
function deleteQueueItem(id, queue, renderQueue, saveQueue) {
  const index = queue.findIndex(item => item.id === id);

  if (index === -1) {
    error('Item to delete not found in queue:', id);
    return;
  }

  queue.splice(index, 1);
  renderQueue();
  saveQueue?.();
}

function editQueueItem(id, queue, updateUI) {
  const item = queue.find(item => item.id === id);

  if (!item) {
    error('Item to edit not found in queue:', id);
    return;
  }

  updateUI(id, item.prompt);
}

function moveQueueItem(fromId, toId, queue, renderQueue, saveQueue) {
  const fromIndex = queue.findIndex(item => item.id === fromId);
  const toIndex = queue.findIndex(item => item.id === toId);

  if (fromIndex === -1 || toIndex === -1) return;

  const [movedItem] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, movedItem);

  renderQueue();
  saveQueue?.();
}

function setStatus(panel, text) {
  if (!panel) return;

  const status = panel.querySelector('#pq-status');
  if (status) {
    status.textContent = text;
  }
}
