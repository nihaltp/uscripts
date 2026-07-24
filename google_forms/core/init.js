// core/init.js
import { FORM_READY_SELECTOR } from './constants.js';
import { log, error } from './logging.js';

const TIMEOUT_MS = 30_000; // bail after 30 s if the form never appears
const POLL_INTERVAL_MS = 300;

/**
 * Calls `callback` once the Google Form has finished rendering.
 *
 * Strategy:
 *  1. If the form container already exists in the DOM → call immediately.
 *  2. Otherwise attach a MutationObserver on document.body and wait.
 *  3. If the form still hasn't appeared after TIMEOUT_MS → give up silently.
 *
 * @param {() => void} callback
 */
export function waitForForm(callback) {
  // 1. Already rendered
  if (document.querySelector(FORM_READY_SELECTOR)) {
    log('form already rendered');
    callback();
    return;
  }

  // 2. Watch for it
  let observer = null;
  let timer = null;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    observer?.disconnect();
    clearTimeout(timer);
    callback();
  };

  const check = () => {
    if (document.querySelector(FORM_READY_SELECTOR)) {
      log('form appeared in DOM');
      finish();
    }
  };

  observer = new MutationObserver(check);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Also poll — MutationObserver can miss certain lazy-render patterns
  const pollId = setInterval(() => {
    if (done) {
      clearInterval(pollId);
      return;
    }
    check();
  }, POLL_INTERVAL_MS);

  // 3. Safety timeout
  timer = setTimeout(() => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearInterval(pollId);
    error('Timed out waiting for Google Form to render.');
  }, TIMEOUT_MS);
}
