// DOM helpers exported to AIQueue.dom
window.AIQueue = window.AIQueue || {};
window.AIQueue.dom = window.AIQueue.dom || {};

AIQueue.dom.waitForCondition = function (
  predicate,
  { timeoutMs = 10000, intervalMs = 100, description = 'condition' } = {}
) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const result = await Promise.resolve(predicate());
        if (result) {
          resolve(result);
          return;
        }
      } catch (err) {
        AIQueue.logging.log('waitForCondition check error:', err);
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed > timeoutMs) {
        reject(new Error(`Timeout waiting for ${description} (${elapsed}ms)`));
        return;
      }

      setTimeout(check, intervalMs);
    };

    check();
  });
};

AIQueue.dom.waitForElement = function (getter, options = {}) {
  return AIQueue.dom.waitForCondition(() => getter(), options);
};

AIQueue.dom.safeClick = function (element) {
  if (!AIQueue.utils.isAttached(element) || !AIQueue.utils.isVisible(element)) return false;

  element.scrollIntoView({ block: 'center', inline: 'center' });
  element.focus?.({ preventScroll: true });

  if (typeof element.click === 'function') {
    element.click();
    return true;
  }

  element.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
  );
  element.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
  );
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
};

AIQueue.dom.getEditorText = function (editor) {
  if (!editor) return '';
  if ('value' in editor) return String(editor.value || '');
  return String(editor.textContent || '');
};

AIQueue.dom.isEditableCandidate = function (element) {
  if (!element) return false;
  if (!(element instanceof HTMLElement)) return false;
  if (!AIQueue.utils.isAttached(element)) return false;
  if (!AIQueue.utils.isVisible(element)) return false;

  const isTextarea = element instanceof HTMLTextAreaElement;
  const isContentEditable =
    element.isContentEditable || element.getAttribute('contenteditable') === 'true';

  if (!isTextarea && !isContentEditable) return false;
  if (element.matches('button, [role="button"], input[type="button"], input[type="submit"]'))
    return false;
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
  if (element.closest('#pq-panel')) return false;

  return true;
};

AIQueue.dom.scoreEditor = function (editor) {
  const rect = editor.getBoundingClientRect();
  let score = rect.top;

  if (editor === document.activeElement) score += 1000;
  if (editor.matches('textarea')) score += 100;
  if (editor.matches('[contenteditable="true"]')) score += 80;
  if ((editor.getAttribute('role') || '').toLowerCase() === 'textbox') score += 60;
  if (editor.closest('form')) score += 30;
  if (editor.closest('[role="form"]')) score += 20;
  if (rect.bottom > window.innerHeight * 0.5) score += 50;

  return score;
};

AIQueue.dom.getComposerEditor = function () {
  const activeElement = document.activeElement;

  if (AIQueue.dom.isEditableCandidate(activeElement)) {
    if (AIQueue.utils.isActionButtonElement(activeElement)) return null;
    AIQueue.logging.log('editor found', activeElement);
    return activeElement;
  }

  const candidates = [
    ...document.querySelectorAll(
      'textarea:not(#pq-input), [contenteditable="true"][role="textbox"], [contenteditable="true"]'
    ),
  ]
    .filter(AIQueue.dom.isEditableCandidate)
    .sort((left, right) => AIQueue.dom.scoreEditor(right) - AIQueue.dom.scoreEditor(left));

  candidates.forEach(candidate =>
    AIQueue.logging.log('editor candidate', candidate.tagName, candidate)
  );

  const editor = candidates[0] || null;
  if (editor && editor.matches('button, [role="button"]')) return null;
  if (editor) AIQueue.logging.log('editor found', editor);

  return editor;
};

AIQueue.dom.getComposerHost = function (editor = AIQueue.dom.getComposerEditor()) {
  if (!editor) return null;

  const host =
    editor.closest(
      'form, [role="form"], [aria-label*="prompt" i], [aria-label*="composer" i], [aria-label*="message" i], [data-testid*="prompt" i], [data-testid*="composer" i]'
    ) ||
    editor.parentElement ||
    null;

  if (!host || host === editor || editor.contains(host) || host.contains?.(editor)) return null;
  if (
    host.isContentEditable ||
    host.matches?.(
      '[contenteditable="true"], textarea, input, button, [role="button"], input[type="button"], input[type="submit"]'
    )
  )
    return null;

  return host;
};

AIQueue.dom.getButtonLabel = function (button) {
  return [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

AIQueue.dom.isActionButtonVisible = function (button) {
  return AIQueue.utils.isAttached(button) && AIQueue.utils.isVisible(button);
};

AIQueue.dom.getSendButton = function ({ includeDisabled = false } = {}) {
  const host = AIQueue.dom.getComposerHost();
  const selectors = [
    'button[data-testid="send-button"]',
    '[role="button"][data-testid="send-button"]',
    'button[aria-label*="Send" i]',
    'button[title*="Send" i]',
    '[role="button"][aria-label*="Send" i]',
    '[role="button"][title*="Send" i]',
  ];

  const candidates = [];
  for (const selector of selectors) {
    candidates.push(...document.querySelectorAll(selector));
  }

  if (host) {
    candidates.push(...host.querySelectorAll('button, [role="button"]'));
  }

  const button =
    candidates.find(candidate => {
      if (!candidate || !(candidate instanceof HTMLElement)) return false;
      if (!AIQueue.dom.isActionButtonVisible(candidate)) return false;

      const label = AIQueue.dom.getButtonLabel(candidate);
      const exactSend = candidate.matches('[data-testid="send-button"]');
      const looksLikeSend = /\bsend\b/i.test(label) || /\bsubmit\b/i.test(label);

      if (!exactSend && !looksLikeSend) return false;
      if (!includeDisabled && candidate.disabled) return false;

      return true;
    }) || null;

  if (button) AIQueue.logging.log('send button found', button);
  return button;
};

AIQueue.dom.findStopButton = function () {
  const selectors = [
    'button[data-testid="stop-button"]',
    '[role="button"][data-testid="stop-button"]',
    'button[aria-label*="Stop" i]',
    'button[title*="Stop" i]',
    '[role="button"][aria-label*="Stop" i]',
    '[role="button"][title*="Stop" i]',
  ];

  for (const selector of selectors) {
    const button =
      [...document.querySelectorAll(selector)].find(AIQueue.dom.isActionButtonVisible) || null;
    if (button) {
      AIQueue.logging.log('stop button found', button);
      return button;
    }
  }

  return null;
};

AIQueue.dom.hasBusyIndicators = function () {
  return [
    ...document.querySelectorAll('[aria-busy="true"], [data-loading="true"], [role="progressbar"]'),
  ].some(AIQueue.dom.isActionButtonVisible);
};
