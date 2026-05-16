import { log } from './logging.js';
import { readScopedQueueData, writeScopedQueueData } from './storage.js';
import managerStyles from '../styles/chat-manager.css';

const GLOBAL_CHAT_KEY = '__global__';
const MANAGER_PANEL_ID = 'pq-chat-manager-panel';
const MANAGER_GRID_ID = 'pq-chat-manager-grid';
const MANAGER_BODY_ID = 'pq-chat-manager-body';
const activeManagers = new Map();

function toChatKey(chatCode) {
  return typeof chatCode === 'string' && chatCode.trim() ? chatCode.trim() : GLOBAL_CHAT_KEY;
}

function toChatCode(chatKey) {
  return chatKey === GLOBAL_CHAT_KEY ? null : chatKey;
}

function chatLabel(chatKey) {
  if (chatKey === GLOBAL_CHAT_KEY) {
    return 'Global (all chats)';
  }
  return chatKey;
}

function cloneItem(item) {
  return { ...item };
}

function groupItems(items) {
  const grouped = { [GLOBAL_CHAT_KEY]: [] };

  items.forEach((item) => {
    const key = toChatKey(item.chatCode);
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(cloneItem(item));
  });

  return grouped;
}

function orderedKeys(groups) {
  const keys = Object.keys(groups).filter((key) => groups[key]?.length > 0);
  const nonGlobal = keys.filter((key) => key !== GLOBAL_CHAT_KEY).sort((a, b) => a.localeCompare(b));

  if (groups[GLOBAL_CHAT_KEY]?.length > 0) {
    return [GLOBAL_CHAT_KEY, ...nonGlobal];
  }

  return nonGlobal;
}

function flattenGroups(groups) {
  const flat = [];

  orderedKeys(groups).forEach((key) => {
    groups[key].forEach((item) => {
      const normalized = cloneItem(item);
      const chatCode = toChatCode(key);
      if (chatCode) {
        normalized.chatCode = chatCode;
      } else {
        delete normalized.chatCode;
      }
      flat.push(normalized);
    });
  });

  return flat;
}

function findItemIndex(groups, chatKey, itemId) {
  const list = groups[chatKey] || [];
  return list.findIndex((item) => item.id === itemId);
}

function ensureManagerStyles(doc) {
  if (doc.querySelector('#pq-chat-manager-styles')) return;

  const style = doc.createElement('style');
  style.id = 'pq-chat-manager-styles';
  style.textContent = managerStyles;

  doc.head.appendChild(style);
}

function ensureManagerShell(doc, title, mountTarget) {
  ensureManagerStyles(doc);

  let panel = doc.getElementById(MANAGER_PANEL_ID);
  if (!panel) {
    panel = doc.createElement('section');
    panel.id = MANAGER_PANEL_ID;

    const shell = doc.createElement('div');
    shell.className = 'pq-manager-shell';

    const header = doc.createElement('div');
    header.className = 'pq-manager-header';

    const titleWrap = doc.createElement('div');
    const heading = doc.createElement('div');
    heading.className = 'pq-manager-title';
    const subtitle = doc.createElement('div');
    subtitle.className = 'pq-manager-subtitle';

    titleWrap.appendChild(heading);
    titleWrap.appendChild(subtitle);

    const actions = doc.createElement('div');
    actions.className = 'pq-manager-actions';

    const refreshButton = doc.createElement('button');
    refreshButton.type = 'button';
    refreshButton.id = 'pq-chat-manager-refresh';
    refreshButton.textContent = 'Refresh';

    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.id = 'pq-chat-manager-close';
    closeButton.textContent = 'Close';

    actions.appendChild(refreshButton);
    actions.appendChild(closeButton);

    header.appendChild(titleWrap);
    header.appendChild(actions);

    const body = doc.createElement('div');
    body.className = 'pq-manager-body';
    body.id = MANAGER_BODY_ID;

    const grid = doc.createElement('div');
    grid.className = 'pq-manager-grid';
    grid.id = MANAGER_GRID_ID;

    const footer = doc.createElement('div');
    footer.className = 'pq-manager-footer';
    footer.textContent = 'Drag prompts between chats. Changes are saved immediately to localStorage.';

    body.appendChild(grid);
    body.appendChild(footer);

    shell.appendChild(header);
    shell.appendChild(body);
    panel.appendChild(shell);

    closeButton.addEventListener('click', () => {
      panel.hidden = true;
      panel.style.display = 'none';
    });
  }

  const titleNode = panel.querySelector('.pq-manager-title');
  const subtitleNode = panel.querySelector('.pq-manager-subtitle');
  if (titleNode) {
    titleNode.textContent = title;
  }
  if (subtitleNode) {
    subtitleNode.textContent =
      'Reorder prompts within a chat or move them into another chat card. This panel stays inside the page instead of opening a popup.';
  }

  const root = mountTarget || doc.documentElement || doc.body;
  if (root && !root.contains(panel)) {
    root.appendChild(panel);
  }

  panel.hidden = false;
  panel.style.display = 'flex';
  return panel;
}

