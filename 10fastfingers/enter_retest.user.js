// ==UserScript==
// @name         10FastFingers Retest on Enter
// @description  Hide AI-generated images on Pixabay.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%2010fastfingers%2Fenter_retest&body=File%3A%2010fastfingers%2Fenter_retest.user.js%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://10fastfingers.com/*
// @icon         https://10fastfingers.com/favicons/favicon.ico
// @version      1.0.0
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
    const btns = document.querySelectorAll('button[data-testid="TypingBox-reload"]');
    for (const btn of btns) {
      let insideTextPractice = false;
      let el = btn.parentElement;
      while (el) {
        if (el.tagName === 'DIV' && el.getAttribute('data-testid') === 'TextPractice-root') {
          insideTextPractice = true;
          break;
        }
        el = el.parentElement;
      }
      if (!insideTextPractice) {
        reloadBtn = btn;
        log("Found reload button");
        return;
      }
    }
    reloadBtn = null;
    log("Reload button not found");
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
