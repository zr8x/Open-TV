const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname,'../dist/demo.html'), 'utf8').replace('</main>', '<input id="q" type="text"></main>');
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0;
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };
(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', beforeParse(w) {
    w.__openTvTest = true;
    w.Element.prototype.getBoundingClientRect = function () { return this.id === 'q' ? { left: 0, top: 100, right: 400, bottom: 150, width: 400, height: 50 } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
    w.document.elementFromPoint = () => w.document.getElementById('q');
    w.Element.prototype.scrollIntoView = function () {}; w.scrollBy = () => {};
  }});
  const w = dom.window;
  const key = (t, k) => w.dispatchEvent(new w.KeyboardEvent(t, { key: k, bubbles: true, cancelable: true }));
  const press = async k => { key('keydown', k); key('keyup', k); await sleep(15); };
  await sleep(400);
  const q = w.document.getElementById('q');
  check('input focused', w.__openTv.state().current === q);
  await press('Enter');
  check('select on text input opens OSK', w.__openTv.state().mode === 'osk');
  // OSK starts at row 1 (qwerty), col 0 = 'q'. Type q, then right x1 -> 'w'
  await press('Enter'); await press('ArrowRight'); await press('Enter');
  check('typed "qw" into the real input', q.value === 'qw');
  await press('ArrowDown'); await press('ArrowDown'); await press('ArrowDown'); // down to bottom row
  for (let i = 0; i < 4; i++) await press("ArrowRight");
  await press('Enter');
  check('Done closes OSK', w.__openTv.state().mode === 'browse');
  console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
