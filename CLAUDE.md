# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Chrome and Firefox Manifest V3 extension that adds a Spotlight-like overlay (triggered by `Ctrl+``) to any webpage, letting users submit queries directly to Perplexity.ai. Zero runtime dependencies; run `node build.js` to package for store submission.

## Development Workflow

**Load extension:** Chrome → `chrome://extensions` → "Load unpacked" → select repo root

**Reload after changes:** Click the refresh icon on the extension card in `chrome://extensions`

**Run tests:** Open `tests/test.html` in a browser — tests run automatically and show pass/fail

**Regenerate icons** (requires `icons/suggestion.png`):
```bash
node scale-icons.js
```

**Package for Chrome and Firefox:**
```bash
node build.js
```

Outputs `dist/quick-perplexes-chrome-{version}.zip` and `dist/quick-perplexes-firefox-{version}.zip`.

See `docs/publishing.md` for the full Chrome Web Store submission walkthrough.

## Architecture

The extension has two scripts:

- **`background.js`** — Service worker. Only job: opens perplexity.ai when the toolbar icon is clicked.
- **`content.js`** — Injected into every page. Manages the entire overlay lifecycle.

### Content Script Design

The overlay lives inside a **closed Shadow DOM** attached to a host element, which isolates its CSS from the host page entirely. The overlay is created once on first trigger and reused (toggled via `display: none`).

State is kept in module-level variables (`isOpen`, `isCreating`, `host`, `shadowRoot`) inside an IIFE. Keyboard listeners are registered in the **capture phase** so `Ctrl+`` is caught before host-page handlers. While the overlay is open, `stopPropagation()` is called on all keydown events to prevent host-page shortcuts from firing.

**Overlay flow:**
1. User presses `Ctrl+`` → overlay appears, input focused
2. User types query → presses Enter → `buildSearchUrl()` constructs Perplexity URL → `window.open()` in new tab → overlay closes
3. Esc or backdrop click → overlay closes

The `buildSearchUrl()` function is the only logic with unit tests (in `tests/test.html`).

### CSS

`overlay.css` is fetched at runtime via `fetch(chrome.runtime.getURL('overlay.css'))` and injected as a `<style>` tag inside the Shadow DOM. It is listed as a `web_accessible_resource` in `manifest.json` for this reason.
