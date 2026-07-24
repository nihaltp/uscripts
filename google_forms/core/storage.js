// core/storage.js
import { GM_KEY_PREFIX, SCHEMA_VERSION } from './constants.js';
import { log, error } from './logging.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the stable form ID from a Google Forms URL.
 * Works for both /viewform and /formResponse paths.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function getFormId(url) {
  try {
    // Google Forms URLs come in two shapes:
    //   /forms/d/e/FORMID/...            (standard viewform URL)
    //   /forms/u/0/d/e/FORMID/...        (u/N/ variant after Next-page POST)
    const match = url.match(/\/forms(?:\/u\/\d+)?\/d\/e\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function gmKey(formId) {
  return `${GM_KEY_PREFIX}${formId}`;
}

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * Upgrades a raw save object to the current schema version.
 * Add migration steps here as the format evolves.
 *
 * @param {object} save
 * @returns {object}
 */
export function migrateSave(save) {
  if (!save || typeof save !== 'object') return save;

  // v1 is the baseline — nothing to migrate yet.
  // Future: if (save.schemaVersion < 2) { ... }

  return save;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Reads all named saves for a form.
 *
 * @param {string} formId
 * @returns {Promise<Record<string, SaveObject>>}
 */
export async function readAllSaves(formId) {
  try {
    const raw = await GM_getValue(gmKey(formId), '{}');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    // Run migration on every save
    const migrated = {};
    for (const [name, save] of Object.entries(parsed)) {
      migrated[name] = migrateSave(save);
    }
    return migrated;
  } catch (err) {
    error('readAllSaves failed:', err);
    return {};
  }
}

/**
 * Persists (create or overwrite) a named save.
 *
 * @param {string} formId
 * @param {string} saveName
 * @param {FieldData[]} fields  Array of { key, label, type, values }
 */
export async function writeSave(formId, saveName, fields) {
  try {
    const saves = await readAllSaves(formId);
    const now = new Date().toISOString();
    const existing = saves[saveName];

    saves[saveName] = {
      schemaVersion: SCHEMA_VERSION,
      created: existing?.created || now,
      modified: now,
      fieldCount: fields.length,
      fields,
    };

    await GM_setValue(gmKey(formId), JSON.stringify(saves));
    log('writeSave', saveName, saves[saveName]);
  } catch (err) {
    error('writeSave failed:', err);
    throw err;
  }
}

/**
 * Renames a save, preserving its original `created` timestamp.
 *
 * @param {string} formId
 * @param {string} oldName
 * @param {string} newName
 * @returns {Promise<boolean>} true if successful
 */
export async function renameSave(formId, oldName, newName) {
  try {
    const saves = await readAllSaves(formId);
    if (!saves[oldName]) {
      error('renameSave: source not found', oldName);
      return false;
    }
    if (saves[newName]) {
      error('renameSave: target name already exists', newName);
      return false;
    }

    saves[newName] = {
      ...saves[oldName],
      modified: new Date().toISOString(),
    };
    delete saves[oldName];

    await GM_setValue(gmKey(formId), JSON.stringify(saves));
    log('renameSave', oldName, '->', newName);
    return true;
  } catch (err) {
    error('renameSave failed:', err);
    return false;
  }
}

/**
 * Deletes a named save.
 *
 * @param {string} formId
 * @param {string} saveName
 */
export async function deleteSave(formId, saveName) {
  try {
    const saves = await readAllSaves(formId);
    delete saves[saveName];
    await GM_setValue(gmKey(formId), JSON.stringify(saves));
    log('deleteSave', saveName);
  } catch (err) {
    error('deleteSave failed:', err);
    throw err;
  }
}
