// Queue management exported to AIQueue.queue
window.AIQueue = window.AIQueue || {};
window.AIQueue.queue = window.AIQueue.queue || {};

AIQueue.queue.deleteQueueItem = function (id, queue, renderQueue, saveQueue) {
  const index = queue.findIndex(item => item.id === id);

  if (index === -1) {
    AIQueue.logging.error('Item to delete not found in queue:', id);
    return;
  }

  queue.splice(index, 1);
  renderQueue();
  saveQueue?.();
};

AIQueue.queue.editQueueItem = function (id, queue, updateUI) {
  const item = queue.find(item => item.id === id);

  if (!item) {
    AIQueue.logging.error('Item to edit not found in queue:', id);
    return;
  }

  updateUI(id, item.prompt);
};

AIQueue.queue.moveQueueItem = function (fromId, toId, queue, renderQueue, saveQueue) {
  const fromIndex = queue.findIndex(item => item.id === fromId);
  const toIndex = queue.findIndex(item => item.id === toId);

  if (fromIndex === -1 || toIndex === -1) return;

  const [movedItem] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, movedItem);

  renderQueue();
  saveQueue?.();
};

AIQueue.queue.setStatus = function (panel, text) {
  if (!panel) return;

  const status = panel.querySelector('#pq-status');
  if (status) {
    status.textContent = text;
  }
};
