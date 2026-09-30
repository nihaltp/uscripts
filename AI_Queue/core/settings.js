import { log, error } from './logging.js';

const STORAGE_KEY = 'pq-settings';

const DEFAULT_SETTINGS = {
  autoRetryEnabled: true,
  maxRetries: 1,
  retryLimitAction: 'stop', // 'stop' or 'continue'
};

export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch (err) {
    error('Failed to load settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    const normalized = {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    log('Settings saved:', normalized);
  } catch (err) {
    error('Failed to save settings:', err);
  }
}

export function getSettings() {
  return loadSettings();
}
