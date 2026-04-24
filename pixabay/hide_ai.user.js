// ==UserScript==
// @name         Pixabay Hide AI Images
// @description  Hide AI-generated images on Pixabay.
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
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/pixabay/hide_ai.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/pixabay/hide_ai.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const KEY = 'pixabay-hide-ai';
  let observer;

  const isAI = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const check = (v) => v && /\bai\b/i.test(v);
    return (
      check(el.getAttribute('aria-label')) ||
      check(el.getAttribute('title')) ||
      check(el.getAttribute('alt'))
    );
  };

  const hide = (el) => {
    let node = el;

    // climb up until we find a container with inline aspect-ratio padding
    while (node && node !== document.body) {
      const style = node.getAttribute?.('style') || '';

      // Pixabay uses padding-top for aspect ratio
      if (style.includes('padding-top')) break;

      node = node.parentElement;
    }

    if (!node || node.dataset.hideAi) return;

    node.style.display = 'none';
    node.dataset.hideAi = '1';
  };

  const unhideAll = () => {
    document.querySelectorAll('[data-hide-ai]').forEach(el => {
      el.style.display = '';
      delete el.dataset.hideAi;
    });
  };

  const process = (node) => {
    if (node.nodeType !== 1) return;

    // direct match
    if (isAI(node)) return hide(node);

    // specifically target AI icons
    const aiIcons = node.querySelectorAll?.('[aria-label="AI"]');
    if (aiIcons) {
      aiIcons.forEach(hide);
      return;
    }

    // fallback scan
    node.querySelectorAll?.('[aria-label],[title],[alt]').forEach(el => {
      if (isAI(el)) hide(el);
    });
  };

  const start = () => {
    if (observer) return;

    observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'attributes') process(m.target);
        m.addedNodes.forEach(process);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'alt']
    });

    process(document.body);
  };

  const stop = () => {
    observer?.disconnect();
    observer = null;
    unhideAll();
  };

  const btn = document.createElement('button');
  btn.textContent = localStorage.getItem(KEY) === '1' ? 'Hide AI: On' : 'Hide AI: Off';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    zIndex: 999999,
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '12px'
  });

  btn.onclick = () => {
    const on = localStorage.getItem(KEY) === '1';
    localStorage.setItem(KEY, on ? '0' : '1');
    btn.textContent = `Hide AI: ${on ? 'Off' : 'On'}`;
    on ? stop() : start();
  };

  window.addEventListener('popstate', () => {
    // Reset everything before Pixabay reuses DOM
    unhideAll();

    // Give Pixabay a moment to render restored content
    setTimeout(() => {
      if (localStorage.getItem(KEY) === '1') {
        start();
      }
    }, 150);
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[rel="prev"], a[rel="next"]');
    if (!link) return;

    unhideAll();

    // Wait until DOM actually changes
    const tempObserver = new MutationObserver(() => {
      tempObserver.disconnect();

      if (localStorage.getItem(KEY) === '1') {
        start();
      }
    });

    tempObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  document.body.appendChild(btn);

  if (localStorage.getItem(KEY) === '1') start();

})();