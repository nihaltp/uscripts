import { log } from './logging.js';
import { moveQueueItem } from './queue.js';
import { queueState } from './state.js';

// Shared queue item UI factory
export function createQueueItemElement(item, { renderQueue, saveQueue }) {
  const li = document.createElement('li');
  li.style.marginBottom = '10px';
  li.draggable = false;

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';
  row.style.alignItems = 'flex-start';

  const text = document.createElement('div');
  text.textContent = item.prompt;
  text.style.flex = '1';
  text.style.wordBreak = 'break-word';
  text.style.fontSize = '14px';

  const editBtn = document.createElement('button');
  editBtn.textContent = '🖉';
  editBtn.title = 'Edit';
  editBtn.style.cursor = 'pointer';
  editBtn.style.color = '#7dd3fc';
  editBtn.style.display = 'none';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Delete';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.style.color = '#ff6b6b';
  deleteBtn.style.display = 'none';

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
    } catch (error) {
      log('Drag start dataTransfer error:', error);
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
    } catch (error) {
      log('Drag over dataTransfer error:', error);
    }
    li.style.borderTop = '2px solid #7dd3fc';
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
