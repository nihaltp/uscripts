// Storage persistence
function saveQueue(queue, failedQueue, storageKey = 'pq-queue-state') {
  try {
    const data = {
      queue: queue,
      failedQueue: failedQueue,
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
    AIQueue.logging.log('queue saved to storage');
  } catch (err) {
    AIQueue.logging.error('Failed to save queue:', err);
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
      AIQueue.logging.log('queue loaded from storage', queue.length, 'items');
    }
  } catch (err) {
    AIQueue.logging.error('Failed to load queue:', err);
  }
}
