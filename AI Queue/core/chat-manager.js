import { error, log } from './logging.js';
import { readScopedQueueData, writeScopedQueueData } from './storage.js';

const GLOBAL_CHAT_KEY = '__global__';
const MANAGER_WINDOW_NAME = 'pq-chat-manager';

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

function ensureBaseMarkup(doc, title) {
  doc.title = title;
  doc.body.innerHTML = '';

  const style = doc.createElement('style');
  style.textContent = `
    :root {
      color-scheme: dark;
      --bg: #111827;
      --panel: #1f2937;
      --card: #243042;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --accent: #22c55e;
      --border: #374151;
      --drag: #60a5fa;
    }
    body {
      margin: 0;
      background: radial-gradient(circle at top right, #1f2937, #0b1220 60%);
      color: var(--text);
      font-family: 'Segoe UI', Tahoma, sans-serif;
    }
    .wrap {
      padding: 16px;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .subtitle {
      color: var(--muted);
      margin-bottom: 16px;
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
      align-items: start;
    }
    .chat-card {
      background: linear-gradient(180deg, var(--panel), var(--card));
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      min-height: 140px;
    }
    .chat-title {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      letter-spacing: 0.2px;
      text-transform: uppercase;
      color: #d1d5db;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .chat-list {
      list-style: none;
      margin: 0;
      padding: 8px;
      min-height: 90px;
    }
    .chat-item {
      background: rgba(17, 24, 39, 0.7);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 8px;
      cursor: grab;
      user-select: none;
      font-size: 13px;
      line-height: 1.35;
      word-break: break-word;
    }
    .chat-item.dragging {
      opacity: 0.5;
    }
    .chat-list.drag-over,
    .chat-item.drag-over {
      outline: 2px dashed var(--drag);
      outline-offset: 2px;
    }
    .empty {
      color: var(--muted);
      font-size: 12px;
      padding: 8px;
      border: 1px dashed var(--border);
      border-radius: 8px;
      text-align: center;
    }
    .footer {
      margin-top: 14px;
      color: var(--muted);
      font-size: 12px;
    }
  `;

  const wrap = doc.createElement('div');
  wrap.className = 'wrap';

  const header = doc.createElement('div');
  header.className = 'title';
  header.textContent = title;

  const subtitle = doc.createElement('div');
  subtitle.className = 'subtitle';
  subtitle.textContent =
    'Drag prompts to reorder within a chat, or drop them into another chat card to move between chats.';

  const grid = doc.createElement('div');
  grid.className = 'grid';
  grid.id = 'pq-chat-grid';

  const footer = doc.createElement('div');
  footer.className = 'footer';
  footer.textContent = 'Changes are saved immediately to localStorage.';

  wrap.appendChild(header);
  wrap.appendChild(subtitle);
  wrap.appendChild(grid);
  wrap.appendChild(footer);

  doc.head.innerHTML = '';
  doc.head.appendChild(style);
  doc.body.appendChild(wrap);
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

function renderCards(doc, storageKey, state, rerender) {
  const grid = doc.querySelector('#pq-chat-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const keys = orderedKeys(state.groups);

  if (keys.length === 0) {
    const empty = doc.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No prompts found in storage.';
    grid.appendChild(empty);
    return;
  }

  keys.forEach((chatKey) => {
    const card = doc.createElement('section');
    card.className = 'chat-card';

    const title = doc.createElement('div');
    title.className = 'chat-title';

    const label = doc.createElement('span');
    label.textContent = chatLabel(chatKey);

    const count = doc.createElement('span');
    count.textContent = String(state.groups[chatKey].length);

    title.appendChild(label);
    title.appendChild(count);

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
          doc
            .querySelectorAll('.drag-over')
            .forEach((element) => element.classList.remove('drag-over'));
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

export function openChatManagerWindow(storageKey, title = 'Prompt Queue Chat Manager') {
  const popup = window.open('', MANAGER_WINDOW_NAME, 'width=1100,height=760,resizable=yes');
  if (!popup) {
    error('Failed to open chat manager window. Pop-up may be blocked.');
    return;
  }

  const data = readScopedQueueData(storageKey);
  const state = {
    data,
    groups: groupItems(data.items),
    drag: null,
  };

  const rerender = () => {
    ensureBaseMarkup(popup.document, title);
    renderCards(popup.document, storageKey, state, rerender);
  };

  rerender();
  popup.focus();
  log('chat manager opened', { storageKey });
}
