import { loadSettings, saveSettings } from './settings.js';
import { log } from './logging.js';

export function showSettingsModal() {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '10002'
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    background: 'var(--pq-ui-bg)',
    color: 'var(--pq-ui-text)',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid var(--pq-ui-border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    maxWidth: '400px',
    width: '90%',
    fontFamily: 'sans-serif'
  });

  const settings = loadSettings();

  modal.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 15px;">Queue Settings</h3>
    
    <div style="margin-bottom: 15px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px;">
        <input type="checkbox" id="pq-setting-auto-retry" ${settings.autoRetryEnabled ? 'checked' : ''} style="cursor: pointer;">
        <span>Enable auto-retry on error</span>
      </label>
      <p style="font-size: 12px; opacity: 0.7; margin-top: 4px; margin-bottom: 0;">Automatically click retry button when ChatGPT shows an error</p>
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; font-size: 14px; margin-bottom: 4px;">
        Max retry attempts:
      </label>
      <input type="number" id="pq-setting-max-retries" value="${settings.maxRetries}" min="0" max="10" style="
        width: 100%;
        padding: 6px;
        border: 1px solid var(--pq-ui-border);
        border-radius: 4px;
        background: var(--pq-ui-input-bg);
        color: var(--pq-ui-text);
        font-size: 14px;
      ">
      <p style="font-size: 12px; opacity: 0.7; margin-top: 4px; margin-bottom: 0;">How many times to retry before giving up (0 = disabled)</p>
    </div>

    <div style="margin-bottom: 20px;">
      <label style="display: block; font-size: 14px; margin-bottom: 8px;">
        When retry limit reached:
      </label>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px;">
          <input type="radio" name="pq-setting-retry-action" value="stop" ${settings.retryLimitAction === 'stop' ? 'checked' : ''} style="cursor: pointer;">
          <span>Stop queue</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px;">
          <input type="radio" name="pq-setting-retry-action" value="continue" ${settings.retryLimitAction === 'continue' ? 'checked' : ''} style="cursor: pointer;">
          <span>Send next prompt, requeue failed</span>
        </label>
      </div>
      <p style="font-size: 12px; opacity: 0.7; margin-top: 4px; margin-bottom: 0;">What to do when max retries is exceeded</p>
    </div>

    <div style="text-align: right;">
      <button id="pq-settings-close" style="
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid var(--pq-ui-btn-border);
        background: var(--pq-ui-btn-bg);
        color: var(--pq-ui-text);
        cursor: pointer;
      ">Save & Close</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#pq-settings-close');
  const autoRetryCheckbox = overlay.querySelector('#pq-setting-auto-retry');
  const maxRetriesInput = overlay.querySelector('#pq-setting-max-retries');
  const retryActionRadios = overlay.querySelectorAll('input[name="pq-setting-retry-action"]');

  const saveAndClose = () => {
    const newSettings = {
      autoRetryEnabled: autoRetryCheckbox.checked,
      maxRetries: Math.max(0, Math.min(10, parseInt(maxRetriesInput.value, 10) || 0)),
      retryLimitAction: Array.from(retryActionRadios).find(r => r.checked)?.value || 'stop',
    };
    saveSettings(newSettings);
    document.body.removeChild(overlay);
  };

  closeBtn.addEventListener('click', saveAndClose);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      saveAndClose();
    }
  });
}
