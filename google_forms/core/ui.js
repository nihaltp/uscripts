// core/ui.js
import styles from '../styles/main.css';
import { readAllSaves, writeSave, renameSave, deleteSave } from './storage.js';
import { captureVisible, detectConflicts, applyFields } from './fields.js';
import { log, error } from './logging.js';
import { DOM_ID_PREFIX } from './constants.js';

// ── State ─────────────────────────────────────────────────────────────────────

let currentFormId = null;

// ── Style injection ───────────────────────────────────────────────────────────

function ensureStyles() {
  const id = `${DOM_ID_PREFIX}styles`;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = styles;
  document.head.appendChild(style);
}

// ── Element factory ───────────────────────────────────────────────────────────

/**
 * Tiny element builder so we don't need innerHTML for everything.
 * @param {string} tag
 * @param {Record<string,any>} attrs
 * @param {...(Node|string)} children
 */
function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') {
      element.className = val;
    } else if (key === 'textContent') {
      element.textContent = val;
    } else if (key.startsWith('on') && typeof val === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), val);
    } else {
      element.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// ── Status banners ────────────────────────────────────────────────────────────

function showStatus(container, message, type = 'success') {
  const existing = container.querySelector('.gf-saver-status');
  if (existing) existing.remove();

  const banner = el('div', { className: `gf-saver-status ${type}`, textContent: message });
  container.appendChild(banner);

  setTimeout(() => banner.remove(), 3500);
}

// ── Floating button ───────────────────────────────────────────────────────────

/**
 * Injects the floating action button into document.body.
 * Clicking it opens the main modal.
 *
 * @param {string} formId
 */
export function createFloatingButton(formId) {
  currentFormId = formId;
  ensureStyles();

  // If the button already exists (SPA navigation), just update the formId
  // reference (already done above) and close any open modal — the button
  // itself doesn't need to be re-created.
  const existing = document.getElementById(`${DOM_ID_PREFIX}btn`);
  if (existing) {
    removeBackdrop();
    return;
  }

  const btn = el(
    'button',
    {
      id: `${DOM_ID_PREFIX}btn`,
      title: 'Google Forms Saver',
      onClick: (e) => {
        // Prevent Google's jsaction event delegation from intercepting our click
        e.stopPropagation();
        // Catch any async errors — without this, promise rejections are silently swallowed
        openMainModal(formId).catch((err) => {
          error('[GF-Saver] Modal failed to open:', err);
          createStatusToast('⚠️ Form Saver error — see console for details');
        });
      },
    },
    el('span', { className: 'gf-saver-icon', textContent: '📋' }),
    ' Form Saver',
  );

  document.body.appendChild(btn);
  log('floating button created');
}

// ── Main modal ────────────────────────────────────────────────────────────────

function removeBackdrop() {
  document.getElementById(`${DOM_ID_PREFIX}backdrop`)?.remove();
}

async function openMainModal(formId) {
  removeBackdrop();

  let saves, saveNames;
  try {
    saves = await readAllSaves(formId);
    saveNames = Object.keys(saves);
  } catch (err) {
    error('[GF-Saver] readAllSaves failed:', err);
    saves = {};
    saveNames = [];
  }

  // ── Header ──────────────────────────────────────────────
  const header = el(
    'div',
    { className: 'gf-saver-modal-header' },
    el('span', { className: 'gf-saver-modal-icon', textContent: '📋' }),
    el(
      'div',
      { style: 'flex:1' },
      el('p', { className: 'gf-saver-modal-title', textContent: 'Form Saver' }),
      el('p', {
        className: 'gf-saver-modal-subtitle',
        textContent: `${saveNames.length} save${saveNames.length !== 1 ? 's' : ''} for this form`,
      }),
    ),
    el('button', { className: 'gf-saver-close-btn', textContent: '×', onClick: removeBackdrop }),
  );

  // ── Save-as section ─────────────────────────────────────
  const nameInput = el('input', {
    className: 'gf-saver-input',
    type: 'text',
    placeholder: 'Save name…',
    id: `${DOM_ID_PREFIX}name-input`,
  });

  // ── Enter key submits the save ───────────────────────────
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveBtn.click();
    }
  });

  let statusContainer = null;

  const saveBtn = el('button', {
    className: 'gf-saver-btn-primary',
    textContent: 'Save',
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }

      saveBtn.disabled = true;
      // Build spinner without innerHTML (Trusted Types CSP blocks innerHTML on Google Forms)
      saveBtn.textContent = '';
      const spinner = document.createElement('span');
      spinner.className = 'gf-saver-spinner';
      saveBtn.appendChild(spinner);
      saveBtn.appendChild(document.createTextNode('Saving…'));

      try {
        const fields = captureVisible();
        if (fields.length === 0) {
          showStatus(statusContainer, '⚠️ No fields found on this page.', 'error');
          return;
        }
        await writeSave(formId, name, fields);
        nameInput.value = '';
        showStatus(statusContainer, `✓ Saved "${name}" (${fields.length} fields)`, 'success');
        // Re-open modal to refresh list
        setTimeout(() => openMainModal(formId), 400);
      } catch (err) {
        error('writeSave error:', err);
        showStatus(statusContainer, '✗ Failed to save. Check console.', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save'; // safe — no HTML
      }
    },
  });

  const saveAs = el('div', { className: 'gf-saver-saveas' }, nameInput, saveBtn);
  statusContainer = el('div', {});

  // ── Saves list ───────────────────────────────────────────
  let listEl;

  if (saveNames.length === 0) {
    listEl = el(
      'div',
      { className: 'gf-saver-empty' },
      el('span', { className: 'gf-saver-empty-icon', textContent: '🗂️' }),
      'No saves yet. Fill in the form and click Save above.',
    );
  } else {
    listEl = el('div', { className: 'gf-saver-saves-list' });
    for (const name of saveNames) {
      listEl.appendChild(buildSaveRow(formId, name, saves[name], statusContainer));
    }
  }

  // ── Body ─────────────────────────────────────────────────
  const body = el(
    'div',
    { className: 'gf-saver-modal-body' },
    el('p', { className: 'gf-saver-section-label', textContent: 'Save current page' }),
    saveAs,
    statusContainer,
    el('p', {
      className: 'gf-saver-section-label',
      style: 'margin-top:20px',
      textContent: 'Saved responses',
    }),
    listEl,
  );

  const modal = el('div', { className: 'gf-saver-modal' }, header, body);
  // NOTE: do NOT pass onClick:null — el() would stringify it as onclick="null" attribute
  const backdrop = el('div', { id: `${DOM_ID_PREFIX}backdrop` }, modal);

  // Close on backdrop click (not the modal card itself)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) removeBackdrop();
  });

  document.body.appendChild(backdrop);

  // Auto-focus name input
  setTimeout(() => nameInput.focus(), 50);
}

