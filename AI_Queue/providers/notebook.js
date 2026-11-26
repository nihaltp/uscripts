import { createProvider } from './provider-base.js';
import { bootstrapQueueApp } from '../core/bootstrap.js';

const STORAGE_KEY = 'pq-notebook-queue';
const DOMAINS = ['notebook.google.com', 'notebooklm.google.com'];

function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getCurrentNotebookScope(url = globalThis.location?.href || '') {
  try {
    const parsedUrl = new URL(url, globalThis.location?.origin || 'https://example.com');
    if (!DOMAINS.includes(parsedUrl.hostname.toLowerCase())) {
      return null;
    }

    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments[0] !== 'notebook') return null;
    return normalizeCode(segments[1]);
  } catch {
    return null;
  }
}

export const notebookProvider = createProvider({
  storageKey: STORAGE_KEY,
  panelTitle: 'Gemini Notebook Prompt Queue',
  getCurrentScope: getCurrentNotebookScope,
  includeFailedQueue: true,
  maxRetries: 3,
  toolbarButtonClass: 'pq-toolbar',
});

bootstrapQueueApp(notebookProvider);
