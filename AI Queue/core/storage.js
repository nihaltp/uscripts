import { error, log } from './logging.js';

const GLOBAL_CHAT_KEY = '__global__';
const DEFAULT_ITEM_STATUS = 'queued';
const DEFAULT_FAILED_STATUS = 'failed';

function toChatCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toChatKey(value) {
  return toChatCode(value) || GLOBAL_CHAT_KEY;
}

function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toCreatedAt(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function sanitizeItem(item, defaultStatus = DEFAULT_ITEM_STATUS) {
  if (!item || typeof item.prompt !== 'string') return null;

  return {
    id: typeof item.id === 'string' && item.id ? item.id : generateId(),
    prompt: item.prompt,
    attempts: Number.isFinite(Number(item.attempts)) ? Number(item.attempts) : 0,
    status: typeof item.status === 'string' && item.status.trim() ? item.status.trim() : defaultStatus,
    createdAt: toCreatedAt(item.createdAt),
  };
}

function sanitizeItems(items, defaultStatus = DEFAULT_ITEM_STATUS) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => sanitizeItem(item, defaultStatus)).filter(Boolean);
}

function emptyChats() {
  return {};
}

function sanitizeChatBuckets(chats) {
  const normalized = emptyChats();

  if (!chats || typeof chats !== 'object' || Array.isArray(chats)) {
    return normalized;
  }

  for (const [chatKey, bucket] of Object.entries(chats)) {
    normalized[toChatKey(chatKey)] = {
      items: sanitizeItems(bucket?.items, DEFAULT_ITEM_STATUS),
      failedItems: sanitizeItems(bucket?.failedItems, DEFAULT_FAILED_STATUS),
    };
  }

  return normalized;
}

function addLegacyItem(chats, item, defaultStatus, bucketName) {
  const normalizedItem = sanitizeItem(item, defaultStatus);
  if (!normalizedItem) return;

  const chatKey = toChatKey(item?.chatCode);
  if (!chats[chatKey]) {
    chats[chatKey] = { items: [], failedItems: [] };
  }

  chats[chatKey][bucketName].push(normalizedItem);
}

function buildLegacyData(parsed) {
  const chats = emptyChats();

  if (Array.isArray(parsed?.items)) {
    parsed.items.forEach((item) => addLegacyItem(chats, item, DEFAULT_ITEM_STATUS, 'items'));
  } else if (Array.isArray(parsed?.queue)) {
    parsed.queue.forEach((item) => addLegacyItem(chats, item, DEFAULT_ITEM_STATUS, 'items'));
  }

  if (Array.isArray(parsed?.failedItems)) {
    parsed.failedItems.forEach((item) => addLegacyItem(chats, item, DEFAULT_FAILED_STATUS, 'failedItems'));
  } else if (Array.isArray(parsed?.failedQueue)) {
    parsed.failedQueue.forEach((item) => addLegacyItem(chats, item, DEFAULT_FAILED_STATUS, 'failedItems'));
  }

  return { chats };
}

function normalizeData(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { chats: emptyChats() };
  }

  if (parsed.chats && typeof parsed.chats === 'object' && !Array.isArray(parsed.chats)) {
    return {
      chats: sanitizeChatBuckets(parsed.chats),
    };
  }

  return buildLegacyData(parsed);
}

export function readScopedQueueData(storageKey = 'pq-queue-state') {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return { chats: emptyChats() };
    }

    const parsed = JSON.parse(stored);
    return normalizeData(parsed);
  } catch (err) {
    error('Failed to read queue storage:', err);
    return { chats: emptyChats() };
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
    const chatKey = toChatKey(currentChatCode);
    const data = readScopedQueueData(storageKey);
    const existingBucket = data.chats[chatKey] || { items: [], failedItems: [] };

    const nextBucket = {
      items: sanitizeItems(queue || [], DEFAULT_ITEM_STATUS),
      failedItems: Array.isArray(failedQueue)
        ? sanitizeItems(failedQueue || [], DEFAULT_FAILED_STATUS)
        : sanitizeItems(existingBucket.failedItems, DEFAULT_FAILED_STATUS),
    };

    writeScopedQueueData(storageKey, {
      chats: {
        ...data.chats,
        [chatKey]: nextBucket,
      },
    });

    log('queue saved to storage', {
      storageKey,
      currentChatCode: chatKey,
      visibleItems: nextBucket.items.length,
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
    const chatKey = toChatKey(currentChatCode);
    const data = readScopedQueueData(storageKey);
    const bucket = data.chats[chatKey] || { items: [], failedItems: [] };

    queue.push(...bucket.items.map((item) => ({ ...item })));

    if (Array.isArray(failedQueue)) {
      failedQueue.push(...bucket.failedItems.map((item) => ({ ...item })));
    }

    log('queue loaded from storage', {
      storageKey,
      currentChatCode: chatKey,
      visibleItems: bucket.items.length,
    });
  } catch (err) {
    error('Failed to load queue:', err);
  }
}
