// ==UserScript==
// @name         Google Forms Saver
// @description  Save and restore your Google Forms responses. Supports all field types, multiple named saves, and per-field conflict resolution.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?template=bug.yml
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @include      https://docs.google.com/forms/d/e/*
// @include      https://docs.google.com/forms/u/0/d/e/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=docs.google.com
// @version      1.2.0
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/google_forms/dist/google-forms-saver.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/google_forms/dist/google-forms-saver.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) =>
    function __init() {
      if (err) throw err[0];
      try {
        return (fn && (res = (0, fn[__getOwnPropNames(fn)[0]])((fn = 0))), res);
      } catch (e) {
        throw ((err = [e]), e);
      }
    };
  var __commonJS = (cb, mod) =>
    function __require() {
      try {
        return (
          mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
          mod.exports
        );
      } catch (e) {
        throw ((mod = 0), e);
      }
    };

  // google_forms/core/constants.js
  var DEBUG, SCHEMA_VERSION, GM_KEY_PREFIX, FORM_READY_SELECTOR, DOM_ID_PREFIX;
  var init_constants = __esm({
    'google_forms/core/constants.js'() {
      DEBUG = false;
      SCHEMA_VERSION = 1;
      GM_KEY_PREFIX = 'gf-saver-';
      FORM_READY_SELECTOR = 'form[action*="formResponse"], form#mG61Hd, form[jsmodel]';
      DOM_ID_PREFIX = 'gf-saver-';
    },
  });

  // google_forms/core/logging.js
  function log(...args) {
    if (DEBUG) console.log(PREFIX, ...args);
  }
  function error(...args) {
    console.error(PREFIX, ...args);
  }
  var PREFIX;
  var init_logging = __esm({
    'google_forms/core/logging.js'() {
      init_constants();
      PREFIX = '[GF-Saver]';
    },
  });

  // google_forms/core/init.js
  function waitForForm(callback) {
    if (document.querySelector(FORM_READY_SELECTOR)) {
      log('form already rendered');
      callback();
      return;
    }
    let observer = null;
    let timer = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer?.disconnect();
      clearTimeout(timer);
      callback();
    };
    const check = () => {
      if (document.querySelector(FORM_READY_SELECTOR)) {
        log('form appeared in DOM');
        finish();
      }
    };
    observer = new MutationObserver(check);
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    const pollId = setInterval(() => {
      if (done) {
        clearInterval(pollId);
        return;
      }
      check();
    }, POLL_INTERVAL_MS);
    timer = setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearInterval(pollId);
      error('Timed out waiting for Google Form to render.');
    }, TIMEOUT_MS);
  }
  var TIMEOUT_MS, POLL_INTERVAL_MS;
  var init_init = __esm({
    'google_forms/core/init.js'() {
      init_constants();
      init_logging();
      TIMEOUT_MS = 3e4;
      POLL_INTERVAL_MS = 300;
    },
  });

  // google_forms/core/storage.js
  function getFormId(url) {
    try {
      const match = url.match(/\/forms(?:\/u\/\d+)?\/d\/e\/([^/?#]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
  function gmKey(formId) {
    return `${GM_KEY_PREFIX}${formId}`;
  }
  function migrateSave(save) {
    if (!save || typeof save !== 'object') return save;
    return save;
  }
  async function readAllSaves(formId) {
    try {
      const raw = await GM_getValue(gmKey(formId), '{}');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
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
  async function writeSave(formId, saveName, fields) {
    try {
      const saves = await readAllSaves(formId);
      const now = /* @__PURE__ */ new Date().toISOString();
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
  async function renameSave(formId, oldName, newName) {
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
        modified: /* @__PURE__ */ new Date().toISOString(),
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
  async function deleteSave(formId, saveName) {
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
  var init_storage = __esm({
    'google_forms/core/storage.js'() {
      init_constants();
      init_logging();
    },
  });

  // google_forms/styles/main.css
  var main_default;
  var init_main = __esm({
    'google_forms/styles/main.css'() {
      main_default = `/* Google Forms Saver \u2014 styles/main.css
 * All UI injected by the userscript lives under #gf-saver-* IDs.
 * Font stack intentionally uses system fonts already loaded by Google Forms.
 */

/* \u2500\u2500 Floating action button \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

#gf-saver-btn {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;

  padding: 11px 20px;
  border: none;
  border-radius: 100px;
  cursor: pointer;
  font-family: 'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #fff;

  background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%);
  box-shadow:
    0 4px 14px rgba(26, 115, 232, 0.45),
    0 1px 3px rgba(0, 0, 0, 0.2);

  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
  user-select: none;
}

#gf-saver-btn:hover {
  background: linear-gradient(135deg, #1967d2 0%, #0a3c8b 100%);
  box-shadow:
    0 6px 20px rgba(26, 115, 232, 0.55),
    0 2px 6px rgba(0, 0, 0, 0.25);
  transform: translateY(-2px);
}

#gf-saver-btn:active {
  transform: translateY(0);
  box-shadow:
    0 2px 8px rgba(26, 115, 232, 0.35),
    0 1px 2px rgba(0, 0, 0, 0.2);
}

#gf-saver-btn .gf-saver-icon {
  font-size: 16px;
  line-height: 1;
}

/* \u2500\u2500 Modal backdrop \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

#gf-saver-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: gf-fade-in 0.18s ease;
}

@keyframes gf-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* \u2500\u2500 Modal card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-modal {
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.6),
    0 8px 24px rgba(0, 0, 0, 0.4);
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: gf-slide-up 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  color: #e0e0f0;
  font-family: 'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif;
}

@keyframes gf-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

/* \u2500\u2500 Modal header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.gf-saver-modal-header .gf-saver-modal-icon {
  font-size: 20px;
}

.gf-saver-modal-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.gf-saver-modal-subtitle {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  margin: 2px 0 0;
  font-weight: 400;
}

.gf-saver-close-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
}

.gf-saver-close-btn:hover {
  color: #fff;
  background: rgba(255,255,255,0.08);
}

/* \u2500\u2500 Modal body \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.2) transparent;
}

.gf-saver-modal-body::-webkit-scrollbar {
  width: 4px;
}
.gf-saver-modal-body::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
}

/* \u2500\u2500 Save-as row \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-saveas {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.gf-saver-input {
  flex: 1;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px;
  padding: 9px 12px;
  color: #e0e0f0;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}

.gf-saver-input:focus {
  border-color: #1a73e8;
  background: rgba(26, 115, 232, 0.08);
}

.gf-saver-input::placeholder {
  color: rgba(255,255,255,0.3);
}

.gf-saver-edit-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 6px;
  padding: 6px 10px;
  color: #e0e0f0;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}

.gf-saver-edit-input:focus {
  border-color: #1a73e8;
  background: rgba(26, 115, 232, 0.08);
}

.gf-saver-edit-select option {
  color: #202124;
  background: #ffffff;
}

/* \u2500\u2500 Buttons \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-btn-primary {
  background: #1a73e8;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, transform 0.12s;
  flex-shrink: 0;
}

.gf-saver-btn-primary:hover  { background: #1967d2; }
.gf-saver-btn-primary:active { transform: scale(0.97); }

.gf-saver-btn-secondary {
  background: rgba(255,255,255,0.08);
  color: #c0c0d0;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.gf-saver-btn-secondary:hover {
  background: rgba(255,255,255,0.13);
  color: #e0e0f0;
}

.gf-saver-btn-danger {
  background: rgba(234, 67, 53, 0.12);
  color: #ef9a9a;
  border: 1px solid rgba(234, 67, 53, 0.25);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.gf-saver-btn-danger:hover {
  background: rgba(234, 67, 53, 0.22);
  color: #f44336;
}

/* \u2500\u2500 Section label \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
  margin: 0 0 10px;
}

/* \u2500\u2500 Saves list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-saves-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gf-saver-save-item {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: background 0.15s, border-color 0.15s;
}

.gf-saver-save-item:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.15);
}

.gf-saver-save-info {
  flex: 1;
  min-width: 0;
}

.gf-saver-save-name {
  font-size: 14px;
  font-weight: 500;
  color: #e8e8f8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gf-saver-save-meta {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  margin-top: 2px;
}

.gf-saver-save-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* Inline rename input */
.gf-saver-rename-input {
  background: rgba(255,255,255,0.07);
  border: 1px solid #1a73e8;
  border-radius: 6px;
  padding: 4px 8px;
  color: #e0e0f0;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  width: 140px;
}

/* \u2500\u2500 Empty state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-empty {
  text-align: center;
  padding: 32px 16px;
  color: rgba(255,255,255,0.3);
  font-size: 13px;
}

.gf-saver-empty-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 10px;
  opacity: 0.5;
}

/* \u2500\u2500 Status / feedback banner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-status {
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  animation: gf-fade-in 0.2s ease;
}

.gf-saver-status.success {
  background: rgba(52, 168, 83, 0.15);
  border: 1px solid rgba(52, 168, 83, 0.3);
  color: #81c995;
}

.gf-saver-status.error {
  background: rgba(234, 67, 53, 0.15);
  border: 1px solid rgba(234, 67, 53, 0.3);
  color: #f28b82;
}

/* \u2500\u2500 Overwrite conflict dialog \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-conflict-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 12px;
}

.gf-saver-conflict-table th {
  padding: 7px 10px;
  text-align: left;
  color: rgba(255,255,255,0.45);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.gf-saver-conflict-table td {
  padding: 9px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  vertical-align: middle;
}

.gf-saver-conflict-table tr:last-child td {
  border-bottom: none;
}

.gf-saver-conflict-field {
  color: #c0c0d8;
  font-weight: 500;
  max-width: 110px;
  word-break: break-word;
}

.gf-saver-conflict-value {
  color: rgba(255,255,255,0.5);
  font-style: italic;
  max-width: 110px;
  word-break: break-word;
}

.gf-saver-conflict-new {
  color: #81c995;
  max-width: 110px;
  word-break: break-word;
}

.gf-saver-conflict-check {
  text-align: center;
}

.gf-saver-conflict-check input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #1a73e8;
}

/* \u2500\u2500 Conflict dialog footer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-conflict-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

/* \u2500\u2500 Loading spinner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.gf-saver-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: gf-spin 0.7s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}

@keyframes gf-spin {
  to { transform: rotate(360deg); }
}
`;
    },
  });

  // google_forms/core/hash.js
  function djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i);
      hash = hash | 0;
    }
    return hash >>> 0;
  }
  function hashKey(label, type) {
    const normalized = `${label.trim().toLowerCase()}|${type}`;
    return djb2(normalized).toString(16).padStart(8, '0');
  }
  var init_hash = __esm({
    'google_forms/core/hash.js'() {},
  });

  // google_forms/core/fields.js
  function dispatchNativeEvents(el2) {
    el2.dispatchEvent(new Event('input', { bubbles: true }));
    el2.dispatchEvent(new Event('change', { bubbles: true }));
    el2.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }
  function simulateClick(el2) {
    el2.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el2.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  function setNativeValue(el2, value) {
    const proto =
      el2 instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el2, value);
    } else {
      el2.value = value;
    }
    dispatchNativeEvents(el2);
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function getQuestionLabel(container) {
    const heading = container.querySelector('[role="heading"]');
    if (heading) return heading.textContent.trim();
    const titleEl = container.querySelector(
      '.freebirdFormviewerViewItemsItemItemTitle, .exportItemTitle'
    );
    if (titleEl) return titleEl.textContent.trim();
    for (const child of container.children) {
      if (child.querySelector(WIDGET_SELECTOR)) continue;
      const text = child.textContent.trim();
      if (text.length > 0) return text;
    }
    return '';
  }
  function getOptionLabel(el2) {
    const ariaLabel = el2.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const inner = el2.querySelector(
      '[data-value], .docssharedWizToggleLabeledLabelText, [class*="labelText"], [class*="OptionText"], span'
    );
    if (inner) return inner.textContent.trim();
    return el2.textContent.trim();
  }
  function detectHandler(container) {
    return HANDLERS.find((h) => h.detect(container)) || null;
  }
  function findFormEl() {
    return (
      document.querySelector('form[action*="formResponse"]') ||
      document.querySelector('form#mG61Hd') ||
      document.querySelector('form[jsmodel]') ||
      null
    );
  }
  function findQuestionContainers() {
    const roleItems = [...document.querySelectorAll('[role="listitem"]')].filter((el2) =>
      el2.querySelector(WIDGET_SELECTOR)
    );
    if (roleItems.length > 0) return roleItems;
    const dataParamItems = [...document.querySelectorAll('div[data-params]')].filter((el2) =>
      el2.querySelector(WIDGET_SELECTOR)
    );
    if (dataParamItems.length > 0) return dataParamItems;
    const classItems = [
      ...document.querySelectorAll(
        '.freebirdFormviewerViewItemsItemItem, .freebirdFormviewerComponentsQuestionBaseRoot'
      ),
    ].filter((el2) => el2.querySelector(WIDGET_SELECTOR));
    if (classItems.length > 0) return classItems;
    const formEl = findFormEl();
    if (!formEl) return [];
    const headings = [...formEl.querySelectorAll('[role="heading"]')].filter((h) => {
      const level = parseInt(h.getAttribute('aria-level') || '1', 10);
      return level >= 2;
    });
    const seen = /* @__PURE__ */ new Set();
    const containers = [];
    for (const heading of headings) {
      let el2 = heading.parentElement;
      while (el2 && el2 !== formEl) {
        if (el2.querySelector(WIDGET_SELECTOR) && !seen.has(el2)) {
          seen.add(el2);
          containers.push(el2);
          break;
        }
        el2 = el2.parentElement;
      }
    }
    return containers;
  }
  function captureVisible() {
    const containers = findQuestionContainers();
    const results = [];
    for (const container of containers) {
      const label = getQuestionLabel(container);
      if (!label) continue;
      const handler = detectHandler(container);
      if (!handler) continue;
      const values = handler.read(container);
      const options = handler.readOptions ? handler.readOptions(container) : null;
      const key = hashKey(label, handler.type);
      results.push({ key, label, type: handler.type, values, options });
      log('captured', { key, label, type: handler.type, values, options });
    }
    return results;
  }
  function getCurrentFieldMap() {
    const containers = findQuestionContainers();
    const map = {};
    for (const container of containers) {
      const label = getQuestionLabel(container);
      if (!label) continue;
      const handler = detectHandler(container);
      if (!handler) continue;
      const values = handler.read(container);
      const key = hashKey(label, handler.type);
      map[key] = { label, type: handler.type, values, container, handler };
    }
    return map;
  }
  function detectConflicts(savedFields) {
    const currentMap = getCurrentFieldMap();
    return savedFields
      .filter((saved) => {
        const current = currentMap[saved.key];
        if (!current) return false;
        const hasValue = current.values.length > 0 && current.values.some((v) => v.trim() !== '');
        if (!hasValue) return false;
        if (JSON.stringify(current.values) === JSON.stringify(saved.values)) {
          return false;
        }
        return true;
      })
      .map((saved) => ({
        key: saved.key,
        label: saved.label,
        type: saved.type,
        savedValues: saved.values,
        currentValues: currentMap[saved.key].values,
      }));
  }
  async function applyFields(savedFields, overwriteMap = {}) {
    const currentMap = getCurrentFieldMap();
    for (const saved of savedFields) {
      const decision = overwriteMap[saved.key];
      if (decision === false) continue;
      const current = currentMap[saved.key];
      if (!current) {
        log('field not on current page, skipping:', saved.label);
        continue;
      }
      const hasValue = current.values.length > 0 && current.values.some((v) => v.trim() !== '');
      if (hasValue && decision !== true) continue;
      log('applying field:', saved.label, '\u2190', saved.values);
      await current.handler.write(current.container, saved.values);
    }
  }
  function detectUpdateConflicts(savedFields, currentFields) {
    const savedMap = {};
    for (const s of savedFields) savedMap[s.key] = s;
    const conflicts = [];
    for (const current of currentFields) {
      const saved = savedMap[current.key];
      if (saved) {
        const hasSavedValue = saved.values.length > 0 && saved.values.some((v) => v.trim() !== '');
        const hasCurrentValue =
          current.values.length > 0 && current.values.some((v) => v.trim() !== '');
        if (
          hasSavedValue &&
          hasCurrentValue &&
          JSON.stringify(current.values) !== JSON.stringify(saved.values)
        ) {
          conflicts.push({
            key: current.key,
            label: current.label,
            currentValues: current.values,
            savedValues: saved.values,
          });
        }
      }
    }
    return conflicts;
  }
  function mergeFields(savedFields, currentFields, overwriteMap) {
    const merged = [...savedFields];
    const savedMap = {};
    merged.forEach((f, i) => (savedMap[f.key] = i));
    for (const current of currentFields) {
      const savedIdx = savedMap[current.key];
      if (savedIdx !== void 0) {
        const decision = overwriteMap[current.key];
        if (decision === true) {
          merged[savedIdx] = { ...merged[savedIdx], values: current.values };
        } else if (decision === void 0) {
          const hasCurrentValue =
            current.values.length > 0 && current.values.some((v) => v.trim() !== '');
          if (hasCurrentValue) {
            merged[savedIdx] = { ...merged[savedIdx], values: current.values };
          }
        }
      } else {
        merged.push(current);
      }
    }
    return merged;
  }
  var WIDGET_SELECTOR,
    linearScaleHandler,
    dateHandler,
    timeHandler,
    textareaHandler,
    checkboxHandler,
    dropdownHandler,
    radioHandler,
    textHandler,
    HANDLERS;
  var init_fields = __esm({
    'google_forms/core/fields.js'() {
      init_hash();
      init_logging();
      WIDGET_SELECTOR =
        'input, textarea, [role="radiogroup"], [role="radio"], [role="checkbox"], [role="listbox"], select';
      linearScaleHandler = {
        type: 'linearScale',
        detect(container) {
          const group = container.querySelector('[role="radiogroup"]');
          if (!group) return false;
          const radios = [...group.querySelectorAll('[role="radio"]')];
          if (radios.length < 2) return false;
          return radios.every((r) => /^\d+$/.test(getOptionLabel(r).trim()));
        },
        read(container) {
          const checked = container.querySelector('[role="radio"][aria-checked="true"]');
          return checked ? [getOptionLabel(checked)] : [];
        },
        readOptions(container) {
          const group = container.querySelector('[role="radiogroup"]');
          if (!group) return null;
          return [...group.querySelectorAll('[role="radio"]')].map((r) => getOptionLabel(r).trim());
        },
        async write(container, values) {
          if (!values[0]) return;
          const radios = [...container.querySelectorAll('[role="radio"]')];
          const target = radios.find((r) => getOptionLabel(r).trim() === values[0].trim());
          if (!target) return;
          simulateClick(target);
          dispatchNativeEvents(target);
        },
      };
      dateHandler = {
        type: 'date',
        detect(container) {
          if (container.querySelector('input[type="date"]')) return true;
          if (!container.querySelector('[role="group"]')) return false;
          return !!(
            container.querySelector('[aria-label*="month" i]') ||
            container.querySelector('[aria-label*="day" i]') ||
            container.querySelector('[aria-label*="year" i]')
          );
        },
        read(container) {
          const native = container.querySelector('input[type="date"]');
          if (native) return native.value ? [native.value] : [];
          const month = container.querySelector('[aria-label*="month" i]')?.value?.trim() || '';
          const day = container.querySelector('[aria-label*="day" i]')?.value?.trim() || '';
          const year = container.querySelector('[aria-label*="year" i]')?.value?.trim() || '';
          if (!month && !day && !year) return [];
          return [
            `${year}-${String(parseInt(month) || 0).padStart(2, '0')}-${String(parseInt(day) || 0).padStart(2, '0')}`,
          ];
        },
        async write(container, values) {
          if (!values[0]) return;
          const native = container.querySelector('input[type="date"]');
          if (native) {
            setNativeValue(native, values[0]);
            return;
          }
          const parts = values[0].split('-');
          const year = parts[0] || '';
          const month = String(parseInt(parts[1]) || 0);
          const day = String(parseInt(parts[2]) || 0);
          const setField = (selector, val) => {
            const el2 = container.querySelector(selector);
            if (el2) setNativeValue(el2, val);
          };
          setField('[aria-label*="month" i]', month);
          setField('[aria-label*="day" i]', day);
          setField('[aria-label*="year" i]', year);
        },
      };
      timeHandler = {
        type: 'time',
        detect(container) {
          if (container.querySelector('input[type="time"]')) return true;
          if (!container.querySelector('[role="group"]')) return false;
          return !!(
            container.querySelector('[aria-label*="hour" i]') ||
            container.querySelector('[aria-label*="minute" i]')
          );
        },
        read(container) {
          const native = container.querySelector('input[type="time"]');
          if (native) return native.value ? [native.value] : [];
          const hour = container.querySelector('[aria-label*="hour" i]')?.value?.trim() || '';
          const minute = container.querySelector('[aria-label*="minute" i]')?.value?.trim() || '';
          if (!hour && !minute) return [];
          return [
            `${String(parseInt(hour) || 0).padStart(2, '0')}:${String(parseInt(minute) || 0).padStart(2, '0')}`,
          ];
        },
        async write(container, values) {
          if (!values[0]) return;
          const native = container.querySelector('input[type="time"]');
          if (native) {
            setNativeValue(native, values[0]);
            return;
          }
          const [hour, minute] = values[0].split(':');
          const setField = (selector, val) => {
            const el2 = container.querySelector(selector);
            if (el2) setNativeValue(el2, val);
          };
          setField('[aria-label*="hour" i]', String(parseInt(hour) || 0));
          setField('[aria-label*="minute" i]', String(parseInt(minute) || 0));
          const ampm = container.querySelector('[aria-label*="AM" i], [aria-label*="PM" i]');
          if (ampm) {
            const h = parseInt(hour) || 0;
            setNativeValue(ampm, h >= 12 ? 'PM' : 'AM');
          }
        },
      };
      textareaHandler = {
        type: 'textarea',
        detect(container) {
          return !!container.querySelector('textarea');
        },
        read(container) {
          const ta = container.querySelector('textarea');
          return ta?.value ? [ta.value] : [];
        },
        async write(container, values) {
          const ta = container.querySelector('textarea');
          if (!ta || !values[0]) return;
          setNativeValue(ta, values[0]);
        },
      };
      checkboxHandler = {
        type: 'checkbox',
        detect(container) {
          return container.querySelectorAll('[role="checkbox"]').length > 0;
        },
        read(container) {
          return [...container.querySelectorAll('[role="checkbox"][aria-checked="true"]')].map(
            getOptionLabel
          );
        },
        readOptions(container) {
          return [...container.querySelectorAll('[role="checkbox"]')].map((cb) =>
            getOptionLabel(cb).trim()
          );
        },
        async write(container, values) {
          const checkboxes = [...container.querySelectorAll('[role="checkbox"]')];
          for (const cb of checkboxes) {
            const label = getOptionLabel(cb).trim();
            const shouldBeChecked = values.some((v) => v.trim() === label);
            const isChecked = cb.getAttribute('aria-checked') === 'true';
            if (shouldBeChecked !== isChecked) {
              simulateClick(cb);
              dispatchNativeEvents(cb);
              await delay(30);
            }
          }
        },
      };
      dropdownHandler = {
        type: 'dropdown',
        detect(container) {
          return !!(
            container.querySelector('[role="listbox"]') || container.querySelector('select')
          );
        },
        read(container) {
          const select = container.querySelector('select');
          if (select && select.value) {
            return [select.options[select.selectedIndex]?.text?.trim() || select.value];
          }
          const listbox = container.querySelector('[role="listbox"]');
          if (!listbox) return [];
          const selected = listbox.querySelector('[aria-selected="true"]');
          if (selected) return [selected.textContent.trim()];
          const text = listbox.textContent.trim();
          return text && text.toLowerCase() !== 'choose' ? [text] : [];
        },
        readOptions(container) {
          const select = container.querySelector('select');
          if (select) {
            return [...select.options]
              .map((o) => o.text.trim())
              .filter((t) => t.toLowerCase() !== 'choose' && t !== '');
          }
          const listbox = container.querySelector('[role="listbox"]');
          if (!listbox) return null;
          const options = [...listbox.querySelectorAll('[role="option"]')];
          if (options.length > 0) {
            return options
              .map((o) => getOptionLabel(o).trim())
              .filter((t) => t.toLowerCase() !== 'choose' && t !== '');
          }
          return null;
        },
        async write(container, values) {
          if (!values[0]) return;
          const select = container.querySelector('select');
          if (select) {
            const option = [...select.options].find((o) => o.text.trim() === values[0].trim());
            if (option) {
              select.value = option.value;
              dispatchNativeEvents(select);
            }
            return;
          }
          const listbox = container.querySelector('[role="listbox"]');
          if (!listbox) return;
          simulateClick(listbox);
          await delay(250);
          const options = [...document.querySelectorAll('[role="option"]')];
          const target = options.find((o) => o.textContent.trim() === values[0].trim());
          if (target) {
            simulateClick(target);
            await delay(50);
            dispatchNativeEvents(listbox);
          } else {
            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
        },
      };
      radioHandler = {
        type: 'radio',
        detect(container) {
          return !!(
            container.querySelector('[role="radiogroup"]') ||
            container.querySelector('[role="radio"]')
          );
        },
        read(container) {
          const checked = container.querySelector('[role="radio"][aria-checked="true"]');
          return checked ? [getOptionLabel(checked)] : [];
        },
        readOptions(container) {
          return [...container.querySelectorAll('[role="radio"]')].map((r) =>
            getOptionLabel(r).trim()
          );
        },
        async write(container, values) {
          if (!values[0]) return;
          const radios = [...container.querySelectorAll('[role="radio"]')];
          const target = radios.find((r) => getOptionLabel(r).trim() === values[0].trim());
          if (!target) return;
          simulateClick(target);
          dispatchNativeEvents(target);
        },
      };
      textHandler = {
        type: 'text',
        detect(container) {
          const input = container.querySelector('input[type="text"], input:not([type])');
          if (!input) return false;
          if (container.querySelector('[role="group"]')) return false;
          return true;
        },
        read(container) {
          const input = container.querySelector('input[type="text"], input:not([type])');
          return input?.value ? [input.value] : [];
        },
        async write(container, values) {
          const input = container.querySelector('input[type="text"], input:not([type])');
          if (!input || !values[0]) return;
          setNativeValue(input, values[0]);
        },
      };
      HANDLERS = [
        linearScaleHandler,
        // before radio (both use radiogroup)
        dateHandler,
        // before text (date containers have plain inputs)
        timeHandler,
        // before text (time containers have plain inputs)
        textareaHandler,
        checkboxHandler,
        dropdownHandler,
        radioHandler,
        textHandler,
        // most generic — always last
      ];
    },
  });

  // google_forms/core/ui.js
  function ensureStyles() {
    const id = `${DOM_ID_PREFIX}styles`;
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = main_default;
    document.head.appendChild(style);
  }
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
  function relativeTime(isoString) {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const m = Math.floor(diff / 6e4);
    const h = Math.floor(diff / 36e5);
    const d = Math.floor(diff / 864e5);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 7) return `${d}d ago`;
    return new Date(isoString).toLocaleDateString();
  }
  function showStatus(container, message, type = 'success') {
    const existing = container.querySelector('.gf-saver-status');
    if (existing) existing.remove();
    const banner = el('div', { className: `gf-saver-status ${type}`, textContent: message });
    container.appendChild(banner);
    setTimeout(() => banner.remove(), 3500);
  }
  function createFloatingButton(formId) {
    currentFormId = formId;
    ensureStyles();
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
          e.stopPropagation();
          openMainModal(formId).catch((err) => {
            error('[GF-Saver] Modal failed to open:', err);
            createStatusToast('\u26A0\uFE0F Form Saver error \u2014 see console for details');
          });
        },
      },
      el('span', { className: 'gf-saver-icon', textContent: '\u{1F4CB}' }),
      ' Form Saver'
    );
    document.body.appendChild(btn);
    log('floating button created');
  }
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
    const header = el(
      'div',
      { className: 'gf-saver-modal-header' },
      el('span', { className: 'gf-saver-modal-icon', textContent: '\u{1F4CB}' }),
      el(
        'div',
        { style: 'flex:1' },
        el('p', { className: 'gf-saver-modal-title', textContent: 'Form Saver' }),
        el('p', {
          className: 'gf-saver-modal-subtitle',
          textContent: `${saveNames.length} save${saveNames.length !== 1 ? 's' : ''} for this form`,
        })
      ),
      el('button', {
        className: 'gf-saver-close-btn',
        textContent: '\xD7',
        onClick: removeBackdrop,
      })
    );
    const nameInput = el('input', {
      className: 'gf-saver-input',
      type: 'text',
      placeholder: 'Save name\u2026',
      id: `${DOM_ID_PREFIX}name-input`,
    });
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
        saveBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'gf-saver-spinner';
        saveBtn.appendChild(spinner);
        saveBtn.appendChild(document.createTextNode('Saving\u2026'));
        try {
          const fields = captureVisible();
          if (fields.length === 0) {
            showStatus(statusContainer, '\u26A0\uFE0F No fields found on this page.', 'error');
            return;
          }
          if (saveNames.includes(name)) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            handleSaveToExisting(formId, name, saves[name], statusContainer);
            return;
          }
          await writeSave(formId, name, fields);
          nameInput.value = '';
          showStatus(
            statusContainer,
            `\u2713 Saved "${name}" (${fields.length} fields)`,
            'success'
          );
          setTimeout(() => openMainModal(formId), 400);
        } catch (err) {
          error('writeSave error:', err);
          showStatus(statusContainer, '\u2717 Failed to save. Check console.', 'error');
        } finally {
          if (!saveNames.includes(name)) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
          }
        }
      },
    });
    const saveAs = el('div', { className: 'gf-saver-saveas' }, nameInput, saveBtn);
    statusContainer = el('div', {});
    let listEl;
    if (saveNames.length === 0) {
      listEl = el(
        'div',
        { className: 'gf-saver-empty' },
        el('span', { className: 'gf-saver-empty-icon', textContent: '\u{1F5C2}\uFE0F' }),
        'No saves yet. Fill in the form and click Save above.'
      );
    } else {
      listEl = el('div', { className: 'gf-saver-saves-list' });
      for (const name of saveNames) {
        listEl.appendChild(buildSaveRow(formId, name, saves[name], statusContainer));
      }
    }
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
      listEl
    );
    const modal = el('div', { className: 'gf-saver-modal' }, header, body);
    const backdrop = el('div', { id: `${DOM_ID_PREFIX}backdrop` }, modal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) removeBackdrop();
    });
    document.body.appendChild(backdrop);
    setTimeout(() => nameInput.focus(), 50);
  }
  function buildSaveRow(formId, name, save, statusContainer) {
    const meta = `${save.fieldCount ?? '?'} fields \xB7 saved ${relativeTime(save.modified || save.created)}`;
    const loadBtn = el('button', {
      className: 'gf-saver-btn-secondary',
      textContent: 'Load',
      onClick: () => handleLoad(formId, name, save, statusContainer),
    });
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
            showStatus(
              statusContainer,
              `\u2717 Could not rename \u2014 "${newName}" may already exist.`,
              'error'
            );
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
    const editBtn = el('button', {
      className: 'gf-saver-btn-secondary',
      textContent: 'Edit',
      onClick: () => openEditModal(formId, name, save, statusContainer),
    });
    const updateBtn = el('button', {
      className: 'gf-saver-btn-primary',
      textContent: 'Update',
      onClick: () => handleSaveToExisting(formId, name, save, statusContainer),
    });
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
      el(
        'div',
        { className: 'gf-saver-save-info' },
        nameEl,
        el('div', { className: 'gf-saver-save-meta', textContent: meta })
      ),
      el(
        'div',
        { className: 'gf-saver-save-actions' },
        loadBtn,
        updateBtn,
        editBtn,
        renameBtn,
        deleteBtn
      )
    );
  }
  async function handleLoad(formId, saveName, save, statusContainer) {
    const savedFields = save.fields || [];
    if (savedFields.length === 0) {
      showStatus(statusContainer, '\u26A0\uFE0F This save has no fields.', 'error');
      return;
    }
    const conflicts = detectConflicts(savedFields);
    if (conflicts.length === 0) {
      removeBackdrop();
      await applyFields(savedFields, {});
      createStatusToast(`\u2713 Loaded "${saveName}" \u2014 ${savedFields.length} fields applied`);
    } else {
      openConflictModal(formId, saveName, savedFields, conflicts, 'load', statusContainer);
    }
  }
  async function handleSaveToExisting(formId, saveName, save, statusContainer) {
    const savedFields = save.fields || [];
    const currentFields = captureVisible();
    if (currentFields.length === 0) {
      showStatus(statusContainer, '\u26A0\uFE0F No fields found on this page.', 'error');
      return;
    }
    const conflicts = detectUpdateConflicts(savedFields, currentFields);
    if (conflicts.length === 0) {
      const mergedFields = mergeFields(savedFields, currentFields, {});
      removeBackdrop();
      try {
        await writeSave(formId, saveName, mergedFields);
        createStatusToast(`\u2713 Updated "${saveName}"`);
        setTimeout(() => openMainModal(formId), 200);
      } catch (err) {
        error('updateSave error:', err);
        showStatus(statusContainer, '\u2717 Failed to update. Check console.', 'error');
      }
    } else {
      openConflictModal(
        formId,
        saveName,
        savedFields,
        conflicts,
        'save',
        statusContainer,
        currentFields
      );
    }
  }
  function openEditModal(formId, saveName, save, statusContainer) {
    removeBackdrop();
    const savedFields = save.fields || [];
    const fieldInputs = [];
    const header = el(
      'div',
      { className: 'gf-saver-modal-header' },
      el('span', { className: 'gf-saver-modal-icon', textContent: '\u270F\uFE0F' }),
      el(
        'div',
        { style: 'flex:1' },
        el('p', { className: 'gf-saver-modal-title', textContent: `Edit "${saveName}"` }),
        el('p', {
          className: 'gf-saver-modal-subtitle',
          textContent: `${savedFields.length} field${savedFields.length !== 1 ? 's' : ''} \u2014 edit saved values`,
        })
      ),
      el('button', {
        className: 'gf-saver-close-btn',
        textContent: '\xD7',
        onClick: () => openMainModal(formId),
      })
    );
    const thead = el(
      'thead',
      {},
      el('tr', {}, el('th', { textContent: 'Field' }), el('th', { textContent: 'Saved Value' }))
    );
    const tbody = el('tbody', {});
    for (const field of savedFields) {
      let inputEl;
      if (field.options && field.options.length > 0) {
        if (field.type === 'checkbox') {
          inputEl = el('select', {
            className: 'gf-saver-edit-input gf-saver-edit-select',
            multiple: true,
            // Show up to 4 items before scrolling
            size: Math.min(field.options.length, 4),
          });
          for (const opt of field.options) {
            const optionEl = el('option', { value: opt, textContent: opt });
            if (field.values.includes(opt)) {
              optionEl.selected = true;
            }
            inputEl.appendChild(optionEl);
          }
        } else {
          inputEl = el('select', {
            className: 'gf-saver-edit-input gf-saver-edit-select',
          });
          inputEl.appendChild(el('option', { value: '', textContent: '-- Select --' }));
          for (const opt of field.options) {
            const optionEl = el('option', { value: opt, textContent: opt });
            if (field.values.includes(opt)) {
              optionEl.selected = true;
            }
            inputEl.appendChild(optionEl);
          }
        }
      } else {
        inputEl = el('input', {
          className: 'gf-saver-edit-input',
          type: 'text',
          value: field.values.join(', '),
        });
      }
      const getValue = () => {
        if (inputEl.tagName === 'SELECT') {
          if (inputEl.multiple) {
            return [...inputEl.selectedOptions].map((o) => o.value);
          } else {
            return inputEl.value ? [inputEl.value] : [];
          }
        }
        return inputEl.value
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '');
      };
      fieldInputs.push({ field, getValue });
      tbody.appendChild(
        el(
          'tr',
          {},
          el('td', { className: 'gf-saver-conflict-field', textContent: field.label }),
          el('td', { className: 'gf-saver-conflict-new' }, inputEl)
        )
      );
    }
    const table = el('table', { className: 'gf-saver-conflict-table' }, thead, tbody);
    const body = el(
      'div',
      { className: 'gf-saver-modal-body' },
      el('p', {
        style: 'font-size:12px;color:rgba(255,255,255,0.5);margin:0 0 6px',
        textContent: 'Multiple values should be comma-separated.',
      }),
      table
    );
    const saveBtn = el('button', {
      className: 'gf-saver-btn-primary',
      textContent: 'Save Changes',
      onClick: async () => {
        const updatedFields = fieldInputs.map(({ field, getValue }) => ({
          ...field,
          values: getValue(),
        }));
        removeBackdrop();
        try {
          await writeSave(formId, saveName, updatedFields);
          createStatusToast(`\u2713 Updated "${saveName}"`);
          setTimeout(() => openMainModal(formId), 200);
        } catch (err) {
          error('editSave error:', err);
          createStatusToast('\u2717 Failed to update save');
        }
      },
    });
    const cancelBtn = el('button', {
      className: 'gf-saver-btn-secondary',
      textContent: 'Cancel',
      onClick: () => openMainModal(formId),
    });
    const footer = el('div', { className: 'gf-saver-conflict-footer' }, cancelBtn, saveBtn);
    const modal = el('div', { className: 'gf-saver-modal' }, header, body, footer);
    const backdrop = el('div', { id: `${DOM_ID_PREFIX}backdrop` }, modal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) openMainModal(formId);
    });
    document.body.appendChild(backdrop);
  }
  function openConflictModal(
    formId,
    saveName,
    savedFields,
    conflicts,
    mode = 'load',
    statusContainer = null,
    currentFields = null
  ) {
    removeBackdrop();
    const isLoad = mode === 'load';
    const checkboxes = {};
    const header = el(
      'div',
      { className: 'gf-saver-modal-header' },
      el('span', { className: 'gf-saver-modal-icon', textContent: '\u26A0\uFE0F' }),
      el(
        'div',
        { style: 'flex:1' },
        el('p', {
          className: 'gf-saver-modal-title',
          textContent: isLoad
            ? 'Some fields already have values'
            : 'Some fields have different saved values',
        }),
        el('p', {
          className: 'gf-saver-modal-subtitle',
          textContent: `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} \u2014 choose what to overwrite`,
        })
      ),
      el('button', {
        className: 'gf-saver-close-btn',
        textContent: '\xD7',
        onClick: removeBackdrop,
      })
    );
    const thead = el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { textContent: 'Field' }),
        el('th', { textContent: isLoad ? 'Current' : 'Current Form' }),
        el('th', { textContent: isLoad ? 'Saved' : 'In Save' }),
        el('th', { textContent: '\u2713' })
      )
    );
    const tbody = el('tbody', {});
    for (const conflict of conflicts) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = true;
      checkboxes[conflict.key] = cb;
      tbody.appendChild(
        el(
          'tr',
          {},
          el('td', { className: 'gf-saver-conflict-field', textContent: conflict.label }),
          el('td', {
            className: 'gf-saver-conflict-value',
            textContent: conflict.currentValues.join(', '),
          }),
          el('td', {
            className: 'gf-saver-conflict-new',
            textContent: conflict.savedValues.join(', '),
          }),
          el('td', { className: 'gf-saver-conflict-check' }, cb)
        )
      );
    }
    const table = el('table', { className: 'gf-saver-conflict-table' }, thead, tbody);
    const body = el(
      'div',
      { className: 'gf-saver-modal-body' },
      el('p', {
        style: 'font-size:12px;color:rgba(255,255,255,0.5);margin:0 0 6px',
        textContent: isLoad
          ? 'Checked fields will be overwritten with the saved value.'
          : 'Checked fields in the save will be overwritten with the current form value.',
      }),
      table
    );
    const applyBtn = el('button', {
      className: 'gf-saver-btn-primary',
      textContent: 'Apply selected',
      onClick: async () => {
        const overwriteMap = {};
        for (const [key, cb] of Object.entries(checkboxes)) {
          overwriteMap[key] = cb.checked;
        }
        removeBackdrop();
        if (isLoad) {
          await applyFields(savedFields, overwriteMap);
          createStatusToast(`\u2713 Loaded "${saveName}"`);
        } else {
          const mergedFields = mergeFields(savedFields, currentFields, overwriteMap);
          try {
            await writeSave(formId, saveName, mergedFields);
            createStatusToast(`\u2713 Updated "${saveName}"`);
            setTimeout(() => openMainModal(formId), 200);
          } catch (err) {
            error('updateSave error:', err);
            createStatusToast('\u2717 Failed to update save');
          }
        }
      },
    });
    const skipBtn = el('button', {
      className: 'gf-saver-btn-secondary',
      textContent: 'Skip conflicts',
      onClick: async () => {
        const overwriteMap = {};
        for (const key of Object.keys(checkboxes)) {
          overwriteMap[key] = false;
        }
        removeBackdrop();
        if (isLoad) {
          await applyFields(savedFields, overwriteMap);
          createStatusToast(`\u2713 Loaded "${saveName}" (conflicts skipped)`);
        } else {
          const mergedFields = mergeFields(savedFields, currentFields, overwriteMap);
          try {
            await writeSave(formId, saveName, mergedFields);
            createStatusToast(`\u2713 Updated "${saveName}" (conflicts skipped)`);
            setTimeout(() => openMainModal(formId), 200);
          } catch (err) {
            error('updateSave error:', err);
            createStatusToast('\u2717 Failed to update save');
          }
        }
      },
    });
    const cancelBtn = el('button', {
      className: 'gf-saver-btn-secondary',
      textContent: 'Cancel',
      onClick: () => {
        if (!isLoad) {
          openMainModal(formId);
        } else {
          removeBackdrop();
        }
      },
    });
    const footer = el(
      'div',
      { className: 'gf-saver-conflict-footer' },
      cancelBtn,
      skipBtn,
      applyBtn
    );
    const modal = el('div', { className: 'gf-saver-modal' }, header, body, footer);
    const backdrop = el('div', { id: `${DOM_ID_PREFIX}backdrop` }, modal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        if (!isLoad) openMainModal(formId);
        else removeBackdrop();
      }
    });
    document.body.appendChild(backdrop);
  }
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
  async function autoLoadIfSingleSave(formId) {
    try {
      const saves = await readAllSaves(formId);
      const names = Object.keys(saves);
      if (names.length === 1) {
        const name = names[0];
        const save = saves[name];
        log(`[GF-Saver] Auto-loading single save: ${name}`);
        const dummyContainer = document.createElement('div');
        await handleLoad(formId, name, save, dummyContainer);
      }
    } catch (err) {
      error('[GF-Saver] autoLoadIfSingleSave error:', err);
    }
  }
  var currentFormId;
  var init_ui = __esm({
    'google_forms/core/ui.js'() {
      init_main();
      init_storage();
      init_fields();
      init_logging();
      init_constants();
      currentFormId = null;
    },
  });

  // google_forms/entry.js
  var require_entry = __commonJS({
    'google_forms/entry.js'() {
      init_init();
      init_storage();
      init_ui();
      init_logging();
      var lastInitUrl = '';
      function init() {
        const href = location.href;
        if (href === lastInitUrl) return;
        lastInitUrl = href;
        const formId = getFormId(href);
        if (!formId) {
          log('no form ID in URL, skipping init');
          return;
        }
        log('initialising for', href, '\u2014 form ID:', formId);
        waitForForm(() => {
          log('form ready \u2014 injecting/refreshing UI');
          createFloatingButton(formId);
          autoLoadIfSingleSave(formId);
        });
      }
      (function patchHistory() {
        function onNav() {
          setTimeout(init, 300);
        }
        const origPush = history.pushState.bind(history);
        history.pushState = function (...args) {
          origPush(...args);
          onNav();
        };
        const origReplace = history.replaceState.bind(history);
        history.replaceState = function (...args) {
          origReplace(...args);
          onNav();
        };
        window.addEventListener('popstate', onNav);
      })();
      init();
    },
  });
  require_entry();
})();
//# sourceMappingURL=google-forms-saver.user.js.map
