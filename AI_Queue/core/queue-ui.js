import { error } from './logging.js';
import { moveQueueItem } from './queue.js';
import { queueState } from './state.js';

// Shared queue item UI factory
export function createQueueItemElement(item, { renderQueue, saveQueue }) {
  const li = document.createElement('li');
  li.style.marginBottom = '10px';
  li.draggable = false;
  li.style.border = '1px solid var(--pq-ui-btn-border)';
  li.style.borderRadius = '8px';
  li.style.padding = '8px';
  li.style.background = 'var(--pq-ui-btn-bg)';

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';
  row.style.alignItems = 'flex-start';

  const text = document.createElement('div');
  text.textContent = item.prompt;
  text.style.flex = '1';
  text.style.wordBreak = 'break-word';
  text.style.whiteSpace = 'pre-wrap';
  text.style.fontSize = '14px';

  const iconBtnStyle = {
    cursor: 'pointer',
    display: 'none',
    background: 'var(--pq-ui-btn-bg)',
    border: '1px solid var(--pq-ui-btn-border)',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '12px'
  };

  const editBtn = document.createElement('button');
  editBtn.textContent = '🖉';
  editBtn.title = 'Edit';
  Object.assign(editBtn.style, iconBtnStyle, { color: 'var(--pq-ui-accent)' });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Delete';
  Object.assign(deleteBtn.style, iconBtnStyle, { color: 'var(--pq-ui-danger)' });

  row.appendChild(text);
  row.appendChild(editBtn);
  row.appendChild(deleteBtn);

  const dragHandle = document.createElement('span');
  dragHandle.textContent = '☰';
  dragHandle.title = 'Drag to reorder';
  dragHandle.style.cursor = 'grab';
  dragHandle.style.userSelect = 'none';
  dragHandle.style.alignSelf = 'center';
  dragHandle.style.marginLeft = '6px';
  dragHandle.style.display = 'none';

  dragHandle.addEventListener('dragstart', (e) => {
    queueState.draggedId = item.id;
    try {
      e.dataTransfer.setData('text/plain', item.id);
      e.dataTransfer.effectAllowed = 'move';
    } catch (err) {
      error('Drag start dataTransfer error:', err);
    }
    li.style.opacity = '0.6';
  });

  dragHandle.addEventListener('dragend', () => {
    queueState.draggedId = null;
    li.style.opacity = '';
  });

  // place drag handle on the right
  row.appendChild(dragHandle);
  li.appendChild(row);

  // hover show/hide
  li.addEventListener('mouseenter', () => {
    editBtn.style.display = 'inline-block';
    deleteBtn.style.display = 'inline-block';
    dragHandle.style.display = 'inline-block';
  });
  li.addEventListener('mouseleave', () => {
    if (queueState.editingId === item.id) return;
    editBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    if (queueState.draggedId === item.id) return;
    dragHandle.style.display = 'none';
  });

  // drag/drop
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (err) {
      error('Drag over dataTransfer error:', err);
    }
    li.style.borderTop = '2px solid var(--pq-ui-accent)';
  });
  li.addEventListener('dragleave', () => {
    li.style.borderTop = '';
  });
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.style.borderTop = '';
    const draggedId =
      queueState.draggedId ||
      (e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData('text/plain'));
    if (draggedId && draggedId !== item.id) {
      moveQueueItem(draggedId, item.id, queueState.queue, renderQueue, saveQueue);
    }
  });

  // expose controls for provider to wire
  return { li, text, editBtn, deleteBtn };
}
