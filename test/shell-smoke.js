const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname,'../dist/demo.html'), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails++; };

(async () => {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    beforeParse(w) {
      w.__openTvTest = true;
      const tiles = () => Array.from(w.document.querySelectorAll('a.tile'));
      const rectFor = (el) => {
        const i = tiles().indexOf(el);
        if (i < 0) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        const c = i % 4, r = Math.floor(i / 4);
        const left = c * 240, top = 200 + r * 170;
        return { left, top, right: left + 220, bottom: top + 150, width: 220, height: 150 };
      };
      w.Element.prototype.getBoundingClientRect = function () { return rectFor(this); };
      w.document.elementFromPoint = (x, y) => tiles().find(t => { const r = rectFor(t); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) || w.document.body;
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollBy = () => {};
    }
  });
  const w = dom.window;
  const key = (type, k) => { const e = new w.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }); w.dispatchEvent(e); return e; };
  const idx = () => Array.from(w.document.querySelectorAll('a.tile')).indexOf(w.__openTv.state().current);
  const press = async (k) => { key('keydown', k); key('keyup', k); await sleep(20); };

  await sleep(400);
  check('tiles rendered', w.document.querySelectorAll('a.tile').length === 11);
  check('initial focus on first tile', idx() === 0);
  await press('ArrowRight'); check('right -> tile 1', idx() === 1);
  await press('ArrowDown');  check('down -> tile 5', idx() === 5);
  await press('ArrowLeft');  check('left -> tile 4', idx() === 4);
  await press('ArrowUp');    check('up -> tile 0', idx() === 0);
  const blocked = key('keydown', 'a'); check('non-allowed key is blocked', blocked.defaultPrevented);
  const esc = key('keydown', 'Escape'); check('Escape is blocked', esc.defaultPrevented);

  await press('ArrowRight');
  await press('Enter');
  const overlay = w.document.getElementById('demo-open');
  check('short select activates tile (demo overlay shows Netflix)', overlay && overlay.style.display === 'flex' && /Netflix/.test(overlay.textContent));

  key('keydown', 'Enter'); await sleep(850);
  check('hold select opens menu', w.__openTv.state().mode === 'menu');
  key('keyup', 'Enter'); await sleep(20);
  check('keyup after hold keeps menu open (no stray activation)', w.__openTv.state().mode === 'menu');
  await press('ArrowDown'); await press('ArrowDown'); await press('ArrowDown');
  await press('Enter');   // 'Cursor mode' item
  check('menu -> cursor mode', w.__openTv.state().mode === 'cursor');
  const c0 = w.document.getElementById('otv-cursor').style.left;
  await press('ArrowRight');
  check('cursor moves with arrows', w.document.getElementById('otv-cursor').style.left !== c0);
  key('keydown', 'Enter'); await sleep(850); key('keyup', 'Enter'); await sleep(20);
  check('menu reachable from cursor mode', w.__openTv.state().mode === 'menu');
  await press('Enter');   // 'Home'
  check('Home returned to launcher (overlay hidden)', overlay.style.display === 'none');
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
