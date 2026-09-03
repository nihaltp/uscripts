import { log } from './logging.js';

let listenersBound = false;
let dragging = false;
let currentPanel = null;
let dragStartX = 0;
let dragStartY = 0;
let panelStartX = 0;
let panelStartY = 0;

function onMouseMove(e) {
  if (!dragging || !currentPanel) return;

  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;

  currentPanel.style.left = panelStartX + deltaX + 'px';
  currentPanel.style.top = panelStartY + deltaY + 'px';
  currentPanel.style.right = 'auto';
  currentPanel.style.bottom = 'auto';
  currentPanel.style.transform = 'none'; // Clear any transform like translate(-50%)
}

function onMouseUp() {
  if (dragging) {
    dragging = false;
    currentPanel = null;
    log('panel drag ended');
  }
}

function bindDocumentListeners() {
  if (listenersBound) return;

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  listenersBound = true;
}

export function setupPanelDrag(panel) {
  if (!panel) {
    import('./ui.js').then(m => {
      const defaultPanel = m.getPanel();
      if (defaultPanel) setupPanelDrag(defaultPanel);
    });
    return;
  }

  bindDocumentListeners();
  
  if (panel._dragSetupDone) return;
  panel._dragSetupDone = true;

  panel.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 2) return;

      e.preventDefault();
      e.stopPropagation();

      dragging = true;
      currentPanel = panel;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panelStartX = panel.offsetLeft;
      panelStartY = panel.offsetTop;
      
      // If the panel has transform: translateX(-50%), we need to bake that into the left position so it doesn't jump
      const computedStyle = window.getComputedStyle(panel);
      if (computedStyle.transform !== 'none') {
        const matrix = new DOMMatrix(computedStyle.transform);
        panelStartX += matrix.m41;
        panelStartY += matrix.m42;
        panel.style.transform = 'none';
        panel.style.left = panelStartX + 'px';
        panel.style.top = panelStartY + 'px';
      }

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
