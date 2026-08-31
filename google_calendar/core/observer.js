import { log } from './logging.js';
import { processCalendar } from './dom.js';

let debounceTimer = null;

export function setupObserver() {
  log('Setting up MutationObserver...');
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processCalendar();
    }, 500);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
