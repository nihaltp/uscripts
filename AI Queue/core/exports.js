// Ensure the `AIQueue` namespace exists. This file intentionally no longer
// creates backward-compatible global shims — code should reference
// `AIQueue.*` directly to avoid fragile cross-file globals.
window.AIQueue = window.AIQueue || {};
