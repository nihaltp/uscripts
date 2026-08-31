import { log } from './logging.js';
import { processCalendar } from './dom.js';

let debounceTimer = null;

export function setupObserver() {
  log('Setting up MutationObserver...');
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Pause observing while we mutate the DOM ourselves
      observer.disconnect();
      processCalendar();
      // Resume observing
      observer.observe(document.body, { childList: true, subtree: true });
    }, 500);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
