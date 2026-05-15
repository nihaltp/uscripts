import { error, log } from './logging.js';

export function saveQueue(queue, failedQueue, storageKey = 'pq-queue-state') {
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

export function loadQueue(queue, failedQueue, storageKey = 'pq-queue-state') {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data.queue)) {
        queue.push(
          ...data.queue.filter((item) => item && typeof item.prompt === 'string')
        );
      }
      if (Array.isArray(data.failedQueue) && failedQueue) {
        failedQueue.push(
          ...data.failedQueue.filter((item) => item && typeof item.prompt === 'string')
        );
      }
      log('queue loaded from storage', queue.length, 'items');
    }
  } catch (err) {
    error('Failed to load queue:', err);
  }
}
