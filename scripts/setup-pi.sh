#!/usr/bin/env bash
# One-shot installer for Raspberry Pi 5 (Raspberry Pi OS Lite 64-bit, Bookworm/Trixie). UNTESTED on hardware.
# Run from the repo root:  sudo ./scripts/setup-pi.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

apt-get update
apt-get install -y cage nodejs curl python3-evdev wget ca-certificates pipewire pipewire-pulse wireplumber

# Browser: official Google Chrome arm64 ships a native Widevine CDM (needed for Netflix etc.).
# Google's download page defaults to amd64 — swap the arch in the URL. Verify availability first.
if ! command -v google-chrome-stable >/dev/null; then
  wget -O /tmp/chrome.deb "https://dl.google.com/linux/direct/google-chrome-stable_current_arm64.deb"
  apt-get install -y /tmp/chrome.deb
fi

id opentv >/dev/null 2>&1 || useradd -m -G video,audio,input,render opentv
mkdir -p /opt/open-tv
cp -r extension launcher server scripts inputd /opt/open-tv/
chmod +x /opt/open-tv/scripts/kiosk.sh

cp scripts/open-tv.service scripts/open-tv-keys.service /etc/systemd/system/
systemctl daemon-reload
systemctl set-default graphical.target
systemctl enable open-tv-keys.service open-tv.service
echo "Done. Reboot to start Open TV. (Disable getty@tty1 if the kiosk doesn't take over the screen.)"
