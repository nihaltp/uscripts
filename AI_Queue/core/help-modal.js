export function showHelpModal() {
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

  modal.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 15px;">How to use AI Queue</h3>
    <ul style="padding-left: 20px; line-height: 1.6; font-size: 14px; margin-bottom: 15px;">
      <li>Type your prompt in the text area.</li>
      <li>Press <strong>Ctrl + Enter</strong> to add prompt to queue.</li>
      <li>Press <strong>Shift + Enter</strong> for next line.</li>
      <li>Click <strong>'Add To Queue'</strong> as an alternative.</li>
      <li>Add as many prompts as you like.</li>
      <li>Click <strong>'Start Queue'</strong> to process them automatically.</li>
    </ul>
    <p style="font-size: 13px; opacity: 0.9; margin-bottom: 15px;">The script will wait for the AI to finish each response before sending the next one.</p>
    <div style="text-align: right;">
      <button id="pq-info-close" style="
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid var(--pq-ui-btn-border);
        background: var(--pq-ui-btn-bg);
        color: var(--pq-ui-text);
        cursor: pointer;
      ">Close</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.querySelector('#pq-info-close').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}
