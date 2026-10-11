/*
 * shell.js — the "TV shell" injected into every page (as a Chromium extension
 * content script) and also loaded directly by the launcher page.
 *
 * Input contract: ONLY Up / Down / Left / Right / Enter (select).
 *   - Short select       -> activate the focused thing
 *   - HOLD select (0.7s) -> system menu (Home, Back, Reload, Cursor mode)
 * Everything else a page might want (Esc, Tab, Backspace, typing…) is blocked
 * and replaced by: spatial focus, an on-screen keyboard, and the system menu.
 *
 * Modes: browse (spatial focus) | cursor (virtual mouse) | menu | osk | player
 */
(function () {
  'use strict';

  var root = document.documentElement;
  if (!root || root.dataset.openTv) return;           // already loaded (extension beats page script)
  root.dataset.openTv = '1';

  var Nav = window.OpenTVNav;
  if (!Nav) { console.warn('[open-tv] nav-core.js missing'); return; }

  // ---------------------------------------------------------------- config
  var HOME_URL = 'http://localhost:7070/';
  var HOLD_MS = 700;
  var STRICT = true;                                   // swallow every key except the 5 allowed
  var DEMO = !!window.OPEN_TV_DEMO;                    // bundled browser demo (no real navigation)
  // Sites that ship their own remote-control UI. We leave arrows alone and only
  // add hold-select -> menu. (YouTube TV / "Leanback".)
  var PASSTHROUGH = [function () {
    return /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname.indexOf('/tv') === 0;
  }];
  var SELECTORS = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=option]',
    '[role=checkbox]', '[role=radio]', '[role=switch]', '[tabindex]:not([tabindex="-1"])',
    '[onclick]', 'video[controls]'
  ].join(',');

  var ALLOWED = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Enter: 1 };

  // ----------------------------------------------------------------- state
  var mode = 'browse';
  var current = null;               // {ref, rect}
  var holdTimer = null, holdFired = false;
  var repeatCount = 0;
  var cursor = { x: innerWidth / 2, y: innerHeight / 2, el: null };
  var oskTarget = null;

  function isPassthrough() { return PASSTHROUGH.some(function (f) { return f(); }); }

  // ------------------------------------------------------------------ UI
  var ui = {};
  function ensureUI() {
    if (ui.ring) return;
    var style = document.createElement('style');
    style.textContent = [
      '#otv-ring{position:fixed;z-index:2147483646;pointer-events:none;border:4px solid #5cc8ff;border-radius:10px;box-shadow:0 0 0 3px rgba(0,0,0,.55),0 0 24px rgba(92,200,255,.7);transition:all .09s ease-out;display:none}',
      '#otv-cursor{position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;display:none;filter:drop-shadow(0 0 3px #000)}',
      '#otv-toast{position:fixed;z-index:2147483647;left:50%;bottom:6%;transform:translateX(-50%);background:rgba(10,12,20,.92);color:#fff;font:600 24px system-ui,sans-serif;padding:14px 28px;border-radius:14px;display:none}',
      '.otv-panel{position:fixed;z-index:2147483647;background:rgba(10,12,20,.97);color:#fff;font:600 26px system-ui,sans-serif;box-shadow:0 10px 60px rgba(0,0,0,.7)}',
      '#otv-menu{left:50%;top:50%;transform:translate(-50%,-50%);min-width:420px;border-radius:20px;padding:20px;display:none}',
      '#otv-menu .it{padding:16px 24px;border-radius:12px;margin:4px 0}',
      '#otv-menu .it.sel,.otv-key.sel{background:#5cc8ff;color:#06121c}',
      '#otv-menu h1{font-size:18px;letter-spacing:.15em;opacity:.6;margin:0 0 10px 8px;font-weight:700}',
      '#otv-osk{left:0;right:0;bottom:0;padding:16px 4vw 20px;display:none}',
      '#otv-osk .row{display:flex;gap:8px;margin:8px 0}',
      '.otv-key{flex:1;text-align:center;padding:14px 0;border-radius:10px;background:#1f2638}',
      '#otv-osk .buf{font:500 22px ui-monospace,monospace;opacity:.8;padding:4px 8px 10px;min-height:30px;white-space:pre;overflow:hidden}'
    ].join('\n');
    (document.head || root).appendChild(style);
    ui.ring = el('div', 'otv-ring');
    ui.cursor = el('div', 'otv-cursor');
    ui.cursor.innerHTML = '<svg viewBox="0 0 26 26"><path d="M3 2l18 9-8 2-3 8z" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/></svg>';
    ui.toast = el('div', 'otv-toast');
    ui.menu = el('div', 'otv-menu', 'otv-panel');
    ui.osk = el('div', 'otv-osk', 'otv-panel');
    requestAnimationFrame(trackRing);
  }
  function el(tag, id, cls) {
    var e = document.createElement(tag); e.id = id; if (cls) e.className = cls;
    root.appendChild(e); return e;
  }
  var toastTimer;
  function toast(msg) {
    ensureUI(); ui.toast.textContent = msg; ui.toast.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { ui.toast.style.display = 'none'; }, 1400);
  }

  function trackRing() {
    if (ui.ring) {
      if (mode === 'browse' && current && document.contains(current.ref) && !isPassthrough()) {
        var r = current.ref.getBoundingClientRect();
        var s = ui.ring.style;
        s.display = 'block'; s.left = (r.left - 6) + 'px'; s.top = (r.top - 6) + 'px';
        s.width = (r.width + 12 - 8) + 'px'; s.height = (r.height + 12 - 8) + 'px';
      } else ui.ring.style.display = 'none';
    }
    requestAnimationFrame(trackRing);
  }

  // ------------------------------------------------------- spatial browse
  function measure(ref) {
    var r = ref.getBoundingClientRect();
    return { ref: ref, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  }

  function candidates() {
    var vw = innerWidth, vh = innerHeight, out = [];
    var nodes = document.querySelectorAll(SELECTORS);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.disabled || n.id && n.id.indexOf('otv-') === 0) continue;
      var r = n.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      if (r.width * r.height > vw * vh * 0.5 && n.tagName !== 'VIDEO') continue;
      var cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || +cs.opacity === 0) continue;
      // skip anything covered by something else (e.g. behind a modal)
      var cx = Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2));
      var cy = Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2));
      var top = document.elementFromPoint(cx, cy);
      if (top && !(top === n || n.contains(top) || top.contains(n))) continue;
      out.push({ ref: n, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
    }
    return out;
  }

  function focusItem(it) {
    current = it;
    try { it.ref.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    try { it.ref.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); } catch (e) {}
  }

  function scrollDir(dir) {
    var bx = scrollX, by = scrollY;
    var dy = innerHeight * 0.6, dx = innerWidth * 0.4;
    window.scrollBy(dir === 'left' ? -dx : dir === 'right' ? dx : 0, dir === 'up' ? -dy : dir === 'down' ? dy : 0);
    return bx !== scrollX || by !== scrollY;
  }

  function move(dir) {
    var items = candidates();
    if (!current || !document.contains(current.ref)) {
      var f = Nav.firstItem(items);
      if (f) focusItem(f); else scrollDir(dir);
      return;
    }
    var cur = measure(current.ref);
    var next = Nav.pickNext(cur, items, dir);
    if (next) { focusItem(next); return; }
    if (scrollDir(dir)) {
      setTimeout(function () {
        var its = candidates();
        var c2 = measure(current.ref);
        var onScreen = c2.rect.bottom > 0 && c2.rect.top < innerHeight && c2.rect.right > 0 && c2.rect.left < innerWidth;
        var n2 = onScreen ? Nav.pickNext(c2, its, dir) : (dir === 'up' || dir === 'left' ? Nav.lastItem(its) : Nav.firstItem(its));
        if (n2) focusItem(n2);
      }, 120);
    } else if (ui.ring) {                              // edge bump
      ui.ring.style.transform = 'translate(' + (dir === 'left' ? -8 : dir === 'right' ? 8 : 0) + 'px,' + (dir === 'up' ? -8 : dir === 'down' ? 8 : 0) + 'px)';
      setTimeout(function () { ui.ring.style.transform = ''; }, 90);
    }
  }

  var TEXT_TYPES = /^(text|search|email|password|url|tel|number|)$/;
  function activate(elm) {
    var tag = elm.tagName;
    if (tag === 'INPUT' && TEXT_TYPES.test((elm.type || '').toLowerCase()) || tag === 'TEXTAREA' || elm.isContentEditable) {
      openOSK(elm); return;
    }
    if (tag === 'SELECT') {                            // native popups are mouse-only: cycle instead
      elm.selectedIndex = (elm.selectedIndex + 1) % elm.options.length;
      elm.dispatchEvent(new Event('input', { bubbles: true }));
      elm.dispatchEvent(new Event('change', { bubbles: true }));
      toast(elm.options[elm.selectedIndex].text); return;
    }
    if (tag === 'VIDEO') { elm.paused ? elm.play() : elm.pause(); return; }
    try { elm.focus({ preventScroll: true }); } catch (e) {}
    elm.click();
  }

  // ---------------------------------------------------------- cursor mode
  function setCursorMode(on) {
    ensureUI();
    mode = on ? 'cursor' : 'browse';
    ui.cursor.style.display = on ? 'block' : 'none';
    if (on) drawCursor();
    toast(on ? 'Cursor mode' : 'Focus mode');
  }
  function drawCursor() { ui.cursor.style.left = cursor.x + 'px'; ui.cursor.style.top = cursor.y + 'px'; }
  function cursorMove(dir) {
    var step = Math.min(56, 10 + repeatCount * 4), pad = 6;
    var dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
    var dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
    var nx = cursor.x + dx, ny = cursor.y + dy;
    if (ny > innerHeight - pad && dy > 0) scrollBy(0, step * 2);
    if (ny < pad && dy < 0) scrollBy(0, -step * 2);
    cursor.x = Math.max(pad, Math.min(innerWidth - pad, nx));
    cursor.y = Math.max(pad, Math.min(innerHeight - pad, ny));
    drawCursor();
  }
  function cursorClick() {
    ui.cursor.style.display = 'none';
    var t = document.elementFromPoint(cursor.x, cursor.y);
    ui.cursor.style.display = 'block';
    if (!t) return;
    var o = { bubbles: true, cancelable: true, clientX: cursor.x, clientY: cursor.y, view: window };
    ['mousemove', 'mousedown', 'mouseup'].forEach(function (n) { t.dispatchEvent(new MouseEvent(n, o)); });
    var field = t.closest && t.closest('input,textarea,[contenteditable=true]');
    if (field && (field.tagName !== 'INPUT' || TEXT_TYPES.test((field.type || '').toLowerCase()))) openOSK(field);
    else t.click();
  }

  // ----------------------------------------------------------- player mode
  function playerVideo() {
    if (isPassthrough()) return null;
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i], r = v.getBoundingClientRect();
      if (!v.paused && r.width * r.height > innerWidth * innerHeight * 0.6) return v;
    }
    var fs = document.fullscreenElement;
    if (fs) { var v2 = fs.tagName === 'VIDEO' ? fs : fs.querySelector('video'); if (v2) return v2; }
    return null;
  }
  function playerKey(v, key) {
    if (key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 10); toast('⏪ 10s'); }
    else if (key === 'ArrowRight') { v.currentTime += 10; toast('10s ⏩'); }
    else if (key === 'ArrowUp') { v.volume = Math.min(1, v.volume + 0.1); toast('Volume ' + Math.round(v.volume * 100)); }
    else if (key === 'ArrowDown') { v.volume = Math.max(0, v.volume - 0.1); toast('Volume ' + Math.round(v.volume * 100)); }
  }

  // ------------------------------------------------------------ system menu
  var menuItems = [], menuSel = 0;
  function openMenu() {
    ensureUI();
    var wasCursor = mode === 'cursor';
    menuItems = [
      { label: 'Home', run: goHome },
      { label: 'Back', run: goBack },
      { label: 'Reload', run: function () { DEMO ? toast('Reload') : location.reload(); } },
      { label: 'Cursor mode: ' + (wasCursor ? 'on (select to turn off)' : 'off (select to turn on)'), run: function () { setCursorMode(!wasCursor); } },
      { label: 'Close menu', run: function () {} }
    ];
    ui._prevMode = mode; mode = 'menu'; menuSel = 0;
    ui.cursor.style.display = 'none';
    renderMenu(); ui.menu.style.display = 'block';
  }
  function renderMenu() {
    ui.menu.innerHTML = '<h1>OPEN TV</h1>' + menuItems.map(function (m, i) {
      return '<div class="it' + (i === menuSel ? ' sel' : '') + '">' + m.label + '</div>';
    }).join('');
  }
  function closeMenu() {
    ui.menu.style.display = 'none'; mode = ui._prevMode || 'browse';
    if (mode === 'cursor') ui.cursor.style.display = 'block';
  }
  function menuKey(key) {
    if (key === 'ArrowUp') menuSel = (menuSel + menuItems.length - 1) % menuItems.length;
    else if (key === 'ArrowDown') menuSel = (menuSel + 1) % menuItems.length;
    else if (key === 'Enter') {
      var item = menuItems[menuSel];
      closeMenu();
      item.run(); return;
    }
    renderMenu();
  }
  function goHome() {
    if (DEMO) { toast('Home'); if (window.__demoHome) window.__demoHome(); return; }
    location.href = HOME_URL;
  }
  function goBack() {
    if (isPassthrough()) { synthKey('Escape', 27); return; }   // YouTube TV's "back"
    if (DEMO) { toast('Back'); return; }
    history.length > 1 ? history.back() : goHome();
  }

  // --------------------------------------------------- on-screen keyboard
  var ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '⌫'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', '_'],
    ['⇧', '@', 'space', '.com', 'Go', 'Done']
  ];
  var WEIGHT = { space: 4, '.com': 1.6, Go: 1.4, Done: 1.6 };
  var oskR = 0, oskC = 0, oskShift = false, oskBuf = '';

  function openOSK(target) {
    ensureUI();
    oskTarget = target; ui._prevMode = mode === 'osk' ? ui._prevMode : mode; mode = 'osk';
    oskR = 1; oskC = 0; oskShift = false;
    oskBuf = target.isContentEditable ? target.textContent : (target.value || '');
    ui.cursor.style.display = 'none';
    renderOSK(); ui.osk.style.display = 'block';
  }
  function closeOSK() {
    ui.osk.style.display = 'none'; mode = ui._prevMode || 'browse'; oskTarget = null;
    if (mode === 'cursor') ui.cursor.style.display = 'block';
  }
  function renderOSK() {
    var html = '<div class="buf">' + (oskTarget && oskTarget.type === 'password' ? oskBuf.replace(/./g, '•') : esc(oskBuf)) + '▏</div>';
    ROWS.forEach(function (row, r) {
      html += '<div class="row">' + row.map(function (k, c) {
        var label = (oskShift && k.length === 1 && /[a-z]/.test(k)) ? k.toUpperCase() : k;
        return '<div class="otv-key' + (r === oskR && c === oskC ? ' sel' : '') + '" style="flex:' + (WEIGHT[k] || 1) + '">' + esc(label) + '</div>';
      }).join('') + '</div>';
    });
    ui.osk.innerHTML = html;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function setValue(t, v) {
    if (t.isContentEditable) { t.textContent = v; t.dispatchEvent(new Event('input', { bubbles: true })); return; }
    var proto = t.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(t, v);   // bypasses React's value tracker
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function oskKey(key) {
    if (key === 'ArrowLeft') oskC = (oskC + ROWS[oskR].length - 1) % ROWS[oskR].length;
    else if (key === 'ArrowRight') oskC = (oskC + 1) % ROWS[oskR].length;
    else if (key === 'ArrowUp' || key === 'ArrowDown') {
      var nr = (oskR + (key === 'ArrowUp' ? ROWS.length - 1 : 1)) % ROWS.length;
      oskC = Math.round(oskC / Math.max(1, ROWS[oskR].length - 1) * (ROWS[nr].length - 1)); oskR = nr;
    } else if (key === 'Enter') {
      var k = ROWS[oskR][oskC];
      if (k === '⌫') oskBuf = oskBuf.slice(0, -1);
      else if (k === '⇧') oskShift = !oskShift;
      else if (k === 'space') oskBuf += ' ';
      else if (k === 'Done') { closeOSK(); return; }
      else if (k === 'Go') { var t = oskTarget; closeOSK(); submit(t); return; }
      else { oskBuf += (oskShift && /[a-z]/.test(k)) ? k.toUpperCase() : k; if (oskShift) oskShift = false; }
      if (oskTarget) setValue(oskTarget, oskBuf);
    }
    renderOSK();
  }
  function submit(t) {
    if (!t) return;
    if (t.form && t.form.requestSubmit) { t.form.requestSubmit(); return; }
    synthKey('Enter', 13, t);
  }

  // ------------------------------------------------------ synthetic events
  function synthKey(key, code, target) {
    var t = target || document.activeElement || document.body;
    ['keydown', 'keypress', 'keyup'].forEach(function (type) {
      var e = new KeyboardEvent(type, { key: key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true });
      try { Object.defineProperty(e, 'keyCode', { get: function () { return code; } }); Object.defineProperty(e, 'which', { get: function () { return code; } }); } catch (x) {}
      t.dispatchEvent(e);
    });
  }

  // ------------------------------------------------------------- dispatch
  function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  // Real key presses are trusted; our own synthesised events are not. (window.__openTvTest lets jsdom tests fake it.)
  function trusted(e) { return e.isTrusted || !!window.__openTvTest; }

  function onKeyDown(e) {
    if (!trusted(e)) return;                           // ignore events we synthesised
    var k = e.key;
    if (!ALLOWED[k]) { if (STRICT) stop(e); return; }
    ensureUI();

    if (k === 'Enter') {
      stop(e);
      if (e.repeat) return;
      holdFired = false; clearTimeout(holdTimer);
      if (mode === 'browse' || mode === 'cursor') {
        holdTimer = setTimeout(function () { holdFired = true; openMenu(); }, HOLD_MS);
      }
      return;
    }

    // arrows
    if (e.repeat) repeatCount++; else repeatCount = 0;
    if (mode === 'menu') { stop(e); menuKey(k); return; }
    if (mode === 'osk') { stop(e); oskKey(k); return; }
    if (isPassthrough()) return;                       // site handles its own arrows
    stop(e);
    var v = playerVideo();
    if (v) { playerKey(v, k); return; }
    if (mode === 'cursor') cursorMove(Nav.DIRS[k]);
    else move(Nav.DIRS[k]);
  }

  function onKeyUp(e) {
    if (!trusted(e)) return;
    if (e.key !== 'Enter') { if (!ALLOWED[e.key] && STRICT) stop(e); return; }
    stop(e);
    clearTimeout(holdTimer);
    if (holdFired) { holdFired = false; return; }      // the hold already opened the menu
    ensureUI();
    if (mode === 'menu') return menuKey('Enter');
    if (mode === 'osk') return oskKey('Enter');
    var v = playerVideo();
    if (v) { v.paused ? v.play() : v.pause(); toast(v.paused ? '⏸' : '▶'); return; }
    if (isPassthrough()) { synthKey('Enter', 13); return; }
    if (mode === 'cursor') return cursorClick();
    if (current && document.contains(current.ref)) activate(current.ref);
    else { var f = Nav.firstItem(candidates()); if (f) { focusItem(f); } }
  }

  function onKeyPress(e) { if (trusted(e)) stop(e); }

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('keypress', onKeyPress, true);

  // Focus the first thing on launcher-like pages so the ring is visible immediately.
  window.addEventListener('DOMContentLoaded', function () {
    ensureUI();
    if (!isPassthrough()) setTimeout(function () { var f = Nav.firstItem(candidates()); if (f && !current) focusItem(f); }, 150);
  });

  // test hook (jsdom smoke tests)
  window.__openTv = { state: function () { return { mode: mode, current: current && current.ref }; } };
})();
