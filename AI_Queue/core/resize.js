import { log } from './logging.js';

let isResizing = false;
let currentPanel = null;
let currentHandle = null;
let startX = 0;
let startY = 0;
let startWidth = 0;
let startHeight = 0;
let startLeft = 0;
let startTop = 0;
let listenersBound = false;

function onMouseMove(e) {
  if (!isResizing || !currentPanel) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  
  if (currentHandle.includes('right')) {
    currentPanel.style.width = startWidth + dx + 'px';
  }
  if (currentHandle.includes('bottom')) {
    currentPanel.style.height = startHeight + dy + 'px';
  }
  if (currentHandle.includes('left')) {
    currentPanel.style.width = startWidth - dx + 'px';
    currentPanel.style.left = startLeft + dx + 'px';
  }
  if (currentHandle.includes('top')) {
    currentPanel.style.height = startHeight - dy + 'px';
    currentPanel.style.top = startTop + dy + 'px';
  }
}

function onMouseUp() {
  if (isResizing) {
    isResizing = false;
    currentPanel = null;
    document.body.style.cursor = 'default';
    log('panel resize ended');
  }
}

export function setupPanelResize(panel) {
  if (!panel) {
    import('./ui.js').then(m => {
      const defaultPanel = m.getPanel();
      if (defaultPanel) setupPanelResize(defaultPanel);
    });
    return;
  }

  if (panel._resizeSetupDone) return;
  panel._resizeSetupDone = true;

  const handles = ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const handleSize = 8;
  
  handles.forEach(handle => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.zIndex = '2147483647';
    
    if (handle.includes('top')) { el.style.top = '-4px'; el.style.height = `${handleSize}px`; }
    if (handle.includes('bottom')) { el.style.bottom = '-4px'; el.style.height = `${handleSize}px`; }
    if (handle.includes('left')) { el.style.left = '-4px'; el.style.width = `${handleSize}px`; }
    if (handle.includes('right')) { el.style.right = '-4px'; el.style.width = `${handleSize}px`; }
    
    if (handle === 'top' || handle === 'bottom') {
      el.style.left = '4px'; el.style.right = '4px'; el.style.cursor = 'ns-resize';
    } else if (handle === 'left' || handle === 'right') {
      el.style.top = '4px'; el.style.bottom = '4px'; el.style.cursor = 'ew-resize';
    } else if (handle === 'top-left' || handle === 'bottom-right') {
      el.style.width = `${handleSize}px`; el.style.height = `${handleSize}px`;
      el.style.cursor = 'nwse-resize';
    } else if (handle === 'top-right' || handle === 'bottom-left') {
      el.style.width = `${handleSize}px`; el.style.height = `${handleSize}px`;
      el.style.cursor = 'nesw-resize';
    }
    
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      currentPanel = panel;
      currentHandle = handle;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      startLeft = rect.left;
      startTop = rect.top;
      document.body.style.cursor = el.style.cursor;
      log(`panel resize started: ${handle}`);
    });
    
    panel.appendChild(el);
  });

  if (!listenersBound) {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    listenersBound = true;
  }
}
