// core/fields.js
import { hashKey } from './hash.js';
import { log } from './logging.js';

// ── DOM Utilities ────────────────────────────────────────────────────────────

/**
 * Dispatches the standard trio of events that React/Angular/Vue listen to
 * so they register the programmatic value change.
 */
function dispatchNativeEvents(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

/**
 * Full mouse-click simulation — required for Google's custom ARIA widgets
 * since they don't respond to element.click() alone.
 */
function simulateClick(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/**
 * Sets a native input/textarea value while bypassing React's synthetic event
 * system, then fires standard events so the framework picks it up.
 */
function setNativeValue(el, value) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  dispatchNativeEvents(el);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Label extraction ─────────────────────────────────────────────────────────

const WIDGET_SELECTOR =
  'input, textarea, [role="radiogroup"], [role="radio"], [role="checkbox"], [role="listbox"], select';

/**
 * Extracts the human-readable question label from a question container.
 * Tries multiple known Google Forms DOM patterns.
 */
function getQuestionLabel(container) {
  // 1. Semantic heading role (most reliable)
  const heading = container.querySelector('[role="heading"]');
  if (heading) return heading.textContent.trim();

  // 2. Known Google Forms class name (fallback for older renderers)
  const titleEl = container.querySelector(
    '.freebirdFormviewerViewItemsItemItemTitle, .exportItemTitle',
  );
  if (titleEl) return titleEl.textContent.trim();

  // 3. First child element that doesn't itself contain an interactive widget
  for (const child of container.children) {
    if (child.querySelector(WIDGET_SELECTOR)) continue;
    const text = child.textContent.trim();
    if (text.length > 0) return text;
  }

  return '';
}

/**
 * Extracts the visible text label of an ARIA option (radio/checkbox/option).
 * Prefers aria-label, then a labelling child, then textContent.
 */
function getOptionLabel(el) {
  // aria-label wins
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // Known inner label elements
  const inner = el.querySelector(
    '[data-value], .docssharedWizToggleLabeledLabelText, [class*="labelText"], [class*="OptionText"], span',
  );
  if (inner) return inner.textContent.trim();

  return el.textContent.trim();
}

// ── Handler registry ─────────────────────────────────────────────────────────
//
// Each handler must implement:
//   type:   string   — stable identifier stored in saves
//   detect: (container) => boolean
//   read:   (container) => string[]
//   write:  (container, values: string[]) => Promise<void>
//
// ORDER MATTERS — more specific handlers must appear before generic ones.

// ── linearScale ──────────────────────────────────────────────────────────────
// Must come before `radio` since both use [role="radiogroup"].
const linearScaleHandler = {
  type: 'linearScale',

  detect(container) {
    const group = container.querySelector('[role="radiogroup"]');
    if (!group) return false;
    const radios = [...group.querySelectorAll('[role="radio"]')];
    if (radios.length < 2) return false;
    // All option labels must be numeric (1, 2, 3 … or similar)
    return radios.every((r) => /^\d+$/.test(getOptionLabel(r).trim()));
  },

  read(container) {
    const checked = container.querySelector('[role="radio"][aria-checked="true"]');
    return checked ? [getOptionLabel(checked)] : [];
  },

  readOptions(container) {
    const group = container.querySelector('[role="radiogroup"]');
    if (!group) return null;
    return [...group.querySelectorAll('[role="radio"]')].map(r => getOptionLabel(r).trim());
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

// ── date ─────────────────────────────────────────────────────────────────────
// Must come before `text` because date fields contain plain <input> elements.
const dateHandler = {
  type: 'date',

  detect(container) {
    if (container.querySelector('input[type="date"]')) return true;
    // Google Forms date: a [role="group"] with separate month/day/year inputs
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
    // Store as YYYY-MM-DD
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

    // Parse YYYY-MM-DD
    const parts = values[0].split('-');
    const year = parts[0] || '';
    const month = String(parseInt(parts[1]) || 0);
    const day = String(parseInt(parts[2]) || 0);

    const setField = (selector, val) => {
      const el = container.querySelector(selector);
      if (el) setNativeValue(el, val);
    };

    setField('[aria-label*="month" i]', month);
    setField('[aria-label*="day" i]', day);
    setField('[aria-label*="year" i]', year);
  },
};

// ── time ─────────────────────────────────────────────────────────────────────
const timeHandler = {
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
    // Store as HH:MM (24h)
    return [`${String(parseInt(hour) || 0).padStart(2, '0')}:${String(parseInt(minute) || 0).padStart(2, '0')}`];
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
      const el = container.querySelector(selector);
      if (el) setNativeValue(el, val);
    };

    setField('[aria-label*="hour" i]', String(parseInt(hour) || 0));
    setField('[aria-label*="minute" i]', String(parseInt(minute) || 0));

    // Handle AM/PM selector if present
    const ampm = container.querySelector('[aria-label*="AM" i], [aria-label*="PM" i]');
    if (ampm) {
      const h = parseInt(hour) || 0;
      setNativeValue(ampm, h >= 12 ? 'PM' : 'AM');
    }
  },
};

// ── textarea ──────────────────────────────────────────────────────────────────
const textareaHandler = {
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

// ── checkbox ──────────────────────────────────────────────────────────────────
const checkboxHandler = {
  type: 'checkbox',

  detect(container) {
    return container.querySelectorAll('[role="checkbox"]').length > 0;
  },

  read(container) {
    return [...container.querySelectorAll('[role="checkbox"][aria-checked="true"]')].map(
      getOptionLabel,
    );
  },

  readOptions(container) {
    return [...container.querySelectorAll('[role="checkbox"]')].map(cb => getOptionLabel(cb).trim());
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
        await delay(30); // let the DOM settle between clicks
      }
    }
  },
};

// ── dropdown ──────────────────────────────────────────────────────────────────
const dropdownHandler = {
  type: 'dropdown',

  detect(container) {
    return !!(container.querySelector('[role="listbox"]') || container.querySelector('select'));
  },

  read(container) {
    // Native select (rare in Google Forms but possible)
    const select = container.querySelector('select');
    if (select && select.value) {
      return [select.options[select.selectedIndex]?.text?.trim() || select.value];
    }

    const listbox = container.querySelector('[role="listbox"]');
    if (!listbox) return [];

    // Aria-selected option inside the listbox
    const selected = listbox.querySelector('[aria-selected="true"]');
    if (selected) return [selected.textContent.trim()];

    // When closed, Google Forms shows the selected value as the listbox text
    const text = listbox.textContent.trim();
    // Filter out the default placeholder text
    return text && text.toLowerCase() !== 'choose' ? [text] : [];
  },

  readOptions(container) {
    const select = container.querySelector('select');
    if (select) {
      return [...select.options]
        .map(o => o.text.trim())
        .filter(t => t.toLowerCase() !== 'choose' && t !== '');
    }

    const listbox = container.querySelector('[role="listbox"]');
    if (!listbox) return null;
    const options = [...listbox.querySelectorAll('[role="option"]')];
    if (options.length > 0) {
      return options
        .map(o => getOptionLabel(o).trim())
        .filter(t => t.toLowerCase() !== 'choose' && t !== '');
    }
    return null;
  },

  async write(container, values) {
    if (!values[0]) return;

    // Native select
    const select = container.querySelector('select');
    if (select) {
      const option = [...select.options].find((o) => o.text.trim() === values[0].trim());
      if (option) {
        select.value = option.value;
        dispatchNativeEvents(select);
      }
      return;
    }

    // ARIA listbox: open it, wait for options, click the match
    const listbox = container.querySelector('[role="listbox"]');
    if (!listbox) return;

    simulateClick(listbox);
    await delay(250); // wait for dropdown to open and options to render

    // Options may render inside a portal anywhere in the document
    const options = [...document.querySelectorAll('[role="option"]')];
    const target = options.find((o) => o.textContent.trim() === values[0].trim());
    if (target) {
      simulateClick(target);
      await delay(50);
      dispatchNativeEvents(listbox);
    } else {
      // Close without selecting if option not found
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  },
};

// ── radio ─────────────────────────────────────────────────────────────────────
const radioHandler = {
  type: 'radio',

  detect(container) {
    return !!(
      container.querySelector('[role="radiogroup"]') || container.querySelector('[role="radio"]')
    );
  },

  read(container) {
    const checked = container.querySelector('[role="radio"][aria-checked="true"]');
    return checked ? [getOptionLabel(checked)] : [];
  },

  readOptions(container) {
    return [...container.querySelectorAll('[role="radio"]')].map(r => getOptionLabel(r).trim());
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

// ── text ──────────────────────────────────────────────────────────────────────
// Most generic handler — must be last.
const textHandler = {
  type: 'text',

  detect(container) {
    const input = container.querySelector('input[type="text"], input:not([type])');
    if (!input) return false;
    // Exclude containers already claimed by date/time (they also have plain inputs)
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

// ── Ordered handler list (specific → generic) ─────────────────────────────────
const HANDLERS = [
  linearScaleHandler, // before radio (both use radiogroup)
  dateHandler,        // before text (date containers have plain inputs)
  timeHandler,        // before text (time containers have plain inputs)
  textareaHandler,
  checkboxHandler,
  dropdownHandler,
  radioHandler,
  textHandler,        // most generic — always last
];

function detectHandler(container) {
  return HANDLERS.find((h) => h.detect(container)) || null;
}

// ── Question container discovery ──────────────────────────────────────────────

/**
 * Finds the Google Forms root form element.
 */
function findFormEl() {
  return (
    document.querySelector('form[action*="formResponse"]') ||
    document.querySelector('form#mG61Hd') ||
    document.querySelector('form[jsmodel]') ||
    null
  );
}

/**
 * Returns all question containers that are currently visible in the DOM
 * (i.e. on the current page of a multi-page form).
 *
 * Google Forms uses several different DOM structures depending on the
 * renderer version.  We try strategies from most to least specific:
 *
 *  1. [role="listitem"]  — modern renderer
 *  2. div[data-params]   — another renderer variant
 *  3. .freebirdFormviewer* class names — classic renderer
 *  4. Heading-based      — universal fallback: walk up from every
 *     [role="heading"] inside the form to find a container that also
 *     contains a form widget.  Works regardless of class names or roles
 *     on the container itself.
 */
function findQuestionContainers() {
  // ── Strategy 1: role="listitem" ──────────────────────────────────────
  const roleItems = [...document.querySelectorAll('[role="listitem"]')].filter((el) =>
    el.querySelector(WIDGET_SELECTOR),
  );
  if (roleItems.length > 0) return roleItems;

  // ── Strategy 2: data-params ──────────────────────────────────────────
  const dataParamItems = [...document.querySelectorAll('div[data-params]')].filter((el) =>
    el.querySelector(WIDGET_SELECTOR),
  );
  if (dataParamItems.length > 0) return dataParamItems;

  // ── Strategy 3: Classic Freebird class names ─────────────────────────
  const classItems = [
    ...document.querySelectorAll(
      '.freebirdFormviewerViewItemsItemItem, .freebirdFormviewerComponentsQuestionBaseRoot',
    ),
  ].filter((el) => el.querySelector(WIDGET_SELECTOR));
  if (classItems.length > 0) return classItems;

  // ── Strategy 4: Heading-based (universal fallback) ───────────────────
  // Google Forms always puts [role="heading"] on question titles.
  // Walk up from each heading until we find an ancestor that also
  // contains a form widget — that's the question container.
  const formEl = findFormEl();
  if (!formEl) return [];

  const headings = [...formEl.querySelectorAll('[role="heading"]')].filter((h) => {
    const level = parseInt(h.getAttribute('aria-level') || '1', 10);
    // Skip the form title (aria-level="1") — only question headings
    return level >= 2;
  });

  const seen = new Set();
  const containers = [];

  for (const heading of headings) {
    let el = heading.parentElement;
    while (el && el !== formEl) {
      if (el.querySelector(WIDGET_SELECTOR) && !seen.has(el)) {
        seen.add(el);
        containers.push(el);
        break;
      }
      el = el.parentElement;
    }
  }

  return containers;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads all currently visible fields and their values.
 * Skips fields with no detectable handler or no label.
 *
 * @returns {FieldData[]}
 */
export function captureVisible() {
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

/**
 * Returns a map of { key → { label, type, values, container, handler } }
 * for all visible fields. Used for conflict detection and applying saves.
 *
 * @returns {Record<string, CurrentField>}
 */
export function getCurrentFieldMap() {
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

/**
 * Returns fields from a save that conflict with current non-empty field values.
 *
 * @param {FieldData[]} savedFields
 * @returns {ConflictInfo[]}
 */
export function detectConflicts(savedFields) {
  const currentMap = getCurrentFieldMap();
  return savedFields
    .filter((saved) => {
      const current = currentMap[saved.key];
      if (!current) return false;

      const hasValue = current.values.length > 0 && current.values.some((v) => v.trim() !== '');
      if (!hasValue) return false;

      // If the current values are exactly the same as the saved values, it's not a conflict
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

/**
 * Applies saved fields to the current form.
 *
 * @param {FieldData[]}                savedFields
 * @param {Record<string, boolean>}    overwriteMap  key → true (overwrite) | false (skip)
 */
export async function applyFields(savedFields, overwriteMap = {}) {
  const currentMap = getCurrentFieldMap();

  for (const saved of savedFields) {
    const decision = overwriteMap[saved.key]; // true | false | undefined
    if (decision === false) continue;

    const current = currentMap[saved.key];
    if (!current) {
      log('field not on current page, skipping:', saved.label);
      continue;
    }

    const hasValue = current.values.length > 0 && current.values.some((v) => v.trim() !== '');

    // Conflict that hasn't been explicitly resolved → skip
    if (hasValue && decision !== true) continue;

    log('applying field:', saved.label, '←', saved.values);
    await current.handler.write(current.container, saved.values);
  }
}

/**
 * Returns fields that have different values between saved and current, where both have values.
 *
 * @param {FieldData[]} savedFields
 * @param {FieldData[]} currentFields
 * @returns {ConflictInfo[]}
 */
export function detectUpdateConflicts(savedFields, currentFields) {
  const savedMap = {};
  for (const s of savedFields) savedMap[s.key] = s;

  const conflicts = [];
  for (const current of currentFields) {
    const saved = savedMap[current.key];
    if (saved) {
      const hasSavedValue = saved.values.length > 0 && saved.values.some(v => v.trim() !== '');
      const hasCurrentValue = current.values.length > 0 && current.values.some(v => v.trim() !== '');
      if (hasSavedValue && hasCurrentValue && JSON.stringify(current.values) !== JSON.stringify(saved.values)) {
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

/**
 * Merges current fields into saved fields based on an overwrite map.
 * 
 * @param {FieldData[]} savedFields
 * @param {FieldData[]} currentFields
 * @param {Record<string, boolean>} overwriteMap
 * @returns {FieldData[]}
 */
export function mergeFields(savedFields, currentFields, overwriteMap) {
  const merged = [...savedFields];
  const savedMap = {};
  merged.forEach((f, i) => savedMap[f.key] = i);

  for (const current of currentFields) {
    const savedIdx = savedMap[current.key];
    if (savedIdx !== undefined) {
      const decision = overwriteMap[current.key];
      if (decision === true) {
        merged[savedIdx] = { ...merged[savedIdx], values: current.values };
      } else if (decision === undefined) {
        const hasCurrentValue = current.values.length > 0 && current.values.some(v => v.trim() !== '');
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
