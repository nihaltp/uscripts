// Utility functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function debounce(fn, waitMs = 200) {
  let timeoutId = null;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}

function isAttached(element) {
  return !!element && document.contains(element);
}

function isVisible(element) {
  if (!isAttached(element)) return false;
  if (!(element instanceof HTMLElement)) return false;

  const style = window.getComputedStyle(element);
  if (!style) return false;

  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function isActionButtonElement(element) {
  return (
    !!element &&
    element instanceof HTMLElement &&
    element.matches('button, [role="button"], input[type="button"], input[type="submit"]')
  );
}

function isOwnMutation(target) {
  return (
    !!target &&
    (target.closest?.('#pq-panel') || target.closest?.('.pq-toolbar') || target.id === 'pq-panel')
  );
}
