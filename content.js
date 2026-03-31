(() => {
  let host = null;
  let shadowRoot = null;
  let isOpen = false;

  function buildOverlayHTML() {
    return `
      <div id="backdrop">
        <div id="card">
          <input id="input" type="text" placeholder="Search Perplexity…" autocomplete="off" spellcheck="false" />
          <div id="footer">
            <span>Opens in Perplexity</span>
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    `;
  }

  async function createOverlay() {
    host = document.createElement('div');
    shadowRoot = host.attachShadow({ mode: 'closed' });

    const styleText = await fetch(chrome.runtime.getURL('overlay.css')).then(r => r.text());
    const style = document.createElement('style');
    style.textContent = styleText;

    const template = document.createElement('template');
    template.innerHTML = buildOverlayHTML();

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(template.content.cloneNode(true));
    document.body.appendChild(host);
  }

  function openOverlay() {
    isOpen = true;
    if (!host) {
      createOverlay().then(() => {
        shadowRoot.getElementById('input').focus();
      });
    } else {
      host.style.display = '';
      shadowRoot.getElementById('input').focus();
    }
  }

  function closeOverlay() {
    if (host) {
      host.style.display = 'none';
    }
    isOpen = false;
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        closeOverlay();
      } else {
        openOverlay();
      }
    }
  }, true);
})();
