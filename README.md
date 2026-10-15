# MERCY AI — Liquid Glass dashboard

Responsive black/purple assistant UI with a pulsing animated core, working navigation, local demo profile, media shortcuts, voice input where supported, and a browser-side encrypted API-vault prototype.

## Free hosting on GitHub Pages
1. Upload `index.html`, `style.css`, `script.js`, and `README.md` to the repository root.
2. Open Settings → Pages.
3. Choose Deploy from a branch → `main` → `/(root)` → Save.

## Important limitations
- Account forms are a local demo profile only; no real authentication is implemented.
- The API vault encrypts a test key in this browser, but this prototype is not security-audited and doesn't call a bot. Never use production secrets here.
- End-to-end encrypted chat requires a carefully designed protocol and a backend/key-management design; it is not included in this static prototype.
- YouTube, Spotify, and Apple Music buttons open official sites. Linking accounts requires official OAuth flows.
- System monitor values are illustrative, not actual PC stats.