function moveByDrop(state, fromChatKey, itemId, toChatKey, toIndex) {
  const fromList = state.groups[fromChatKey] || [];
  const fromIndex = findItemIndex(state.groups, fromChatKey, itemId);
  if (fromIndex === -1) {
    return false;
  }

  const [movedItem] = fromList.splice(fromIndex, 1);

  if (!state.groups[toChatKey]) {
    state.groups[toChatKey] = [];
  }

  const targetList = state.groups[toChatKey];
  let normalizedIndex = Number.isInteger(toIndex) ? toIndex : targetList.length;
  if (normalizedIndex < 0) normalizedIndex = 0;
  if (normalizedIndex > targetList.length) normalizedIndex = targetList.length;

  if (fromChatKey === toChatKey && normalizedIndex > fromIndex) {
    normalizedIndex -= 1;
  }

  movedItem.chatCode = toChatCode(toChatKey) || undefined;
  targetList.splice(normalizedIndex, 0, movedItem);

  if (fromChatKey !== GLOBAL_CHAT_KEY && (state.groups[fromChatKey] || []).length === 0) {
    delete state.groups[fromChatKey];
  }

  return true;
}

function persistState(storageKey, state) {
  state.data.items = flattenGroups(state.groups);
  writeScopedQueueData(storageKey, state.data);
}

