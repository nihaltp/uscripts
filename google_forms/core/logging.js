// core/logging.js
import { DEBUG } from './constants.js';

const PREFIX = '[GF-Saver]';

/**
 * Debug-only log. No-op in release builds (DEBUG = false).
 * @param {...any} args
 */
export function log(...args) {
  if (DEBUG) console.log(PREFIX, ...args);
}

/**
 * Always-on error logger.
 * @param {...any} args
 */
export function error(...args) {
  console.error(PREFIX, ...args);
}
