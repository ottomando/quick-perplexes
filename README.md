# Quick Perplexes

A Chrome and Firefox extension that summons a Spotlight-like search overlay with `Ctrl+`` on any webpage. Type a query, hit Enter — Perplexity opens in a new tab.

**[https://ottomando.github.io/quick-perplexes/](https://ottomando.github.io/quick-perplexes/)**

## Install

- **Chrome:** [Chrome Web Store](#) *(coming soon)*
- **Firefox:** [Firefox Add-ons](#) *(coming soon)*

Or load unpacked for development (see below).

## Usage

1. Press `Ctrl+`` on any webpage to open the search overlay
2. Type your query and hit `Enter` — Perplexity opens in a new tab
3. Press `Esc` or click outside to dismiss

Clicking the toolbar icon also opens perplexity.ai directly.

## Development

**Chrome:** Go to `chrome://extensions` → **Load unpacked** → select the repo root

**Firefox:** Go to `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json`

Edit source files, then reload the extension to pick up changes.

**Run tests:** Open `tests/test.html` in a browser — tests run automatically.

**Package for submission:**
```bash
node build.js
```
Outputs `dist/quick-perplexes-chrome-{version}.zip` and `dist/quick-perplexes-firefox-{version}.zip`.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (Chrome + Firefox) |
| `background.js` | Service worker — opens perplexity.ai on toolbar click |
| `content.js` | Injects the search overlay into every page |
| `overlay.css` | Styles for the overlay (loaded at runtime via Shadow DOM) |
| `build.js` | Packages the extension into ZIPs for store submission |
| `scale-icons.js` | Generates icon sizes from `icons/suggestion.png` |
| `tests/test.html` | Unit tests for `buildSearchUrl()` |
