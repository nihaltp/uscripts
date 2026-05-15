import { error, log } from './logging.js';

function toChatCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeItem(item) {
  if (!item || typeof item.prompt !== 'string') return null;

  const normalized = {
    id: typeof item.id === 'string' && item.id ? item.id : generateId(),
    prompt: item.prompt,
  };

  if (item.attempts !== undefined) {
    const attempts = Number(item.attempts);
    if (Number.isFinite(attempts)) {
      normalized.attempts = attempts;
    }
  }

  const chatCode = toChatCode(item.chatCode);
  if (chatCode) {
    normalized.chatCode = chatCode;
  }

  return normalized;
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => sanitizeItem(item)).filter(Boolean);
}

function buildLegacyData(parsed) {
  return {
    items: sanitizeItems(parsed?.queue),
    failedItems: sanitizeItems(parsed?.failedQueue),
  };
}

function normalizeData(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { items: [], failedItems: [] };
  }

  // v2 shape
  if (Array.isArray(parsed.items) || Array.isArray(parsed.failedItems)) {
    return {
      items: sanitizeItems(parsed.items),
      failedItems: sanitizeItems(parsed.failedItems),
    };
  }

  // Legacy shape (queue + failedQueue)
  return buildLegacyData(parsed);
}

function matchesCurrentChat(item, currentChatCode) {
  const itemChatCode = toChatCode(item.chatCode);
  if (!itemChatCode) {
    return true;
  }
  if (!currentChatCode) {
    return false;
  }
  return itemChatCode === currentChatCode;
}

export function readScopedQueueData(storageKey = 'pq-queue-state') {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return { items: [], failedItems: [] };
    }

    const parsed = JSON.parse(stored);
    return normalizeData(parsed);
  } catch (err) {
    error('Failed to read queue storage:', err);
    return { items: [], failedItems: [] };
  }
}

export function writeScopedQueueData(storageKey = 'pq-queue-state', data = {}) {
  try {
    const normalized = normalizeData(data);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch (err) {
    error('Failed to write queue storage:', err);
  }
}

export function saveQueue(
  queue,
  failedQueue,
  storageKey = 'pq-queue-state',
  currentChatCode = null
) {
  try {
    const chatCode = toChatCode(currentChatCode);
    const data = readScopedQueueData(storageKey);

    const keepOtherChatItems = (item) => !matchesCurrentChat(item, chatCode);

    const visibleQueueItems = sanitizeItems(queue || []);
    const nextItems = [...data.items.filter(keepOtherChatItems), ...visibleQueueItems];

    let nextFailedItems = data.failedItems;
    if (Array.isArray(failedQueue)) {
      const visibleFailedItems = sanitizeItems(failedQueue || []);
      nextFailedItems = [...data.failedItems.filter(keepOtherChatItems), ...visibleFailedItems];
    }

    writeScopedQueueData(storageKey, {
      items: nextItems,
      failedItems: nextFailedItems,
    });

    log('queue saved to storage', {
      storageKey,
      currentChatCode: chatCode,
      visibleItems: visibleQueueItems.length,
    });
  } catch (err) {
    error('Failed to save queue:', err);
  }
}

export function loadQueue(
  queue,
  failedQueue,
  storageKey = 'pq-queue-state',
  currentChatCode = null
) {
  try {
    const chatCode = toChatCode(currentChatCode);
    const data = readScopedQueueData(storageKey);

    const visibleQueueItems = data.items
      .filter((item) => matchesCurrentChat(item, chatCode))
      .map((item) => ({ ...item }));

    queue.push(...visibleQueueItems);

    if (Array.isArray(failedQueue)) {
      const visibleFailedItems = data.failedItems
        .filter((item) => matchesCurrentChat(item, chatCode))
        .map((item) => ({ ...item }));
      failedQueue.push(...visibleFailedItems);
    }

    log('queue loaded from storage', {
      storageKey,
      currentChatCode: chatCode,
      visibleItems: visibleQueueItems.length,
    });
  } catch (err) {
    error('Failed to load queue:', err);
  }
}
