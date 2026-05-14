// ==UserScript==
// @name         ChatGPT Prompt Queue
// @description  Queue multiple prompts for ChatGPT
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?title=%5BBUG%5D%20AI%20Queue%2Fchatgpt.user.js&body=File%3A%20AI%20Queue%2Fmain%2Fchatgpt.user.js%0A%0ADescribe%20issue%20here...
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://chatgpt.com/favicon.ico
// @version      2.0.7
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
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/providers/chatgpt.js
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/main/chatgpt.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/AI Queue/main/chatgpt.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  window.aiQueueDebug = false;

  // Initialize state
  window.aiQueue = {
    queue: [],
    running: false,
    editingId: null,
    draggedId: null,
  };

  window.pqPanel = null;
  window.pqToolbarButton = null;
  window.pqPanelInitialized = false;
  window.isPanelVisible = false;

  // Setup panel controls (moved to core)
  function createChatGPTItem(text) {
    return {
      id: crypto.randomUUID(),
      prompt: text,
    };
  }

  // ChatGPT-specific queue processor
  async function processChatGPTQueue() {
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
      renderChatGPTQueue();

      AIQueue.queue.setStatus(window.pqPanel, `Sending: ${prompt.slice(0, 40)}...`);

      try {
        await sendPrompt(prompt);
        await waitForPromptProcessing();
      } catch (err) {
        AIQueue.logging.error('Failed to send prompt:', err.message);
      }

      saveChatGPTQueue();
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
  function ensureChatGPTToolbarButton() {
    AIQueue.ui.ensureToolbarStyles();

    if (!window.pqToolbarButton) {
      window.pqToolbarButton = document.createElement('button');
      window.pqToolbarButton.id = 'pq-toolbar-button';
      window.pqToolbarButton.type = 'button';
      window.pqToolbarButton.textContent = 'Queue';
      window.pqToolbarButton.addEventListener('click', () => {
        window.isPanelVisible = AIQueue.ui.togglePanel(window.pqPanel, window.isPanelVisible);
      });
    }

    const trailing = [...document.querySelectorAll('div')].find(
      el =>
        el.classList.contains('ms-auto') &&
        el.classList.contains('flex') &&
        el.classList.contains('items-center')
    );

    if (trailing) {
      window.pqToolbarButton.className =
        'text-token-text-secondary hover:text-token-text-primary inline-flex items-center gap-2 text-sm px-3 py-2 hover:bg-token-main-surface-secondary rounded-lg';
      Object.assign(window.pqToolbarButton.style, {
        position: '',
        bottom: '',
        right: '',
        left: '',
        zIndex: '',
      });

      if (!trailing.contains(window.pqToolbarButton)) {
        trailing.appendChild(window.pqToolbarButton);
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
    loadChatGPTQueue();
    createChatGPTPanel();
    setupPanelControls({
      createItem: createChatGPTItem,
      renderQueue: renderChatGPTQueue,
      saveQueue: saveChatGPTQueue,
      processQueue: processChatGPTQueue,
    });
    setupPanelDrag();
    renderChatGPTQueue();
    ensureChatGPTToolbarButton();
    AIQueue.ui.startDomObserver(
      createChatGPTPanel,
      () =>
        setupPanelControls({
          createItem: createChatGPTItem,
          renderQueue: renderChatGPTQueue,
          saveQueue: saveChatGPTQueue,
          processQueue: processChatGPTQueue,
        }),
      setupPanelDrag,
      ensureChatGPTToolbarButton,
      AIQueue.utils.isOwnMutation
    );
    AIQueue.ui.startUrlWatcher(
      createChatGPTPanel,
      () =>
        setupPanelControls({
          createItem: createChatGPTItem,
          renderQueue: renderChatGPTQueue,
          saveQueue: saveChatGPTQueue,
          processQueue: processChatGPTQueue,
        }),
      setupPanelDrag,
      ensureChatGPTToolbarButton
    );
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
