import { ensurePanelAttached, hidePanel } from './ui.js';
import { log } from './logging.js';

export function createBasePanel(titleText, includeFailedList = false) {
  log('createBasePanel called');

  let panel = document.querySelector('#pq-panel');

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'pq-panel';

    Object.assign(panel.style, {
      position: 'fixed',
      top: '80px',
      left: '24px',
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
      transform: 'none',
    });

    const title = document.createElement('div');
    title.style.display = 'flex';
    title.style.alignItems = 'center';
    title.style.justifyContent = 'space-between';
    title.style.gap = '12px';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';

    const titleLabel = document.createElement('span');
    titleLabel.textContent = titleText;

    const closeBtn = document.createElement('button');
    closeBtn.id = 'pq-close';
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    Object.assign(closeBtn.style, {
      flexShrink: '0',
      padding: '4px 10px',
      borderRadius: '9999px',
      border: '1px solid #555',
      background: '#2a2a2a',
      color: '#fff',
      cursor: 'pointer',
    });

    closeBtn.addEventListener('click', () => hidePanel(panel));

    title.appendChild(titleLabel);
    title.appendChild(closeBtn);

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

    const manageChatsBtn = document.createElement('button');
    manageChatsBtn.id = 'pq-manage-chats';
    manageChatsBtn.style.marginTop = '10px';
    manageChatsBtn.style.width = '100%';
    manageChatsBtn.textContent = 'Manage Chat Prompts';

    const startBtn = document.createElement('button');
    startBtn.id = 'pq-start';
    startBtn.style.marginTop = '10px';
    startBtn.style.width = '100%';
    startBtn.textContent = 'Start Queue';

    const status = document.createElement('div');
    status.id = 'pq-status';
    status.style.marginTop = '10px';
    status.textContent = 'Idle';

    const list = document.createElement('ol');
    list.id = 'pq-list';
    list.style.marginTop = '10px';
    list.style.paddingLeft = '20px';

    panel.appendChild(title);
    panel.appendChild(textarea);
    panel.appendChild(addBtn);
    panel.appendChild(manageChatsBtn);
    panel.appendChild(startBtn);
    panel.appendChild(status);
    panel.appendChild(list);

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

      panel.appendChild(failedTitle);
      panel.appendChild(failedList);
    }

    const root = document.documentElement || document.body;
    if (root) {
      root.appendChild(panel);
    }
  } else {
    ensurePanelAttached(panel);
  }

  log('createBasePanel panel', panel);
  setTimeout(() => {
    log('panel element', panel);
    log('computed display', getComputedStyle(panel).display);
    log('computed visibility', getComputedStyle(panel).visibility);
    log('rect', panel.getBoundingClientRect());
    log('parent', panel.parentElement);
  }, 0);

  return panel;
}
