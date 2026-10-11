# Open TV (prototype)

Keys-only smart-TV shell for a Raspberry Pi 5. Read **ROADMAP.md** first for the feasibility verdict.

## Try it on your computer (no Pi needed)
Open `dist/demo.html` in Chrome/Firefox. Use **only** the arrow keys and **Enter**.
- Hold **Enter** (~0.7s) → system menu (Home / Back / Reload / Cursor mode)
- Menu → Cursor mode gives a virtual mouse driven by the arrows

Rebuild after code changes: `npm run demo`. Run tests: `npm install && npm test`.

## Layout
| Path | What it is |
|---|---|
| `extension/nav-core.js` | Pure spatial-navigation math (unit tested) |
| `extension/shell.js` | Injected into every page: focus ring, OSK, cursor mode, player mode, hold-Select menu |
| `extension/manifest.json`, `rules.json` | Chrome extension (MV3) + YouTube TV user-agent rule |
| `launcher/index.html`, `server/` | Home screen served on `localhost:7070`; service list in `server/services.json` |
| `inputd/keys_only.py` | Root daemon: grabs all input devices, forwards only ↑↓←→ + Enter |
| `scripts/` | `setup-pi.sh`, `kiosk.sh`, systemd units |
| `test/` | Unit tests + jsdom smoke tests |

## Status
- ✅ Tested here (no hardware): navigation math, focus movement, hold-Select menu, cursor mode, on-screen keyboard typing, blocking of all other keys.
- ⚠️ **Not tested on a Pi or on real streaming sites:** Widevine playback, YouTube TV user-agent rule, extension loading in kiosk Chrome, cage/systemd boot, `keys_only.py`, CEC remotes. Syntax-checked only.
- Known gaps: carousels that scroll internally, hover-only controls, captchas, per-service adapters (Phase 2).

## Install on a Pi (untested)
```
sudo ./scripts/setup-pi.sh && sudo reboot
```
Keep SSH enabled: the key filter removes every escape key.
