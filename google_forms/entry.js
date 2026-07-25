// entry.js — userscript entry point
import { waitForForm } from './core/init.js';
import { getFormId } from './core/storage.js';
import { createFloatingButton, autoLoadIfSingleSave } from './core/ui.js';
import { log, error } from './core/logging.js';

// ── SPA navigation watcher ────────────────────────────────────────────────────
// Google Forms navigates between form pages via history.pushState (no full
// reload).  We patch pushState and listen for popstate so we can re-initialise
// whenever the URL changes to a new form page.

let lastInitUrl = '';

function init() {
  const href = location.href;
  if (href === lastInitUrl) return; // already initialised for this URL
  lastInitUrl = href;

  const formId = getFormId(href);
  if (!formId) {
    log('no form ID in URL, skipping init');
    return;
  }

  log('initialising for', href, '— form ID:', formId);

  waitForForm(() => {
    log('form ready — injecting/refreshing UI');
    createFloatingButton(formId);
    autoLoadIfSingleSave(formId);
  });
}

// Patch pushState AND replaceState so we catch all programmatic navigations
(function patchHistory() {
  function onNav() {
    setTimeout(init, 300);
  }

  const origPush = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPush(...args);
    onNav();
  };

  const origReplace = history.replaceState.bind(history);
  history.replaceState = function (...args) {
    origReplace(...args);
    onNav();
  };

  window.addEventListener('popstate', onNav);
})();

// Run on initial load
init();
