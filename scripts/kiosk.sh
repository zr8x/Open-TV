#!/usr/bin/env bash
# Boots the Open TV kiosk: launcher server + Chromium inside the `cage` Wayland kiosk compositor.
set -euo pipefail

DIR="${OPEN_TV_DIR:-/opt/open-tv}"
PROFILE="${OPEN_TV_PROFILE:-$HOME/.local/share/open-tv/chromium}"   # persists logins/cookies
BROWSER="${OPEN_TV_BROWSER:-google-chrome-stable}"                  # or: chromium (needs Widevine CDM, see README)

mkdir -p "$PROFILE"
node "$DIR/server/server.js" &
until curl -sf http://localhost:7070/api/health >/dev/null; do sleep 0.3; done

# NOTE: no -s flag on cage => VT switching disabled.
exec cage -- "$BROWSER" \
  --kiosk \
  --ozone-platform=wayland \
  --user-data-dir="$PROFILE" \
  --load-extension="$DIR/extension" \
  --disable-features=DisableLoadExtensionCommandLineSwitch,Translate \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run \
  --autoplay-policy=no-user-gesture-required \
  --force-device-scale-factor="${OPEN_TV_SCALE:-1}" \
  http://localhost:7070/
