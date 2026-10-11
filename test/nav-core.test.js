const test = require('node:test');
const assert = require('node:assert/strict');
const Nav = require('../extension/nav-core.js');

const box = (ref, left, top, w = 100, h = 100) => ({ ref, rect: { left, top, right: left + w, bottom: top + h } });

// 3x3 grid of 100px tiles with 20px gaps
const grid = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push(box(`${r}${c}`, c * 120, r * 120));
const at = (ref) => grid.find((g) => g.ref === ref);

test('moves one cell in each direction on a grid', () => {
  const mid = at('11');
  assert.equal(Nav.pickNext(mid, grid, 'right').ref, '12');
  assert.equal(Nav.pickNext(mid, grid, 'left').ref, '10');
  assert.equal(Nav.pickNext(mid, grid, 'up').ref, '01');
  assert.equal(Nav.pickNext(mid, grid, 'down').ref, '21');
});

test('returns null at the grid edge', () => {
  assert.equal(Nav.pickNext(at('00'), grid, 'left'), null);
  assert.equal(Nav.pickNext(at('00'), grid, 'up'), null);
  assert.equal(Nav.pickNext(at('22'), grid, 'right'), null);
  assert.equal(Nav.pickNext(at('22'), grid, 'down'), null);
});

test('prefers the aligned neighbour over a nearer diagonal one', () => {
  const from = box('from', 0, 0, 100, 50);
  const below = box('below', 0, 200, 100, 50);       // directly below, far
  const diag = box('diag', 160, 60, 100, 50);        // nearer but off to the side
  assert.equal(Nav.pickNext(from, [from, below, diag], 'down').ref, 'below');
});

test('works with differently sized elements (wide banner under a row)', () => {
  const a = box('a', 0, 0), b = box('b', 120, 0);
  const banner = box('banner', 0, 140, 220, 60);
  assert.equal(Nav.pickNext(a, [a, b, banner], 'down').ref, 'banner');
  assert.equal(Nav.pickNext(b, [a, b, banner], 'down').ref, 'banner');
  assert.equal(Nav.pickNext(banner, [a, b, banner], 'up').ref !== 'banner', true);
});

test('does not pick containers that merely enclose the current item', () => {
  const inner = box('inner', 50, 50, 40, 40);
  const outer = box('outer', 0, 0, 200, 200);
  assert.equal(Nav.pickNext(inner, [inner, outer], 'right'), null);
  assert.equal(Nav.pickNext(inner, [inner, outer], 'down'), null);
});

test('firstItem / lastItem follow reading order', () => {
  assert.equal(Nav.firstItem(grid).ref, '00');
  assert.equal(Nav.lastItem(grid).ref, '22');
});

test('every item in a grid is reachable from the first using only arrows (no dead ends)', () => {
  const seen = new Set(['00']);
  const queue = [at('00')];
  while (queue.length) {
    const cur = queue.shift();
    for (const d of ['up', 'down', 'left', 'right']) {
      const n = Nav.pickNext(cur, grid, d);
      if (n && !seen.has(n.ref)) { seen.add(n.ref); queue.push(n); }
    }
  }
  assert.equal(seen.size, 9);
});
