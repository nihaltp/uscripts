// core/hash.js

/**
 * djb2 hash — produces a stable 32-bit unsigned integer from a string.
 * @param {string} str
 * @returns {number}
 */
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash | 0; // keep 32-bit signed
  }
  return hash >>> 0; // convert to unsigned
}

/**
 * Produces a stable 8-character hex key from a question label and field type.
 * Normalises the label to lowercase + trimmed so minor whitespace differences
 * don't create different keys.
 *
 * @param {string} label  The question's visible label text.
 * @param {string} type   The handler type (e.g. "text", "radio").
 * @returns {string}      8-char hex string, e.g. "a3f82c1d".
 */
export function hashKey(label, type) {
  const normalized = `${label.trim().toLowerCase()}|${type}`;
  return djb2(normalized).toString(16).padStart(8, '0');
}
