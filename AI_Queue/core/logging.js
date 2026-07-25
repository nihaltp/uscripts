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

export function formatError(err) {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'string') {
    return err;
  }

  if (err && typeof err.message === 'string') {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function throwError(...args) {
  error(...args);
  throw new Error(args.join(' '));
}
