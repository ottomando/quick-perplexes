(() => {
  let host = null;
  let shadowRoot = null;
  let isOpen = false;
  let isCreating = false;

  function buildSearchUrl(query) {
    return 'https://www.perplexity.ai/search?q=' + encodeURIComponent(query.trim());
  }

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

    const input = shadowRoot.getElementById('input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = input.value.trim();
        if (query) {
          window.open(buildSearchUrl(query), '_blank');
          closeOverlay();
          input.value = '';
        }
      }
    });

    const backdrop = shadowRoot.getElementById('backdrop');
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeOverlay();
      }
    });

    shadowRoot.addEventListener('keydown', (e) => {
      e.stopPropagation(); // prevent keystrokes from reaching host-page shortcut handlers
      if (e.key === 'Tab') {
        e.preventDefault();
        input.focus();
      }
    });
  }

  function openOverlay(prefill = '') {
    if (isCreating) return;
    isOpen = true;
    if (!host) {
      isCreating = true;
      createOverlay().then(() => {
        isCreating = false;
        const input = shadowRoot.getElementById('input');
        if (prefill) {
          input.value = prefill;
          input.select();
        }
        input.focus();
      });
    } else {
      host.style.display = '';
      const input = shadowRoot.getElementById('input');
      if (prefill) {
        input.value = prefill;
        input.select();
      }
      input.focus();
    }
  }

  function closeOverlay() {
    if (isCreating) return;
    if (host) {
      host.style.display = 'none';
      shadowRoot.getElementById('input').value = '';
    }
    isOpen = false;
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'Backquote') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        closeOverlay();
      } else {
        const sel = window.getSelection();
        const prefill = sel ? sel.toString().trim() : '';
        openOverlay(prefill);
      }
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    }
  }, true);
})();
