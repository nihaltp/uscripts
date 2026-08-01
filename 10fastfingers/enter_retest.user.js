// ==UserScript==
// @name         10FastFingers Retest on Enter
// @description  Click Enter to press the retest button.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?template=10fastfingers_enter_retest.yml
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://10fastfingers.com/*
// @icon         https://10fastfingers.com/favicons/favicon.ico
// @version      1.0.1
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/10fastfingers/enter_retest.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/10fastfingers/enter_retest.user.js
// ==/UserScript==

(function () {
  'use strict';
  let reloadBtn = null;

  function log(...args) {
    console.log("[10FastFingers Retest]", ...args);
  }

  function findReloadButton() {
    // Removed check for "TypingBox-reload" in the DOM since typing tests doesn't need enter key while typing.
    const btn = document.querySelector('button[data-testid="TypingBox-reload"]');
    if (btn) {
      reloadBtn = btn;
      log("Found reload button");
    } else {
      reloadBtn = null;
      log("Reload button not found");
    }
  }

  // Listen for Enter key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && reloadBtn) {
      reloadBtn.click();
      log("Enter pressed, clicked reload button");
    }
  });

  // Initial check
  findReloadButton();
  // Observe DOM changes
  const observer = new MutationObserver(findReloadButton);
  observer.observe(document.body, { childList: true, subtree: true });
})();
