// Shared panel drag behavior
function setupPanelDrag() {
  if (!window.pqPanel) return;

  window.pqPanel.addEventListener(
    'mousedown',
    e => {
      if (e.button !== 2) return;

      e.preventDefault();
      e.stopPropagation();

      window.pqPanelDragging = true;
      window.pqPanelDragStartX = e.clientX;
      window.pqPanelDragStartY = e.clientY;
      window.pqPanelStartX = window.pqPanel.offsetLeft;
      window.pqPanelStartY = window.pqPanel.offsetTop;

      log('panel drag started');
    },
    true
  );

  document.addEventListener('mousemove', e => {
    if (!window.pqPanelDragging) return;

    const deltaX = e.clientX - window.pqPanelDragStartX;
    const deltaY = e.clientY - window.pqPanelDragStartY;

    window.pqPanel.style.left = window.pqPanelStartX + deltaX + 'px';
    window.pqPanel.style.top = window.pqPanelStartY + deltaY + 'px';
    window.pqPanel.style.right = 'auto';
    window.pqPanel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (window.pqPanelDragging) {
      window.pqPanelDragging = false;
      log('panel drag ended');
    }
  });

  window.pqPanel.addEventListener('contextmenu', e => {
    if (window.pqPanelDragging) {
      e.preventDefault();
    }
  });
}

window.setupPanelDrag = setupPanelDrag;
