// core/constants.js

/** Set to true during development to enable verbose logging. */
export const DEBUG = false;

/** Bump this whenever the save format changes. */
export const SCHEMA_VERSION = 1;

/** Prefix for all GM_setValue keys. */
export const GM_KEY_PREFIX = 'gf-saver-';

/**
 * CSS selector used to detect that the form has finished rendering.
 *
 * We use the <form> element itself (always present in initial HTML) rather than
 * question containers, because Google Forms dynamically renders questions via
 * JavaScript from FB_PUBLIC_LOAD_DATA_ — any question-container selector can
 * miss if the form uses a different renderer version.
 *
 * Triggering on the form element means the button appears immediately.
 * The actual question containers are resolved lazily when the user
 * clicks Save/Load (by which point JS will have rendered the questions).
 */
export const FORM_READY_SELECTOR =
  'form[action*="formResponse"], form#mG61Hd, form[jsmodel]';

/** ID prefix for all injected DOM elements (prevents collisions). */
export const DOM_ID_PREFIX = 'gf-saver-';
