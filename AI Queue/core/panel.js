// Shared panel creation helper for providers
function createBasePanel(titleText, includeFailedList = false) {
  if (window.pqPanel && AIQueue.utils.isAttached(window.pqPanel)) {
    return;
  }

  if (window.pqPanel && !AIQueue.utils.isAttached(window.pqPanel)) {
    if (document.body) {
      document.body.appendChild(window.pqPanel);
    }
    return;
  }

  if (!window.pqPanel) {
    window.pqPanel = document.createElement('div');
    window.pqPanel.id = 'pq-panel';

    Object.assign(window.pqPanel.style, {
      position: 'fixed',
      top: '100px',
      left: '100px',
      bottom: 'auto',
      right: 'auto',
      width: '320px',
      minHeight: '200px',
      maxHeight: '70vh',
      overflowY: 'auto',
      background: '#202123',
      color: 'white',
      border: '1px solid #444',
      borderRadius: '16px',
      padding: '12px',
      zIndex: '2147483647',
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
      display: 'none',
    });

    const title = document.createElement('div');
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    title.textContent = titleText;

    const textarea = document.createElement('textarea');
    textarea.id = 'pq-input';
    textarea.placeholder = 'Enter prompt...';
    Object.assign(textarea.style, {
      width: '100%',
      height: '80px',
      resize: 'vertical',
      color: '#fff',
      background: '#222',
      border: '1px solid #444',
      borderRadius: '6px',
      padding: '8px',
      boxSizing: 'border-box',
    });

    const addBtn = document.createElement('button');
    addBtn.id = 'pq-add';
    addBtn.style.marginTop = '10px';
    addBtn.style.width = '100%';
    addBtn.textContent = 'Add To Queue';

    const startBtn = document.createElement('button');
    startBtn.id = 'pq-start';
    startBtn.style.marginTop = '10px';
    startBtn.style.width = '100%';
    startBtn.textContent = 'Start Queue';

    const stopBtn = document.createElement('button');
    stopBtn.id = 'pq-stop';
    stopBtn.style.marginTop = '10px';
    stopBtn.style.width = '100%';
    stopBtn.textContent = 'Stop Queue';
    stopBtn.style.display = 'none';

    const status = document.createElement('div');
    status.id = 'pq-status';
    status.style.marginTop = '10px';
    status.textContent = 'Idle';

    const list = document.createElement('ol');
    list.id = 'pq-list';
    list.style.marginTop = '10px';
    list.style.paddingLeft = '20px';

    window.pqPanel.appendChild(title);
    window.pqPanel.appendChild(textarea);
    window.pqPanel.appendChild(addBtn);
    window.pqPanel.appendChild(startBtn);
    window.pqPanel.appendChild(stopBtn);
    window.pqPanel.appendChild(status);
    window.pqPanel.appendChild(list);

    if (includeFailedList) {
      const failedTitle = document.createElement('div');
      failedTitle.id = 'pq-failed-title';
      failedTitle.style.marginTop = '12px';
      failedTitle.style.fontSize = '13px';
      failedTitle.style.opacity = '0.8';
      failedTitle.textContent = 'Failed Prompts';

      const failedList = document.createElement('ol');
      failedList.id = 'pq-failed-list';
      failedList.style.marginTop = '6px';
      failedList.style.paddingLeft = '20px';

      window.pqPanel.appendChild(failedTitle);
      window.pqPanel.appendChild(failedList);
    }

    if (document.body) {
      document.body.appendChild(window.pqPanel);
    }

    window.pqPanelInitialized = true;
  }
}

// Export on window for provider scripts to call
window.createBasePanel = createBasePanel;
