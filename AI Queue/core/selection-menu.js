import { queueState } from './state.js';
import selectionMenuStyles from '../styles/selection-menu.css';

const SELECTION_MENU_ID = 'pq-selection-menu';
let installed = false;

function getSelectedPageText() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return '';

  return selection.toString().trim();
}

function hideSelectionMenu() {
  const menu = document.querySelector(`#${SELECTION_MENU_ID}`);
  if (!menu) return;

  menu.hidden = true;
  menu.style.display = 'none';
}

function ensureSelectionMenu(onAddSelection) {
  let menu = document.querySelector(`#${SELECTION_MENU_ID}`);
  if (menu) return menu;

  if (!document.querySelector('#pq-selection-menu-styles')) {
    const style = document.createElement('style');
    style.id = 'pq-selection-menu-styles';
    style.textContent = selectionMenuStyles;
    document.head.appendChild(style);
  }

  menu = document.createElement('div');
  menu.id = SELECTION_MENU_ID;
  menu.hidden = true;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Add to Prompt Queue';

  button.addEventListener('click', () => {
    const prompt = menu.dataset.prompt || '';
    if (prompt) {
      onAddSelection(prompt);
    }
    hideSelectionMenu();
  });

  menu.appendChild(button);
  document.body.appendChild(menu);
  return menu;
}

function showSelectionMenu(selectionText, x, y, onAddSelection) {
  const menu = ensureSelectionMenu(onAddSelection);
  menu.dataset.prompt = selectionText;

  const margin = 12;
  const left = Math.min(x + margin, window.innerWidth - 200);
  const top = Math.min(y + margin, window.innerHeight - 64);

  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.hidden = false;
  menu.style.display = 'block';
}

function addSelectionToQueue(createItem, renderQueue, saveQueue, updateToolbarButton) {
  return (selectionText) => {
    const prompt = selectionText.trim();
    if (!prompt) return;

    queueState.queue.push(createItem(prompt));
    updateToolbarButton(document.querySelector('#pq-toolbar-button'), queueState.queue, queueState.running);
    renderQueue?.();
    saveQueue();
  };
}

export function installSelectionPromptMenu({ createItem, renderQueue, saveQueue, updateToolbarButton }) {
  if (installed) return;
  installed = true;

  const onAddSelection = addSelectionToQueue(createItem, renderQueue, saveQueue, updateToolbarButton);

  document.addEventListener(
    'contextmenu',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#pq-panel') || target.closest(`#${SELECTION_MENU_ID}`)) {
        hideSelectionMenu();
        return;
      }

      const selectionText = getSelectedPageText();
      if (!selectionText) {
        hideSelectionMenu();
        return;
      }

      showSelectionMenu(selectionText, event.clientX, event.clientY, onAddSelection);
    },
    true
  );

  document.addEventListener('click', (event) => {
    const menu = document.querySelector(`#${SELECTION_MENU_ID}`);
    if (!menu) return;
    if (menu.contains(event.target)) return;
    hideSelectionMenu();
  });

  window.addEventListener('blur', hideSelectionMenu);
  window.addEventListener('scroll', hideSelectionMenu, true);
  window.addEventListener('resize', hideSelectionMenu);
}