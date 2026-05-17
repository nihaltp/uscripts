import { error, log } from './logging.js';

const GLOBAL_CHAT_KEY = '__global__';
const DEFAULT_ITEM_STATUS = 'queued';
const DEFAULT_FAILED_STATUS = 'failed';

function toChatCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function resolveScope(currentScope = null) {
  if (typeof currentScope === 'string') {
    return {
      chatId: toChatCode(currentScope),
      groupId: null,
    };
  }

  if (!currentScope || typeof currentScope !== 'object') {
    return {
      chatId: null,
      groupId: null,
    };
  }

  const chatId = toChatCode(currentScope.chatId || currentScope.chatCode || null);
  const groupId = toChatCode(currentScope.groupId || null);

  return {
    chatId,
    groupId,
  };
}

function resolveScopeKeys(currentScope = null) {
  const scope = resolveScope(currentScope);
  return [...new Set([scope.groupId, scope.chatId].filter(Boolean))];
}

function hasItemScope(item) {
  return !!(item?.chatId || item?.chatCode || item?.groupId);
}

export function applyScopeToQueuedItems(queue, failedQueue, currentScope = null) {
  const scope = resolveScope(currentScope);
  if (!scope.chatId && !scope.groupId) return false;

  let updated = false;

  const applyScope = (item) => {
    if (!item || hasItemScope(item)) return;

    if (scope.chatId) {
      item.chatId = scope.chatId;
      item.chatCode = scope.chatId;
    }

    if (scope.groupId) {
      item.groupId = scope.groupId;
    }

    updated = true;
  };

  (queue || []).forEach(applyScope);

  if (Array.isArray(failedQueue)) {
    failedQueue.forEach(applyScope);
  }

  return updated;
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

  const chatId = toChatCode(item.chatId || item.chatCode || null);
  const groupId = toChatCode(item.groupId || null);

  const normalized = {
    id: typeof item.id === 'string' && item.id ? item.id : generateId(),
    prompt: item.prompt,
    attempts: Number.isFinite(Number(item.attempts)) ? Number(item.attempts) : 0,
    status: typeof item.status === 'string' && item.status.trim() ? item.status.trim() : defaultStatus,
    createdAt: toCreatedAt(item.createdAt),
  };

  if (chatId) {
    normalized.chatId = chatId;
    normalized.chatCode = chatId;
  }

  if (groupId) {
    normalized.groupId = groupId;
  }

  return normalized;
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

function mergeUniqueItems(itemsA, itemsB) {
  const merged = new Map();

  [...(itemsA || []), ...(itemsB || [])].forEach((item) => {
    if (!item || typeof item.id !== 'string') return;
    if (!merged.has(item.id)) {
      merged.set(item.id, { ...item });
    }
  });

  return [...merged.values()];
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
  currentScope = null
) {
  try {
    const scope = resolveScope(currentScope);
    const scopeKeys = resolveScopeKeys(currentScope);
    const data = readScopedQueueData(storageKey);
    const existingBuckets = scopeKeys.map((scopeKey) => data.chats[scopeKey] || { items: [], failedItems: [] });

    const nextItems = sanitizeItems(queue || [], DEFAULT_ITEM_STATUS).map((item) => ({
      ...item,
      ...(scope.chatId
        ? {
            chatId: scope.chatId,
            chatCode: scope.chatId,
          }
        : {}),
      ...(scope.groupId ? { groupId: scope.groupId } : {}),
    }));

    const nextFailedItems = Array.isArray(failedQueue)
      ? sanitizeItems(failedQueue || [], DEFAULT_FAILED_STATUS).map((item) => ({
          ...item,
          ...(scope.chatId
            ? {
                chatId: scope.chatId,
                chatCode: scope.chatId,
              }
            : {}),
          ...(scope.groupId ? { groupId: scope.groupId } : {}),
        }))
      : mergeUniqueItems(
          ...existingBuckets.map((bucket) => sanitizeItems(bucket.failedItems, DEFAULT_FAILED_STATUS))
        );

    const nextBucket = {
      items: nextItems,
      failedItems: nextFailedItems,
    };

    const nextChats = { ...data.chats };
    scopeKeys.forEach((scopeKey) => {
      nextChats[scopeKey] = {
        items: nextItems.map((item) => ({ ...item })),
        failedItems: nextFailedItems.map((item) => ({ ...item })),
      };
    });

    writeScopedQueueData(storageKey, {
      chats: nextChats,
    });

    log('queue saved to storage', {
      storageKey,
      currentChatCode: scopeKeys,
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
  currentScope = null
) {
  try {
    const scopeKeys = resolveScopeKeys(currentScope);
    const data = readScopedQueueData(storageKey);
    const buckets = scopeKeys.map((scopeKey) => data.chats[scopeKey] || { items: [], failedItems: [] });

    const visibleQueueItems = mergeUniqueItems(
      ...buckets.map((bucket) => bucket.items)
    );
    queue.push(...visibleQueueItems.map((item) => ({ ...item })));

    if (Array.isArray(failedQueue)) {
      const visibleFailedItems = mergeUniqueItems(
        ...buckets.map((bucket) => bucket.failedItems)
      );
      failedQueue.push(...visibleFailedItems.map((item) => ({ ...item })));
    }

    log('queue loaded from storage', {
      storageKey,
      currentChatCode: scopeKeys,
      visibleItems: visibleQueueItems.length,
    });
  } catch (err) {
    error('Failed to load queue:', err);
  }
}
