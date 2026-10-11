#!/usr/bin/env python3
"""
keys_only.py — OS-level enforcement of "arrow keys + one select button, nothing else".

Grabs every keyboard / remote / CEC input device exclusively and re-emits ONLY
Up, Down, Left, Right and Enter through a virtual keyboard. Remote "OK"/"Select"
keys are mapped to Enter. Pointer devices (mouse/touch) are grabbed and swallowed.

Run as root (needs /dev/input + /dev/uinput):  sudo python3 keys_only.py
Dependencies: python3-evdev
Recovery: there is intentionally no escape key. SSH in, or `systemctl stop open-tv-keys`.
"""
import asyncio
import evdev
from evdev import UInput, InputDevice, ecodes as e

VIRTUAL_NAME = "open-tv keys-only"
SWALLOW_POINTERS = True

REMAP = {
    e.KEY_UP: e.KEY_UP,
    e.KEY_DOWN: e.KEY_DOWN,
    e.KEY_LEFT: e.KEY_LEFT,
    e.KEY_RIGHT: e.KEY_RIGHT,
    e.KEY_ENTER: e.KEY_ENTER,
    e.KEY_KPENTER: e.KEY_ENTER,
    e.KEY_OK: e.KEY_ENTER,        # many remotes / CEC
    e.KEY_SELECT: e.KEY_ENTER,
}
OUT_KEYS = [e.KEY_UP, e.KEY_DOWN, e.KEY_LEFT, e.KEY_RIGHT, e.KEY_ENTER]


def classify(dev):
    caps = dev.capabilities()
    keys = set(caps.get(e.EV_KEY, []))
    if keys & set(REMAP):
        return "keys"
    if SWALLOW_POINTERS and (e.EV_REL in caps or e.EV_ABS in caps):
        return "pointer"
    return None


async def pump(dev, ui, kind):
    try:
        dev.grab()
        async for ev in dev.async_read_loop():
            if kind == "keys" and ev.type == e.EV_KEY and ev.code in REMAP:
                ui.write(e.EV_KEY, REMAP[ev.code], ev.value)   # 0 up, 1 down, 2 repeat
                ui.syn()
    except OSError:
        pass                                                   # unplugged
    finally:
        try:
            dev.ungrab()
        except OSError:
            pass
        dev.close()


async def main():
    ui = UInput({e.EV_KEY: OUT_KEYS}, name=VIRTUAL_NAME)
    tasks = {}
    while True:                                                # poll for hot-plugged devices
        for path in evdev.list_devices():
            if path in tasks and not tasks[path].done():
                continue
            try:
                dev = InputDevice(path)
            except OSError:
                continue
            kind = None if dev.name == VIRTUAL_NAME else classify(dev)
            if not kind:
                dev.close()
                continue
            print(f"grabbing {dev.name} ({path}) as {kind}", flush=True)
            tasks[path] = asyncio.create_task(pump(dev, ui, kind))
        await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
