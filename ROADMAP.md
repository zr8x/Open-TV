# Open TV — Feasibility & Roadmap

**Goal:** a Raspberry Pi 5 box that behaves like a Fire TV Stick / smart TV, runs the major streaming services and YouTube, and is operated with **only ↑ ↓ ← → and one Select button**.

## Verdict: feasible, with hard limits

| Area | Verdict | Why |
|---|---|---|
| Keys-only navigation | **Yes** | Solved in the prototype: spatial focus, on-screen keyboard, hold-Select system menu, and an OS-level filter that drops every other key. |
| YouTube | **Yes** | `youtube.com/tv` is YouTube's own remote-control UI, built for arrows + Enter. Needs a TV user-agent (spoofing is a known workaround, but Google can break it at any time). |
| Netflix, Disney+, Prime, HBO Max, Hulu, Paramount+, Peacock, Apple TV | **Probably, at reduced quality** | Run as websites in Chrome with Widevine. Native Widevine for arm64 Linux just shipped in Chrome (mid-2026); Linux browsers are generally capped at lower resolution (~720p) by these services. **Must be verified per service on a real Pi.** |
| 4K / HDR / Dolby Vision / Atmos | **No** | Needs Widevine L1 hardware DRM and certified devices. Not available to a DIY Linux box. |
| Real Fire TV / Android TV apps | **No (this design)** | These are native Android apps. A web-based shell can only run services that have a website. |
| Voice, Alexa, casting protocols | Out of scope | Possible later (Chromecast receiver / DIAL), but not keys-only. |
| Captcha, 2FA, password entry | **Painful** | See "Hardest problems". |

## Architecture

```
 remote / keyboard / CEC ──► inputd (keys_only.py, root)
                               grabs all input devices, re-emits only
                               Up/Down/Left/Right/Enter via uinput
                                         │
                                         ▼
 cage (Wayland kiosk) ─► Chrome arm64 (kiosk, Widevine)
                           ├─ Open TV extension (content script on every page)
                           │    • spatial focus ring (nav-core.js)
                           │    • on-screen keyboard for text fields
                           │    • cursor mode (virtual mouse) fallback
                           │    • player mode (←/→ seek, ↑/↓ volume, Select pause)
                           │    • hold-Select → system menu (Home / Back / Reload)
                           └─ Launcher page (localhost:7070) → tiles for each service
```

**The "no back button" problem:** with five keys there is no Esc/Back/Home. The design answer is **hold Select ≈ 0.7s → system menu**. It works on every page, because the extension owns the key handling. YouTube TV is the exception (its own UI handles arrows), so there we only watch for the hold and replay short presses to the page.

## Phases

### Phase 0 — Hardware feasibility spike (1–2 weeks) ← do this first
Everything else depends on these answers. On a real Pi 5 (8 GB, active cooler, good PSU):
- Install Chrome arm64 + `scripts/setup-pi.sh`; confirm `chrome://media-internals` shows the Widevine module.
- For **each service**: sign in, play 10 minutes. Record max resolution, dropped frames, CPU temp, audio sync.
- Pi 5 has **no H.264 hardware decoder** (HEVC only), so H.264 streams decode in software on the CPU. Measure at 720p and 1080p.
- Confirm the YouTube TV user-agent trick works and what UI loads.
- Confirm HDMI-CEC remote keys show up as input events (`evtest`) and map to Select.
- **Exit criterion:** a go/no-go table per service. Drop services that can't play acceptably.

### Phase 1 — Shell MVP (this repo; 2–3 weeks to harden)
Done in prototype: launcher, spatial focus, OSK, system menu, cursor mode, player mode, keys-only input filter, kiosk boot scripts.
To do: run it on the Pi; fix focus quirks on real pages; focus-ring visibility on bright pages; boot time.
- **Exit:** cold boot → launcher → YouTube video playing, using only the 5 keys, with a clean return to Home.

### Phase 2 — Per-service adapters (3–6 weeks)
Generic spatial focus will fail on carousels, hover-only controls, and custom players.
- Host-specific rules table (`adapters/<host>.js`): which elements are "focusable", how to scroll rows, how to detect the player and its controls.
- Player adapters: reliable seek/pause/subtitles/audio-track controls per service.
- Autologin flow, profile pickers ("Who's watching?"), "Are you still watching?" prompts.
- **Exit:** every kept service can be used start-to-finish without Cursor mode.

### Phase 3 — Appliance polish (3–4 weeks)
- **Setup without a keyboard:** Wi-Fi picker + password via the OSK (NetworkManager), time zone, display resolution, audio output.
- Watchdog: if Chrome hangs, restart it (no Esc key to recover manually!). Auto-recover on crash.
- Settings screen (keys-only), screensaver, sleep/wake via CEC, volume via CEC/ARC.
- Auto-update of the shell, with rollback.

### Phase 4 — Distribution (optional)
Prebuilt SD-card image, update channel, documentation. **Get a legal review before distributing** (see Risks).

## Hardest problems (honest list)

1. **DRM quality ceiling.** Expect sub-1080p on most DRM services and software H.264 decoding. This is the biggest gap vs. a real Fire Stick, and no software fix changes it.
2. **Sites change under you.** Every adapter is a maintenance liability; the services don't promise a stable DOM. Budget ongoing work.
3. **Login & text entry with 5 keys.** The OSK works but password entry is slow, captchas are effectively impossible, and 2FA codes are tedious. Options: (a) accept it, (b) one-time companion web page on your phone (opens a local page to type credentials/cookies — strictly a setup aid, not navigation), (c) import a browser profile.
4. **Services may block or degrade unrecognised browsers/user agents.** Spoofing a TV user agent for YouTube is fragile and may violate terms of service.
5. **Terms of service.** Wrapping commercial services, spoofing user agents, or auto-driving UIs can breach their ToS. Fine for personal use; a risk if you distribute a product.
6. **Widevine licensing.** Don't redistribute the Widevine CDM yourself — install the browser from Google at setup time.
7. **Escape hatches.** The key filter deliberately removes every escape key. Always keep SSH enabled for recovery.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **Web shell on Chrome (this plan)** | Real services, fast to build, full control of input | DRM ceiling, adapters to maintain |
| Kodi + add-ons | Mature 10-foot UI, native arrow-key navigation | Commercial-service add-ons are unofficial and break often; no real YouTube/Netflix apps |
| Android TV / LineageOS on Pi 5 | Real apps, real TV UI | Not Google-certified, so DRM apps are limited or unavailable; the user must still side-load; big maintenance burden |
| Plain Chromium kiosk, no shell | Simplest | Needs a mouse/keyboard; violates the keys-only requirement |

## Sources checked
- OMG! Ubuntu — Google Chrome for arm64 Linux (includes native Widevine, tested on Pi 5): https://www.omgubuntu.co.uk/2026/07/chrome-arm64-linux-available
- raspberry.tips — Pi 5 lacks a dedicated H.264 hardware decoder; Chromium + Widevine recommended for Netflix/Disney+/Prime: https://raspberry.tips/raspi-media-center/kodi-raspberry-pi-installieren-bookworm
- AlternativeTo — VacuumTube: YouTube TV works in a browser only with user-agent spoofing: https://www.alternativeto.net/software/vacuumtube/about/

**Not yet verified by me:** per-service resolution caps, current streaming-site ToS, CEC key mapping on Pi 5, and whether YouTube TV currently accepts the UA in `extension/rules.json`. All of that is Phase 0.
