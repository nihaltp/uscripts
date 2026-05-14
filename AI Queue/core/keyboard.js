// Keyboard event helpers
function dispatchEnterKey(target) {
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
function setEditorValue(editor, prompt) {
  if (!editor) throwError('Editor not found');
  if (!AIQueue.utils.isAttached(editor)) AIQueue.logging.throwError('Editor is detached');

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
async function sendPrompt(prompt) {
  const editor = await AIQueue.dom.waitForElement(() => AIQueue.dom.getComposerEditor(), {
    timeoutMs: 15000,
    intervalMs: 200,
    description: 'Composer editor',
  });

  setEditorValue(editor, prompt);

  try {
    await AIQueue.dom.waitForCondition(
      () => {
        const btn = AIQueue.dom.getSendButton();
        return btn && !btn.disabled;
      },
      {
        timeoutMs: 5000,
        intervalMs: 100,
        description: 'send button to enable',
      }
    );

    const sendButton = AIQueue.dom.getSendButton();
    if (sendButton) {
      AIQueue.dom.safeClick(sendButton);
      await AIQueue.utils.sleep(100);
    }
  } catch (err) {
    AIQueue.logging.log('send button unavailable, falling back to Enter', err.message);
  }

  dispatchEnterKey(editor);
  if (editor.form && typeof editor.form.requestSubmit === 'function') {
    editor.form.requestSubmit();
  }
}
