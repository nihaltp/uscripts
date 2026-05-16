window.aiQueueDebug = false; // Set to true to enable debug logging

function isDebugEnabled() {
  return Boolean(globalThis.aiQueueDebug);
}

export function log(...args) {
  const force = typeof args[args.length - 1] === 'boolean' ? args.pop() : false;
  if (!force && !isDebugEnabled()) return;
  console.log('[AI QUEUE]', ...args);
}

export function error(...args) {
  console.error('[AI QUEUE]', ...args);
}

export function throwError(...args) {
  error(...args);
  throw new Error(args.join(' '));
}
