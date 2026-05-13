// Logging helpers
function log(...args) {
  if (!window.aiQueueDebug) return;
  console.log('[AI QUEUE]', ...args);
}

function error(...args) {
  console.error('[AI QUEUE]', ...args);
}

function throwError(...args) {
  error(...args);
  throw new Error(args.join(' '));
}
