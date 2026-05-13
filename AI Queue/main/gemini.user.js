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
// @version      2.0.2
// @grant        none
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/logging.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/utils.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/dom.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/keyboard.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/generation.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/queue.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/storage.js
// @require      https://raw.githubusercontent.com/nihaltp/uscripts/main/AI%20Queue/core/ui.js
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

  // Setup panel events
  function setupPanelEvents() {
    const input = window.pqPanel.querySelector('#pq-input');
    const addBtn = window.pqPanel.querySelector('#pq-add');
    const startBtn = window.pqPanel.querySelector('#pq-start');
    const stopBtn = window.pqPanel.querySelector('#pq-stop');

    window.pqInput = input;
    window.pqAddBtn = addBtn;

    const handleAddClick = () => {
      const text = input.value.trim();

      if (!text) {
        error('Empty prompt, not adding to queue');
        return;
      }

      if (window.aiQueue.editingId !== null) {
        const item = window.aiQueue.queue.find(item => item.id === window.aiQueue.editingId);

        if (!item) {
          error('Editing item not found in queue:', window.aiQueue.editingId);
          return;
        }

        item.prompt = text;
        window.aiQueue.editingId = null;
        addBtn.textContent = 'Add To Queue';
      } else {
        window.aiQueue.queue.push({
          id: crypto.randomUUID(),
          prompt: text,
          attempts: 0,
        });
      }

      updateToolbarButton(window.pqToolbarButton, window.aiQueue.queue, window.aiQueue.running);
      input.value = '';
      renderGeminiQueue();
      saveGeminiQueue();
    };

    addBtn.addEventListener('click', handleAddClick);

    input.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddClick();
      }
    });

    function updateStartStopButtons() {
      if (!startBtn || !stopBtn) return;
      startBtn.disabled = window.aiQueue.running;
      stopBtn.style.display = window.aiQueue.running ? 'block' : 'none';
    }

    startBtn.addEventListener('click', async () => {
      if (window.aiQueue.running) return;

      window.aiQueue.running = true;
      updateStartStopButtons();
      updateToolbarButton(window.pqToolbarButton, window.aiQueue.queue, window.aiQueue.running);
      processGeminiQueue();
    });

    stopBtn?.addEventListener('click', () => {
      if (!window.aiQueue.running) return;
      window.aiQueue.running = false;
      setStatus(window.pqPanel, 'Stopped');
      updateStartStopButtons();
      updateToolbarButton(window.pqToolbarButton, window.aiQueue.queue, window.aiQueue.running);
    });
  }

  // Gemini-specific queue processor
  async function processGeminiQueue() {
    setStatus(window.pqPanel, 'Running');

    while (window.aiQueue.queue.length > 0 && window.aiQueue.running) {
      await waitForIdle();

      const item = window.aiQueue.queue.shift();
      const prompt = item.prompt;

      updateToolbarButton(window.pqToolbarButton, window.aiQueue.queue, window.aiQueue.running);
      renderGeminiQueue();

      setStatus(window.pqPanel, `Sending: ${prompt.slice(0, 40)}...`);

      try {
        await sendPrompt(prompt);
        await waitForPromptProcessing();
        item.attempts = 0;
      } catch (err) {
        error('Failed to send prompt:', err.message);
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
      setStatus(window.pqPanel, 'Stopped');
    } else {
      setStatus(window.pqPanel, 'Finished');
    }

    window.aiQueue.running = false;
    const stopBtnRef = window.pqPanel?.querySelector('#pq-stop');
    if (stopBtnRef) stopBtnRef.style.display = 'none';
    updateToolbarButton(window.pqToolbarButton, window.aiQueue.queue, window.aiQueue.running);
  }

  // Ensure toolbar button
  function ensureGeminiToolbarButton() {
    ensureToolbarStyles();

    if (!window.pqToolbarButton) {
      window.pqToolbarButton = document.createElement('button');
      window.pqToolbarButton.id = 'pq-toolbar-button';
      window.pqToolbarButton.classList.add('pq-toolbar');
      window.pqToolbarButton.type = 'button';
      window.pqToolbarButton.textContent = 'Queue';
      window.pqToolbarButton.addEventListener('click', () => {
        window.isPanelVisible = togglePanel(window.pqPanel, window.isPanelVisible);
      });
    }

    const host = getComposerHost();

    if (host === window.pqToolbarButton || (host && window.pqToolbarButton.contains(host))) {
      return;
    }

    if (
      host &&
      (host === getComposerEditor() ||
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
    setupPanelEvents();
    setupGeminiPanelDrag();
    renderGeminiQueue();
    ensureGeminiToolbarButton();
    startDomObserver(
      createGeminiPanel,
      setupPanelEvents,
      setupGeminiPanelDrag,
      ensureGeminiToolbarButton,
      isOwnMutation
    );
    startUrlWatcher(
      createGeminiPanel,
      setupPanelEvents,
      setupGeminiPanelDrag,
      ensureGeminiToolbarButton
    );
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
