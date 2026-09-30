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

  const title = document.createElement('h3');
  title.textContent = 'Queue Settings';
  Object.assign(title.style, { marginTop: '0', marginBottom: '15px' });

  const autoRetryDiv = document.createElement('div');
  Object.assign(autoRetryDiv.style, { marginBottom: '15px' });

  const autoRetryLabel = document.createElement('label');
  Object.assign(autoRetryLabel.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px'
  });

  const autoRetryCheckbox = document.createElement('input');
  autoRetryCheckbox.type = 'checkbox';
  autoRetryCheckbox.id = 'pq-setting-auto-retry';
  autoRetryCheckbox.checked = settings.autoRetryEnabled;
  Object.assign(autoRetryCheckbox.style, { cursor: 'pointer' });

  const autoRetrySpan = document.createElement('span');
  autoRetrySpan.textContent = 'Enable auto-retry on error';

  autoRetryLabel.appendChild(autoRetryCheckbox);
  autoRetryLabel.appendChild(autoRetrySpan);

  const autoRetryDesc = document.createElement('p');
  autoRetryDesc.textContent = 'Automatically click retry button when ChatGPT shows an error';
  Object.assign(autoRetryDesc.style, {
    fontSize: '12px',
    opacity: '0.7',
    marginTop: '4px',
    marginBottom: '0'
  });

  autoRetryDiv.appendChild(autoRetryLabel);
  autoRetryDiv.appendChild(autoRetryDesc);

  const maxRetriesDiv = document.createElement('div');
  Object.assign(maxRetriesDiv.style, { marginBottom: '15px' });

  const maxRetriesLabel = document.createElement('label');
  maxRetriesLabel.textContent = 'Max retry attempts:';
  Object.assign(maxRetriesLabel.style, {
    display: 'block',
    fontSize: '14px',
    marginBottom: '4px'
  });

  const maxRetriesInput = document.createElement('input');
  maxRetriesInput.type = 'number';
  maxRetriesInput.id = 'pq-setting-max-retries';
  maxRetriesInput.value = settings.maxRetries;
  maxRetriesInput.min = '0';
  maxRetriesInput.max = '10';
  Object.assign(maxRetriesInput.style, {
    width: '100%',
    padding: '6px',
    border: '1px solid var(--pq-ui-border)',
    borderRadius: '4px',
    background: 'var(--pq-ui-input-bg)',
    color: 'var(--pq-ui-text)',
    fontSize: '14px'
  });

  const maxRetriesDesc = document.createElement('p');
  maxRetriesDesc.textContent = 'How many times to retry before giving up (0 = disabled)';
  Object.assign(maxRetriesDesc.style, {
    fontSize: '12px',
    opacity: '0.7',
    marginTop: '4px',
    marginBottom: '0'
  });

  maxRetriesDiv.appendChild(maxRetriesLabel);
  maxRetriesDiv.appendChild(maxRetriesInput);
  maxRetriesDiv.appendChild(maxRetriesDesc);

  const retryActionDiv = document.createElement('div');
  Object.assign(retryActionDiv.style, { marginBottom: '20px' });

  const retryActionLabel = document.createElement('label');
  retryActionLabel.textContent = 'When retry limit reached:';
  Object.assign(retryActionLabel.style, {
    display: 'block',
    fontSize: '14px',
    marginBottom: '8px'
  });

  const retryOptionsDiv = document.createElement('div');
  Object.assign(retryOptionsDiv.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  });

  const stopLabel = document.createElement('label');
  Object.assign(stopLabel.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px'
  });

  const stopRadio = document.createElement('input');
  stopRadio.type = 'radio';
  stopRadio.name = 'pq-setting-retry-action';
  stopRadio.value = 'stop';
  stopRadio.checked = settings.retryLimitAction === 'stop';
  Object.assign(stopRadio.style, { cursor: 'pointer' });

  const stopSpan = document.createElement('span');
  stopSpan.textContent = 'Stop queue';

  stopLabel.appendChild(stopRadio);
  stopLabel.appendChild(stopSpan);

  const continueLabel = document.createElement('label');
  Object.assign(continueLabel.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px'
  });

  const continueRadio = document.createElement('input');
  continueRadio.type = 'radio';
  continueRadio.name = 'pq-setting-retry-action';
  continueRadio.value = 'continue';
  continueRadio.checked = settings.retryLimitAction === 'continue';
  Object.assign(continueRadio.style, { cursor: 'pointer' });

  const continueSpan = document.createElement('span');
  continueSpan.textContent = 'Send next prompt, requeue failed';

  continueLabel.appendChild(continueRadio);
  continueLabel.appendChild(continueSpan);

  retryOptionsDiv.appendChild(stopLabel);
  retryOptionsDiv.appendChild(continueLabel);

  const retryActionDesc = document.createElement('p');
  retryActionDesc.textContent = 'What to do when max retries is exceeded';
  Object.assign(retryActionDesc.style, {
    fontSize: '12px',
    opacity: '0.7',
    marginTop: '4px',
    marginBottom: '0'
  });

  retryActionDiv.appendChild(retryActionLabel);
  retryActionDiv.appendChild(retryOptionsDiv);
  retryActionDiv.appendChild(retryActionDesc);

  const buttonDiv = document.createElement('div');
  Object.assign(buttonDiv.style, { textAlign: 'right' });

  const closeBtn = document.createElement('button');
  closeBtn.id = 'pq-settings-close';
  closeBtn.textContent = 'Save & Close';
  Object.assign(closeBtn.style, {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid var(--pq-ui-btn-border)',
    background: 'var(--pq-ui-btn-bg)',
    color: 'var(--pq-ui-text)',
    cursor: 'pointer'
  });

  buttonDiv.appendChild(closeBtn);

  modal.appendChild(title);
  modal.appendChild(autoRetryDiv);
  modal.appendChild(maxRetriesDiv);
  modal.appendChild(retryActionDiv);
  modal.appendChild(buttonDiv);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

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
