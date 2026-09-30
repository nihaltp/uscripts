import { createProvider } from './provider-base.js';
import { bootstrapQueueApp } from '../core/bootstrap.js';

const STORAGE_KEY = 'pq-gemini-queue';
const DOMAINS = ['gemini.google.com'];

function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getCurrentGeminiChatCode(url = globalThis.location?.href || '') {
  try {
    const parsedUrl = new URL(url, globalThis.location?.origin || 'https://example.com');
    if (!DOMAINS.includes(parsedUrl.hostname.toLowerCase())) {
      return null;
    }

    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments[0] !== 'app') return null;
    return normalizeCode(segments[1]);
  } catch {
    return null;
  }
}

export const geminiProvider = createProvider({
  storageKey: STORAGE_KEY,
  panelTitle: 'Gemini Prompt Queue',
  getCurrentScope: getCurrentGeminiChatCode,
  includeFailedQueue: true,
  maxRetries: 3,
  toolbarButtonClass: 'pq-toolbar',
});

bootstrapQueueApp(geminiProvider);
