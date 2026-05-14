import { error } from './logging.js';
import { setStatus } from './queue.js';
import { updateToolbarButton, getPanel } from './ui.js';
import { queueState } from './state.js';

export function setupPanelControls({ createItem, renderQueue, saveQueue, processQueue }) {
  const panel = getPanel();
  if (!panel) return;

  const input = panel.querySelector('#pq-input');
  const addBtn = panel.querySelector('#pq-add');
  const startBtn = panel.querySelector('#pq-start');

  const getToolbarButton = () => document.querySelector('#pq-toolbar-button');

  const handleAddClick = () => {
    const text = input.value.trim();

    if (!text) {
      error('Empty prompt, not adding to queue');
      return;
    }

    if (queueState.editingId !== null) {
      const item = queueState.queue.find((item) => item.id === queueState.editingId);

      if (!item) {
        error('Editing item not found in queue:', queueState.editingId);
        return;
      }

      item.prompt = text;
      queueState.editingId = null;
      addBtn.textContent = 'Add To Queue';
    } else {
      queueState.queue.push(createItem(text));
    }

    updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
    input.value = '';
    renderQueue();
    saveQueue();
  };

  addBtn.addEventListener('click', handleAddClick);

  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAddClick();
    }
  });

  function updateStartStopButtons() {
    if (!startBtn) return;
    startBtn.textContent = queueState.running ? 'Stop Queue' : 'Start Queue';
    startBtn.disabled = false;
  }

  startBtn.addEventListener('click', async () => {
    if (queueState.running) {
      // act as Stop button
      queueState.running = false;
      setStatus(panel, 'Stopped');
      updateStartStopButtons();
      updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
      return;
    }

    // act as Start button
    queueState.running = true;
    updateStartStopButtons();
    updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
    try {
      await processQueue();
    } catch (err) {
      error('Queue processor error:', err);
    } finally {
      queueState.running = false;
      updateStartStopButtons();
      updateToolbarButton(getToolbarButton(), queueState.queue, queueState.running);
    }
  });
  // initialize button state
  updateStartStopButtons();
}