// ── Save row ──────────────────────────────────────────────────────────────────

function buildSaveRow(formId, name, save, statusContainer) {
  const meta = `${save.fieldCount ?? '?'} fields · saved ${relativeTime(save.modified || save.created)}`;

  // ── Load button ──────────────────────────────────────────
  const loadBtn = el('button', {
    className: 'gf-saver-btn-secondary',
    textContent: 'Load',
    onClick: () => handleLoad(formId, name, save, statusContainer),
  });

  // ── Rename button & logic ────────────────────────────────
  const nameEl = el('div', { className: 'gf-saver-save-name', textContent: name });

  const renameBtn = el('button', {
    className: 'gf-saver-btn-secondary',
    textContent: 'Rename',
    onClick: () => {
      const renameInput = el('input', {
        className: 'gf-saver-rename-input',
        type: 'text',
        value: name,
      });

      const commit = async () => {
        const newName = renameInput.value.trim();
        if (!newName || newName === name) {
          nameEl.textContent = name;
          renameInput.replaceWith(nameEl);
          return;
        }
        const ok = await renameSave(formId, name, newName);
        if (ok) {
          setTimeout(() => openMainModal(formId), 200);
        } else {
          showStatus(statusContainer, `✗ Could not rename — "${newName}" may already exist.`, 'error');
          nameEl.textContent = name;
          renameInput.replaceWith(nameEl);
        }
      };

      renameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          nameEl.textContent = name;
          renameInput.replaceWith(nameEl);
        }
      });
      renameInput.addEventListener('blur', commit);

      nameEl.replaceWith(renameInput);
      renameInput.select();
    },
  });

  // ── Delete button ────────────────────────────────────────
  const deleteBtn = el('button', {
    className: 'gf-saver-btn-danger',
    textContent: 'Delete',
    onClick: async () => {
      if (!confirm(`Delete save "${name}"?`)) return;
      await deleteSave(formId, name);
      setTimeout(() => openMainModal(formId), 200);
    },
  });

  return el(
    'div',
    { className: 'gf-saver-save-item' },
    el('div', { className: 'gf-saver-save-info' }, nameEl, el('div', { className: 'gf-saver-save-meta', textContent: meta })),
    el('div', { className: 'gf-saver-save-actions' }, loadBtn, renameBtn, deleteBtn),
  );
}

// ── Load handler ──────────────────────────────────────────────────────────────

