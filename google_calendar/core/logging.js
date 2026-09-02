window.gcalMultidayDebug = false; // Set to true to enable debug logging

export function log(...args) {
  if (window.gcalMultidayDebug) {
    console.log('[GCAL MULTIDAY]', ...args);
  }
}

export function error(...args) {
  console.error('[GCAL MULTIDAY]', ...args);
}
