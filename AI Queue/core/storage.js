// Storage persistence
function saveQueue(queue, failedQueue, storageKey = 'pq-queue-state') {
  try {
    const data = {
      queue: queue,
      failedQueue: failedQueue,
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
    log('queue saved to storage');
  } catch (err) {
    error('Failed to save queue:', err);
  }
}

function loadQueue(queue, failedQueue, storageKey = 'pq-queue-state') {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data.queue)) {
        queue.push(...data.queue);
      }
      if (Array.isArray(data.failedQueue) && failedQueue) {
        failedQueue.push(...data.failedQueue);
      }
      log('queue loaded from storage', queue.length, 'items');
    }
  } catch (err) {
    error('Failed to load queue:', err);
  }
}
