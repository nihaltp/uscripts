import { error, throwError, formatError } from './logging.js';
import { isAttached } from './utils.js';
import {
  getComposerEditor,
  getSendButton,
  safeClick,
  waitForCondition,
  waitForElement,
} from './dom.js';
import { waitForPromptProcessing } from './generation.js';

function isScrollableElement(element) {
  if (!element || !(element instanceof HTMLElement)) return false;

  const style = window.getComputedStyle(element);
  if (!style) return false;

  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const canScrollY = /(auto|scroll|overlay)/i.test(overflowY) && element.scrollHeight > element.clientHeight;
  const canScrollX = /(auto|scroll|overlay)/i.test(overflowX) && element.scrollWidth > element.clientWidth;

  return canScrollY || canScrollX;
}

function getScrollTargets(element) {
  const targets = [];
  const seen = new Set();

  const addTarget = (target) => {
    if (!target || seen.has(target)) return;
    seen.add(target);
    targets.push(target);
  };

  addTarget(window);

  const scrollingElement = document.scrollingElement || document.documentElement;
  if (scrollingElement) {
    addTarget(scrollingElement);
  }

  if (document.body) {
    addTarget(document.body);
  }

  let current = element?.parentElement || null;
  while (current) {
    if (isScrollableElement(current)) {
      addTarget(current);
    }
    current = current.parentElement;
  }

  const root = document.body || document.documentElement;
  if (root) {
    for (const candidate of root.querySelectorAll('*')) {
      if (isScrollableElement(candidate)) {
        addTarget(candidate);
      }
    }
  }

  return targets;
}

function getScrollPosition(target) {
  if (target === window) {
    return { x: window.scrollX, y: window.scrollY };
  }

  return {
    x: target.scrollLeft,
    y: target.scrollTop,
  };
}

function restoreScrollPosition(target, position) {
  if (target === window) {
    window.scrollTo(position.x, position.y);
    return;
  }

  target.scrollLeft = position.x;
  target.scrollTop = position.y;
}

export async function withPreservedViewport(action, targets = []) {
  const scrollTargets = targets.length > 0 ? targets : [window];
  const scrollPositions = new Map(scrollTargets.map((target) => [target, getScrollPosition(target)]));
  const originalAnchors = new Map();
  let restoring = false;

  for (const target of scrollTargets) {
    if (target instanceof HTMLElement) {
      originalAnchors.set(target, target.style.overflowAnchor);
      target.style.overflowAnchor = 'none';
    }
  }

  const restoreScroll = () => {
    if (restoring) return;

    restoring = true;
    for (const target of scrollTargets) {
      const position = scrollPositions.get(target);
      if (!position) continue;

      const currentPosition = getScrollPosition(target);
      if (currentPosition.x === position.x && currentPosition.y === position.y) continue;

      restoreScrollPosition(target, position);
    }
    restoring = false;
  };

  const keepViewportStable = () => {
    restoreScroll();
  };

  window.addEventListener('scroll', keepViewportStable, true);
  window.addEventListener('resize', keepViewportStable);
  const restoreTimer = window.setInterval(restoreScroll, 50);

  try {
    return await action();
  } finally {
    window.clearInterval(restoreTimer);
    window.removeEventListener('scroll', keepViewportStable, true);
    window.removeEventListener('resize', keepViewportStable);

    for (const target of scrollTargets) {
      if (target instanceof HTMLElement && originalAnchors.has(target)) {
        target.style.overflowAnchor = originalAnchors.get(target);
      }
    }

    restoreScroll();
  }
}

export function dispatchEnterKey(target) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
  };

  for (const type of ['keydown', 'keypress', 'keyup']) {
    target.dispatchEvent(new KeyboardEvent(type, eventInit));
  }
}

// Set editor value
export function setEditorValue(editor, prompt) {
  if (!editor) throwError('Editor not found');
  if (!isAttached(editor)) throwError('Editor is detached');

  editor.focus?.({ preventScroll: true });

  if ('value' in editor) {
    const setter =
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    if (setter) {
      setter.call(editor, prompt);
    } else {
      editor.value = prompt;
    }

    if ('selectionStart' in editor) {
      editor.selectionStart = editor.selectionEnd = editor.value.length;
    }

    editor.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: prompt,
      })
    );

    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: prompt,
      })
    );

    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (editor.isContentEditable) {
    editor.focus?.({ preventScroll: true });
    const selection = window.getSelection();

    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('delete', false);
    }

    editor.textContent = prompt;
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: prompt,
      })
    );
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  throwError('Unsupported editor type');
}

// Send prompt
export async function sendPrompt(prompt) {
  const editor = await waitForElement(() => getComposerEditor(), {
    timeoutMs: 15000,
    intervalMs: 200,
    description: 'Composer editor',
  });

  const scrollTargets = getScrollTargets(editor);

  return withPreservedViewport(async () => {
    setEditorValue(editor, prompt);

    try {
      await waitForCondition(
        () => {
          const btn = getSendButton();
          return btn && !btn.disabled;
        },
        {
          timeoutMs: 5000,
          intervalMs: 100,
          description: 'send button to enable',
        }
      );

      const sendButton = getSendButton();
      if (sendButton) {
        safeClick(sendButton);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await waitForPromptProcessing();
        return;
      }
    } catch (err) {
      error('send button unavailable, falling back to Enter', formatError(err));
    }

    dispatchEnterKey(editor);
    if (editor.form && typeof editor.form.requestSubmit === 'function') {
      editor.form.requestSubmit();
    }

    await waitForPromptProcessing();
  }, scrollTargets);
}
