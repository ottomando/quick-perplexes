(() => {
  let host = null;
  let shadowRoot = null;
  let isOpen = false;
  let isCreating = false;

  // When the overlay is open, document.activeElement returns the shadow host (a <div>),
  // not the <input> inside the closed shadow DOM.  Page scripts (e.g. YouTube's shortcut
  // handler) guard themselves with `document.activeElement.tagName === 'INPUT'`, so they
  // never see a text field active and fire their shortcuts anyway.  Overriding the getter
  // here makes those guards work correctly while the overlay is open.
  const _origActiveElement = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
  Object.defineProperty(document, 'activeElement', {
    get() {
      if (isOpen && shadowRoot) {
        const input = shadowRoot.getElementById('input');
        if (input) return input;
      }
      return _origActiveElement.get.call(this);
    },
    configurable: true,
  });

  function scrollToCaret(input) {
    const pos = input.selectionEnd;
    const text = input.value.substring(0, pos);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = '17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.font = font;
    const textWidth = ctx.measureText(text).width;
    const pad = 14; // matches CSS padding-left/right
    const visible = input.clientWidth - pad * 2;
    if (textWidth - input.scrollLeft > visible) {
      input.scrollLeft = textWidth - visible;
    } else if (textWidth < input.scrollLeft) {
      input.scrollLeft = textWidth;
    }
  }

  function buildSearchUrl(query) {
    return 'https://www.perplexity.ai/search?q=' + encodeURIComponent(query.trim());
  }

  async function createOverlay() {
    host = document.createElement('div');
    shadowRoot = host.attachShadow({ mode: 'closed' });

    const styleText = await fetch(chrome.runtime.getURL('overlay.css')).then(r => r.text());
    const style = document.createElement('style');
    style.textContent = styleText;

    const input = document.createElement('input');
    input.id = 'input';
    input.type = 'text';
    input.placeholder = 'Search Perplexity…';
    input.autocomplete = 'off';
    input.spellcheck = false;

    const footer = document.createElement('div');
    footer.id = 'footer';
    const hints = document.createElement('span');
    hints.className = 'hints';
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
    const ctrlLabel = isMac ? 'Command' : 'Ctrl';
    const altLabel = isMac ? 'Option' : 'Alt';
    hints.innerHTML = `<kbd>${ctrlLabel}</kbd> background · <kbd>Shift</kbd> window · <kbd>${altLabel}</kbd> popup`;
    const primary = document.createElement('span');
    primary.innerHTML = '<kbd>Enter</kbd> search';
    footer.append(hints, primary);

    const card = document.createElement('div');
    card.id = 'card';
    card.append(input, footer);

    const backdrop = document.createElement('div');
    backdrop.id = 'backdrop';
    backdrop.append(card);

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(backdrop);
    document.body.appendChild(host);

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
          input.focus();
          input.select();
        }
        input.focus();
      });
    } else {
      host.style.display = '';
      const input = shadowRoot.getElementById('input');
      if (prefill) {
        input.value = prefill;
        input.focus();
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

  // Block keypress and keyup too — some sites (including YouTube) listen on both.
  for (const type of ['keypress', 'keyup']) {
    window.addEventListener(type, (e) => {
      if (!isOpen) return;
      if (e.ctrlKey && e.code === 'Backquote') return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
  }

  // Window-level capture fires before any document-level capture listener, so this
  // intercepts keystrokes before page shortcut handlers (e.g. YouTube's) can see them.
  // Because we stop the event here the shadow-DOM input never receives it, so we drive
  // the input manually with setRangeText / setSelectionRange.
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    // Let Ctrl+` fall through — the document listener below handles open/close.
    if (e.ctrlKey && e.code === 'Backquote') return;

    e.stopImmediatePropagation();
    e.preventDefault();

    if (e.key === 'Escape') { closeOverlay(); return; }

    const input = shadowRoot?.getElementById('input');
    if (!input) return; // overlay still being created — key is silently swallowed

    input.focus();

    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (query) {
        if (e.altKey) {
          const w = 480, h = 700, margin = 20;
          const left = screen.availWidth - w - margin;
          const top = screen.availHeight - h - margin;
          window.open(buildSearchUrl(query), '_blank',
            `width=${w},height=${h},left=${left},top=${top}`);
        } else {
          window.open(buildSearchUrl(query), '_blank');
        }
        closeOverlay();
      }
      return;
    }

    const ss = input.selectionStart;
    const se = input.selectionEnd;
    const len = input.value.length;

    if (e.key === 'Backspace') {
      if (ss !== se) input.setRangeText('', ss, se, 'start');
      else if (ss > 0) input.setRangeText('', ss - 1, ss, 'start');
      scrollToCaret(input);
      return;
    }
    if (e.key === 'Delete') {
      if (ss !== se) input.setRangeText('', ss, se, 'start');
      else if (ss < len) input.setRangeText('', ss, ss + 1, 'start');
      scrollToCaret(input);
      return;
    }

    if (e.key === 'ArrowLeft') {
      if (e.shiftKey) input.setSelectionRange(Math.max(0, ss - 1), se);
      else { const p = ss !== se ? ss : Math.max(0, ss - 1); input.setSelectionRange(p, p); }
      scrollToCaret(input);
      return;
    }
    if (e.key === 'ArrowRight') {
      if (e.shiftKey) input.setSelectionRange(ss, Math.min(len, se + 1));
      else { const p = ss !== se ? se : Math.min(len, se + 1); input.setSelectionRange(p, p); }
      scrollToCaret(input);
      return;
    }
    if (e.key === 'Home') { input.setSelectionRange(0, e.shiftKey ? se : 0); scrollToCaret(input); return; }
    if (e.key === 'End')  { input.setSelectionRange(e.shiftKey ? ss : len, len); scrollToCaret(input); return; }

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') { input.setSelectionRange(0, len); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      navigator.clipboard.readText()
        .then(t => { if (t) { input.setRangeText(t, input.selectionStart, input.selectionEnd, 'end'); scrollToCaret(input); } })
        .catch(() => {});
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      input.setRangeText(e.key, ss, se, 'end');
      scrollToCaret(input);
    }
  }, true);

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
    }
  }, true);
})();
