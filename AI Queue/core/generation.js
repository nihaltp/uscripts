import { log } from './logging.js';
import {
  findStopButton,
  getComposerEditor,
  getEditorText,
  getSendButton,
  hasBusyIndicators,
  waitForCondition,
} from './dom.js';
import { sleep } from './utils.js';

let lastGenerationLabel = '';

export function getGenerationState() {
  const editor = getComposerEditor();
  const sendButton = getSendButton({ includeDisabled: true });
  const stopButton = findStopButton();
  const hasPrompt = !!getEditorText(editor).trim();
  const busyIndicators = hasBusyIndicators();
  const generating = Boolean(
    stopButton || busyIndicators || (sendButton && sendButton.disabled && hasPrompt)
  );

  const label = JSON.stringify({
    generating,
    hasPrompt,
    busyIndicators,
    sendDisabled: !!(sendButton && sendButton.disabled),
    stopButton: !!stopButton,
  });

  if (label !== lastGenerationLabel) {
    lastGenerationLabel = label;
    log('generation state', {
      generating,
      hasPrompt,
      busyIndicators,
      sendDisabled: !!(sendButton && sendButton.disabled),
      stopButton: !!stopButton,
    });
  }

  return { generating, editor, sendButton, stopButton, busyIndicators, hasPrompt };
}

export function isGenerating() {
  return getGenerationState().generating;
}

// Wait for idle
export async function waitForIdle({ timeoutMs = 60000, intervalMs = 200 } = {}) {
  try {
    await waitForCondition(
      async () => {
        const { generating } = getGenerationState();
        return !generating;
      },
      {
        timeoutMs,
        intervalMs,
        description: 'AI to become idle',
      }
    );

    await sleep(300);
  } catch (err) {
    log('waitForIdle timed out:', err.message);
    await sleep(300);
  }
}

// Wait for generation start
export async function waitForGenerationStart({ timeoutMs = 8000, intervalMs = 100 } = {}) {
  return waitForCondition(() => getGenerationState().generating, {
    timeoutMs,
    intervalMs,
    description: 'Generation to start',
  });
}

// Wait for prompt processing
export async function waitForPromptProcessing() {
  try {
    await waitForGenerationStart();
  } catch (err) {
    log('Generation did not start:', err.message);
  }

  await waitForIdle();
}