async function handleLoad(formId, saveName, save, statusContainer) {
  const savedFields = save.fields || [];
  if (savedFields.length === 0) {
    showStatus(statusContainer, '⚠️ This save has no fields.', 'error');
    return;
  }

  const conflicts = detectConflicts(savedFields);

  if (conflicts.length === 0) {
    // No conflicts — apply directly
    removeBackdrop();
    await applyFields(savedFields, {});
    createStatusToast(`✓ Loaded "${saveName}" — ${savedFields.length} fields applied`);
  } else {
    // Show conflict resolution modal
    openConflictModal(saveName, savedFields, conflicts);
  }
}

// ── Conflict / overwrite modal ────────────────────────────────────────────────

function openConflictModal(saveName, savedFields, conflicts) {
  removeBackdrop();

  const checkboxes = {}; // key → checkbox element

  // ── Header ──────────────────────────────────────────────
  const header = el(
    'div',
    { className: 'gf-saver-modal-header' },
    el('span', { className: 'gf-saver-modal-icon', textContent: '⚠️' }),
    el(
      'div',
      { style: 'flex:1' },
      el('p', { className: 'gf-saver-modal-title', textContent: 'Some fields already have values' }),
      el('p', {
        className: 'gf-saver-modal-subtitle',
        textContent: `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} — choose what to overwrite`,
      }),
    ),
    el('button', { className: 'gf-saver-close-btn', textContent: '×', onClick: removeBackdrop }),
  );

  // ── Conflict table ───────────────────────────────────────
  const thead = el(
    'thead',
    {},
    el(
      'tr',
      {},
      el('th', { textContent: 'Field' }),
      el('th', { textContent: 'Current' }),
      el('th', { textContent: 'Saved' }),
      el('th', { textContent: '✓' }),
    ),
  );

  const tbody = el('tbody', {});
  for (const conflict of conflicts) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = true; // default: overwrite
    checkboxes[conflict.key] = cb;

    tbody.appendChild(
      el(
        'tr',
        {},
        el('td', { className: 'gf-saver-conflict-field', textContent: conflict.label }),
        el('td', { className: 'gf-saver-conflict-value', textContent: conflict.currentValues.join(', ') }),
        el('td', { className: 'gf-saver-conflict-new', textContent: conflict.savedValues.join(', ') }),
        el('td', { className: 'gf-saver-conflict-check' }, cb),
      ),
    );
  }

  const table = el('table', { className: 'gf-saver-conflict-table' }, thead, tbody);

  const body = el(
    'div',
    { className: 'gf-saver-modal-body' },
    el('p', { style: 'font-size:12px;color:rgba(255,255,255,0.5);margin:0 0 6px', textContent: 'Checked fields will be overwritten with the saved value.' }),
    table,
  );

  // ── Footer ───────────────────────────────────────────────
  const applyBtn = el('button', {
    className: 'gf-saver-btn-primary',
    textContent: 'Apply selected',
    onClick: async () => {
      // Build overwrite map: true for checked conflicts, false for unchecked
      const overwriteMap = {};
      for (const [key, cb] of Object.entries(checkboxes)) {
        overwriteMap[key] = cb.checked;
      }
      removeBackdrop();
      await applyFields(savedFields, overwriteMap);
      createStatusToast(`✓ Loaded "${saveName}"`);
    },
  });

  const skipBtn = el('button', {
    className: 'gf-saver-btn-secondary',
    textContent: 'Skip conflicts',
    onClick: async () => {
      // Skip ALL conflicting fields, only apply clean ones
      const overwriteMap = {};
      for (const key of Object.keys(checkboxes)) {
        overwriteMap[key] = false;
      }
      removeBackdrop();
      await applyFields(savedFields, overwriteMap);
      createStatusToast(`✓ Loaded "${saveName}" (conflicts skipped)`);
    },
  });

  const cancelBtn = el('button', {
    className: 'gf-saver-btn-secondary',
    textContent: 'Cancel',
    onClick: removeBackdrop,
  });

  const footer = el('div', { className: 'gf-saver-conflict-footer' }, cancelBtn, skipBtn, applyBtn);

  const modal = el('div', { className: 'gf-saver-modal' }, header, body, footer);
  const backdrop = el('div', { id: `${DOM_ID_PREFIX}backdrop` }, modal);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) removeBackdrop();
  });

  document.body.appendChild(backdrop);
}

// ── Toast notification (shown after modal closes) ─────────────────────────────

function createStatusToast(message) {
  const existing = document.getElementById(`${DOM_ID_PREFIX}toast`);
  if (existing) existing.remove();

  const toast = el('div', {
    id: `${DOM_ID_PREFIX}toast`,
    textContent: message,
  });

  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '88px',
    right: '28px',
    zIndex: '2147483647',
    background: 'rgba(30,30,46,0.95)',
    border: '1px solid rgba(52,168,83,0.4)',
    color: '#81c995',
    padding: '10px 16px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: "'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif",
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    animation: 'gf-fade-in 0.2s ease',
    maxWidth: '320px',
  });

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