function renderCards(grid, storageKey, state, rerender) {
  if (!grid) return;

  grid.replaceChildren();

  const keys = orderedKeys(state.groups);

  if (keys.length === 0) {
    const doc = grid.ownerDocument;
    const empty = doc.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No prompts found in storage.';
    grid.appendChild(empty);
    return;
  }

  const doc = grid.ownerDocument;
  keys.forEach((chatKey) => {
    const card = doc.createElement('section');
    card.className = 'chat-card';

    const title = doc.createElement('div');
    title.className = 'chat-title';

    const label = doc.createElement('span');
    label.textContent = chatLabel(chatKey);

    const count = doc.createElement('span');
    count.textContent = String(state.groups[chatKey].length);

    const controls = doc.createElement('span');
    controls.className = 'chat-controls';
    // Delete button to remove all prompts for this chat
    const deleteButton = doc.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'chat-delete';
    deleteButton.textContent = 'Delete';
    deleteButton.title = 'Delete all prompts in this chat';

    deleteButton.addEventListener('click', () => {
      const chatName = chatLabel(chatKey);
      // eslint-disable-next-line no-alert
      if (!doc.defaultView?.confirm(`Delete all prompts in "${chatName}"? This cannot be undone.`)) return;

      // remove the group and persist
      if (state.groups[chatKey]) {
        delete state.groups[chatKey];
      }

      persistState(storageKey, state);
      rerender();
    });

    controls.appendChild(count);
    controls.appendChild(deleteButton);

    title.appendChild(label);
    title.appendChild(controls);

    const list = doc.createElement('ul');
    list.className = 'chat-list';
    list.dataset.chatKey = chatKey;

    const items = state.groups[chatKey];
    if (!items || items.length === 0) {
      const empty = doc.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Drop a prompt here.';
      list.appendChild(empty);
    } else {
      items.forEach((item, index) => {
        const entry = doc.createElement('li');
        entry.className = 'chat-item';
        entry.draggable = true;
        entry.dataset.chatKey = chatKey;
        entry.dataset.itemId = item.id;
        entry.dataset.index = String(index);
        entry.textContent = item.prompt;

        entry.addEventListener('dragstart', (event) => {
          state.drag = {
            itemId: item.id,
            fromChatKey: chatKey,
          };
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', item.id);
          entry.classList.add('dragging');
        });

        entry.addEventListener('dragend', () => {
          state.drag = null;
          entry.classList.remove('dragging');
          doc.querySelectorAll(`#${MANAGER_PANEL_ID} .drag-over`).forEach((element) => {
            element.classList.remove('drag-over');
          });
        });

        entry.addEventListener('dragover', (event) => {
          event.preventDefault();
          entry.classList.add('drag-over');
        });

        entry.addEventListener('dragleave', () => {
          entry.classList.remove('drag-over');
        });

        entry.addEventListener('drop', (event) => {
          event.preventDefault();
          entry.classList.remove('drag-over');

          if (!state.drag) return;

          const moved = moveByDrop(
            state,
            state.drag.fromChatKey,
            state.drag.itemId,
            chatKey,
            Number(entry.dataset.index)
          );

          if (!moved) return;

          persistState(storageKey, state);
          rerender();
        });

        list.appendChild(entry);
      });
    }

    list.addEventListener('dragover', (event) => {
      event.preventDefault();
      list.classList.add('drag-over');
    });

    list.addEventListener('dragleave', () => {
      list.classList.remove('drag-over');
    });

    list.addEventListener('drop', (event) => {
      event.preventDefault();
      list.classList.remove('drag-over');

      if (!state.drag) return;

      const moved = moveByDrop(
        state,
        state.drag.fromChatKey,
        state.drag.itemId,
        chatKey,
        state.groups[chatKey]?.length
      );

      if (!moved) return;

      persistState(storageKey, state);
      rerender();
    });

    card.appendChild(title);
    card.appendChild(list);
    grid.appendChild(card);
  });
}

export function openChatManagerWindow(storageKey, title = 'Prompt Queue Chat Manager', mountTarget) {
  const data = readScopedQueueData(storageKey);
  const state = {
    data,
    groups: groupItems(data.items),
    drag: null,
  };

  const doc = mountTarget?.ownerDocument || document;
  const panel = ensureManagerShell(doc, title, mountTarget);
  panel.dataset.storageKey = storageKey;

  const rerender = () => {
    const grid = panel.querySelector(`#${MANAGER_GRID_ID}`);
    renderCards(grid, storageKey, state, rerender);
  };

  rerender();

  const refreshButton = panel.querySelector('#pq-chat-manager-refresh');
  if (refreshButton) {
    refreshButton.onclick = () => {
      const refreshedData = readScopedQueueData(storageKey);
      state.data = refreshedData;
      state.groups = groupItems(refreshedData.items);
      state.drag = null;
      rerender();
    };
  }

  panel.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: 'smooth' });
  log('chat manager opened in-page', { storageKey });

  activeManagers.set(storageKey, {
    panel,
    state,
    title,
    rerender,
  });
}

export function refreshChatManager(storageKey) {
  const manager = activeManagers.get(storageKey);
  if (!manager || !manager.panel || manager.panel.hidden) return false;

  const refreshedData = readScopedQueueData(storageKey);
  manager.state.data = refreshedData;
  manager.state.groups = groupItems(refreshedData.items);
  manager.state.drag = null;

  const grid = manager.panel.querySelector(`#${MANAGER_GRID_ID}`);
  renderCards(grid, storageKey, manager.state, manager.rerender);
  return true;
}
