// ==UserScript==
// @name         Pixabay Navigation using Arrow Keys
// @description  Navigate Pixabay search results using left and right arrow keys.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://pixabay.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixabay.com
// @version      1.0.0
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/pixabay/page_navigation.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/pixabay/page_navigation.user.js
// ==/UserScript==

(function () {
  'use strict';

  function isTyping() {
    const el = document.activeElement;
    return (
      el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable)
    );
  }

  function goNext() {
    const next = document.querySelector('a[rel="next"]');
    if (next) next.click();
  }

  function goPrev() {
    const prev = document.querySelector('a[rel="prev"]');
    if (prev) prev.click();
  }

  document.addEventListener('keydown', (e) => {
    if (isTyping()) return;

    if (e.key === 'ArrowRight') {
      goNext();
    } else if (e.key === 'ArrowLeft') {
      goPrev();
    }
  });
})();