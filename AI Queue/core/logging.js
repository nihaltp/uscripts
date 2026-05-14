function isDebugEnabled() {
  return Boolean(globalThis.aiQueueDebug);
}

export function log(...args) {
  if (!isDebugEnabled()) return;
  console.log('[AI QUEUE]', ...args);
}

export function error(...args) {
  console.error('[AI QUEUE]', ...args);
}

export function throwError(...args) {
  error(...args);
  throw new Error(args.join(' '));
}
