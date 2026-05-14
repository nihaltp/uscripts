export const queueState = {
  queue: [],
  failedQueue: [],
  running: false,
  editingId: null,
  draggedId: null,
};

export function resetQueueState({ includeFailedQueue = false } = {}) {
  queueState.queue.length = 0;
  if (includeFailedQueue) {
    queueState.failedQueue.length = 0;
  }

  queueState.running = false;
  queueState.editingId = null;
  queueState.draggedId = null;
}
