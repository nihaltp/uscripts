// Shared controls wiring for panel: add/start/stop
function setupPanelControls({ createItem, renderQueue, saveQueue, processQueue }) {
  const input = window.pqPanel.querySelector('#pq-input');
  const addBtn = window.pqPanel.querySelector('#pq-add');
  const startBtn = window.pqPanel.querySelector('#pq-start');
  const stopBtn = window.pqPanel.querySelector('#pq-stop');

  window.pqInput = input;
  window.pqAddBtn = addBtn;

  const handleAddClick = () => {
    const text = input.value.trim();

    if (!text) {
      AIQueue.logging.error('Empty prompt, not adding to queue');
      return;
    }

    if (window.aiQueue.editingId !== null) {
      const item = window.aiQueue.queue.find(item => item.id === window.aiQueue.editingId);

      if (!item) {
        AIQueue.logging.error('Editing item not found in queue:', window.aiQueue.editingId);
        return;
      }

      item.prompt = text;
      window.aiQueue.editingId = null;
      addBtn.textContent = 'Add To Queue';
    } else {
      window.aiQueue.queue.push(createItem(text));
    }

    AIQueue.ui.updateToolbarButton(
      window.pqToolbarButton,
      window.aiQueue.queue,
      window.aiQueue.running
    );
    input.value = '';
    renderQueue();
    saveQueue();
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
    AIQueue.ui.updateToolbarButton(
      window.pqToolbarButton,
      window.aiQueue.queue,
      window.aiQueue.running
    );
    try {
      await processQueue();
    } catch (err) {
      AIQueue.logging.error('Queue processor error:', err);
    } finally {
      window.aiQueue.running = false;
      updateStartStopButtons();
      AIQueue.ui.updateToolbarButton(
        window.pqToolbarButton,
        window.aiQueue.queue,
        window.aiQueue.running
      );
    }
  });

  stopBtn?.addEventListener('click', () => {
    if (!window.aiQueue.running) return;
    window.aiQueue.running = false;
    AIQueue.queue.setStatus(window.pqPanel, 'Stopped');
    updateStartStopButtons();
    AIQueue.ui.updateToolbarButton(
      window.pqToolbarButton,
      window.aiQueue.queue,
      window.aiQueue.running
    );
  });
}

window.setupPanelControls = setupPanelControls;
