// Logging helpers
window.AIQueue = window.AIQueue || {};
window.AIQueue.logging = window.AIQueue.logging || {};

AIQueue.logging.log = function (...args) {
  if (!window.aiQueueDebug) return;
  console.log('[AI QUEUE]', ...args);
};

AIQueue.logging.error = function (...args) {
  console.error('[AI QUEUE]', ...args);
};

AIQueue.logging.throwError = function (...args) {
  AIQueue.logging.error(...args);
  throw new Error(args.join(' '));
};
