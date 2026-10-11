/*
 * nav-core.js — pure spatial-navigation math (no DOM access).
 *
 * Given the currently focused item and a list of candidate items (each with a
 * bounding rect), pick the best neighbour in a direction. Used by the content
 * script (shell.js) and unit-tested in Node (test/nav-core.test.js).
 *
 * Item shape: { ref: any, rect: { left, top, right, bottom } }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpenTVNav = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function gap(a1, a2, b1, b2) {
    // distance between two 1-D ranges; 0 if they overlap
    return Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));
  }

  // Lower score = better. Returns Infinity if `to` is not in direction `dir`.
  function score(from, to, dir) {
    var fcx = (from.left + from.right) / 2, fcy = (from.top + from.bottom) / 2;
    var tcx = (to.left + to.right) / 2, tcy = (to.top + to.bottom) / 2;
    var primary, edgeGap, perpGap, perpOffset;
    // an ancestor/container that fully encloses the current item is never a "neighbour"
    if (to.left <= from.left && to.top <= from.top && to.right >= from.right && to.bottom >= from.bottom) return Infinity;

    if (dir === 'right' || dir === 'left') {
      primary = dir === 'right' ? tcx - fcx : fcx - tcx;
      if (primary <= 1) return Infinity;
      if (dir === 'right' ? to.right <= from.right : to.left >= from.left) return Infinity;
      edgeGap = dir === 'right' ? Math.max(0, to.left - from.right) : Math.max(0, from.left - to.right);
      perpGap = gap(from.top, from.bottom, to.top, to.bottom);
      perpOffset = Math.abs(tcy - fcy);
    } else {
      primary = dir === 'down' ? tcy - fcy : fcy - tcy;
      if (primary <= 1) return Infinity;
      if (dir === 'down' ? to.bottom <= from.bottom : to.top >= from.top) return Infinity;
      edgeGap = dir === 'down' ? Math.max(0, to.top - from.bottom) : Math.max(0, from.top - to.bottom);
      perpGap = gap(from.left, from.right, to.left, to.right);
      perpOffset = Math.abs(tcx - fcx);
    }
    return edgeGap + perpGap * 4 + perpOffset * 0.5 + primary * 0.1;
  }

  function pickNext(current, items, dir) {
    var best = null, bestScore = Infinity;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it === current || it.ref === current.ref) continue;
      var s = score(current.rect, it.rect, dir);
      if (s < bestScore) { bestScore = s; best = it; }
    }
    return best;
  }

  function reading(it) { return it.rect.top * 3 + it.rect.left; }

  function firstItem(items) {
    var best = null;
    for (var i = 0; i < items.length; i++) if (!best || reading(items[i]) < reading(best)) best = items[i];
    return best;
  }

  function lastItem(items) {
    var best = null;
    for (var i = 0; i < items.length; i++) if (!best || reading(items[i]) > reading(best)) best = items[i];
    return best;
  }

  return { DIRS: DIRS, score: score, pickNext: pickNext, firstItem: firstItem, lastItem: lastItem };
});
