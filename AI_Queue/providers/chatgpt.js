import { createProvider } from './provider-base.js';
import { bootstrapQueueApp } from '../core/bootstrap.js';
import { error } from '../core/logging.js';

const STORAGE_KEY = 'pq-chatgpt-queue';
const DOMAINS = ['chatgpt.com', 'chat.openai.com'];

function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getCurrentChatGPTScope(url = globalThis.location?.href || '') {
  try {
    const parsedUrl = new URL(url, globalThis.location?.origin || 'https://example.com');
    const host = parsedUrl.hostname.toLowerCase();
    if (!DOMAINS.includes(host)) {
      return null;
    }

    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments[0] === 'g' && segments[2] === 'c') {
      return {
        groupId: normalizeCode(segments[1]),
        chatId: normalizeCode(segments[3]),
      };
    }

    if (segments[0] === 'c') {
      return {
        chatId: normalizeCode(segments[1]),
      };
    }

    return null;
  } catch (err) {
    error('Failed to parse URL for chat code:', err.message);
    return null;
  }
}

export const chatgptProvider = createProvider({
  storageKey: STORAGE_KEY,
  panelTitle: 'ChatGPT Prompt Queue',
  getCurrentScope: getCurrentChatGPTScope,
  includeFailedQueue: false,
  maxRetries: 0,
});

bootstrapQueueApp(chatgptProvider);
