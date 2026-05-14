// Generation state detection
let lastGenerationLabel = '';

function getGenerationState() {
  const editor = AIQueue.dom.getComposerEditor();
  const sendButton = AIQueue.dom.getSendButton({ includeDisabled: true });
  const stopButton = AIQueue.dom.findStopButton();
  const hasPrompt = !!AIQueue.dom.getEditorText(editor).trim();
  const busyIndicators = AIQueue.dom.hasBusyIndicators();
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
    AIQueue.logging.log('generation state', {
      generating,
      hasPrompt,
      busyIndicators,
      sendDisabled: !!(sendButton && sendButton.disabled),
      stopButton: !!stopButton,
    });
  }

  return { generating, editor, sendButton, stopButton, busyIndicators, hasPrompt };
}

function isGenerating() {
  return getGenerationState().generating;
}

// Wait for idle
async function waitForIdle({ timeoutMs = 60000, intervalMs = 200 } = {}) {
  try {
    await AIQueue.dom.waitForCondition(
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

    await AIQueue.utils.sleep(300);
  } catch (err) {
    AIQueue.logging.log('waitForIdle timed out:', err.message);
    await AIQueue.utils.sleep(300);
  }
}

// Wait for generation start
async function waitForGenerationStart({ timeoutMs = 8000, intervalMs = 100 } = {}) {
  return AIQueue.dom.waitForCondition(() => getGenerationState().generating, {
    timeoutMs,
    intervalMs,
    description: 'Generation to start',
  });
}

// Wait for prompt processing
async function waitForPromptProcessing() {
  try {
    await waitForGenerationStart();
  } catch (err) {
    AIQueue.logging.log('Generation did not start:', err.message);
  }

  await waitForIdle();
}
