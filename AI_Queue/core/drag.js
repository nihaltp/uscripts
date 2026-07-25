import { log } from './logging.js';
import { getPanel } from './ui.js';

let dragBoundPanel = null;
let listenersBound = false;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panelStartX = 0;
let panelStartY = 0;

function onMouseMove(e) {
  if (!dragging) return;

  const panel = getPanel();
  if (!panel) return;

  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;

  panel.style.left = panelStartX + deltaX + 'px';
  panel.style.top = panelStartY + deltaY + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

function onMouseUp() {
  if (dragging) {
    dragging = false;
    log('panel drag ended');
  }
}

function bindDocumentListeners() {
  if (listenersBound) return;

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  listenersBound = true;
}

export function setupPanelDrag() {
  const panel = getPanel();
  if (!panel) return;

  bindDocumentListeners();
  if (dragBoundPanel === panel) return;

  dragBoundPanel = panel;

  panel.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 2) return;

      e.preventDefault();
      e.stopPropagation();

      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panelStartX = panel.offsetLeft;
      panelStartY = panel.offsetTop;

      log('panel drag started');
    },
    true
  );

  panel.addEventListener('contextmenu', (e) => {
    if (dragging) {
      e.preventDefault();
    }
  });
}
