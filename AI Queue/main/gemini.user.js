// ==UserScript==
// @name         Gemini Prompt Queue
// @description  Queue multiple prompts for Gemini
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20AI%20Queue%2Fgemini.user.js&body=File%3A%20AI%20Queue%2Fmain%2Fgemini.user.js%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://gemini.google.com/app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @version      2.0.6
// @grant        none
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/logging.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/utils.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/dom.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/keyboard.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/generation.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/queue.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/storage.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/ui.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/panel.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/queue-ui.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/panel-controls.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/drag.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/exports.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/providers/gemini.js
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/main/gemini.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/main/gemini.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  window.aiQueueDebug = false;

  // Initialize state
  window.aiQueue = {
    queue: [],
    failedQueue: [],
    running: false,
    editingId: null,
    draggedId: null,
  };

  window.pqPanel = null;
  window.pqToolbarButton = null;
  window.pqPanelInitialized = false;
  window.isPanelVisible = false;

  // Setup panel controls (moved to core)
  function createGeminiItem(text) {
    return {
      id: crypto.randomUUID(),
      prompt: text,
      attempts: 0,
    };
  }

  // Gemini-specific queue processor
  async function processGeminiQueue() {
    AIQueue.queue.setStatus(window.pqPanel, 'Running');

    while (window.aiQueue.queue.length > 0 && window.aiQueue.running) {
      await waitForIdle();

      const item = window.aiQueue.queue.shift();
      const prompt = item.prompt;

      AIQueue.ui.updateToolbarButton(
        window.pqToolbarButton,
        window.aiQueue.queue,
        window.aiQueue.running
      );
      renderGeminiQueue();

      AIQueue.queue.setStatus(window.pqPanel, `Sending: ${prompt.slice(0, 40)}...`);

      try {
        await sendPrompt(prompt);
        await waitForPromptProcessing();
        item.attempts = 0;
      } catch (err) {
        AIQueue.logging.error('Failed to send prompt:', err.message);
        item.attempts = (item.attempts || 0) + 1;

        if (item.attempts < 3) {
          window.aiQueue.queue.push(item);
        } else {
          window.aiQueue.failedQueue.push(item);
        }
      }

      saveGeminiQueue();
    }

    if (!window.aiQueue.running) {
      AIQueue.queue.setStatus(window.pqPanel, 'Stopped');
    } else {
      AIQueue.queue.setStatus(window.pqPanel, 'Finished');
    }

    window.aiQueue.running = false;
    AIQueue.ui.updateToolbarButton(
      window.pqToolbarButton,
      window.aiQueue.queue,
      window.aiQueue.running
    );
  }

  // Ensure toolbar button
  function ensureGeminiToolbarButton() {
    AIQueue.ui.ensureToolbarStyles();

    if (!window.pqToolbarButton) {
      window.pqToolbarButton = document.createElement('button');
      window.pqToolbarButton.id = 'pq-toolbar-button';
      window.pqToolbarButton.classList.add('pq-toolbar');
      window.pqToolbarButton.type = 'button';
      window.pqToolbarButton.textContent = 'Queue';
      window.pqToolbarButton.addEventListener('click', () => {
        window.isPanelVisible = AIQueue.ui.togglePanel(window.pqPanel, window.isPanelVisible);
      });
    }

    const host = AIQueue.dom.getComposerHost();

    if (host === window.pqToolbarButton || (host && window.pqToolbarButton.contains(host))) {
      return;
    }

    if (
      host &&
      (host === AIQueue.dom.getComposerEditor() ||
        host.isContentEditable ||
        host.matches?.('[contenteditable="true"], textarea, input'))
    ) {
      return;
    }

    if (host) {
      window.pqToolbarButton.className = 'composer-btn h-9 min-h-9';
      Object.assign(window.pqToolbarButton.style, {
        position: '',
        bottom: '',
        right: '',
        left: '',
        zIndex: '',
        padding: '0 12px',
        borderRadius: '9999px',
        marginInlineStart: '8px',
        background: '#1f1f1f',
        color: '#fff',
        border: '1px solid #555',
        cursor: 'pointer',
      });

      if (!host.contains(window.pqToolbarButton)) {
        host.appendChild(window.pqToolbarButton);
      }

      return;
    }

    window.pqToolbarButton.className = '';
    Object.assign(window.pqToolbarButton.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      padding: '10px 14px',
      borderRadius: '9999px',
      background: '#1f1f1f',
      color: '#fff',
      border: '1px solid #555',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      zIndex: '2147483647',
      cursor: 'pointer',
    });

    if (window.pqToolbarButton.parentElement !== document.body) {
      document.body.appendChild(window.pqToolbarButton);
    }
  }

  // Initialize
  function init() {
    loadGeminiQueue();
    createGeminiPanel();
    setupPanelControls({
      createItem: createGeminiItem,
      renderQueue: renderGeminiQueue,
      saveQueue: saveGeminiQueue,
      processQueue: processGeminiQueue,
    });
    setupPanelDrag();
    renderGeminiQueue();
    ensureGeminiToolbarButton();
    AIQueue.ui.startDomObserver(
      createGeminiPanel,
      () =>
        setupPanelControls({
          createItem: createGeminiItem,
          renderQueue: renderGeminiQueue,
          saveQueue: saveGeminiQueue,
          processQueue: processGeminiQueue,
        }),
      setupPanelDrag,
      ensureGeminiToolbarButton,
      AIQueue.utils.isOwnMutation
    );
    AIQueue.ui.startUrlWatcher(
      createGeminiPanel,
      () =>
        setupPanelControls({
          createItem: createGeminiItem,
          renderQueue: renderGeminiQueue,
          saveQueue: saveGeminiQueue,
          processQueue: processGeminiQueue,
        }),
      setupPanelDrag,
      ensureGeminiToolbarButton
    );
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
