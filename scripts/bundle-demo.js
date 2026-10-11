#!/usr/bin/env node
// Builds dist/demo.html — a single self-contained file you can open in any desktop browser
// to try the keys-only navigation (arrows + Enter; hold Enter for the menu). No real navigation happens.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('launcher/index.html');
const services = JSON.parse(read('server/services.json'));

const preamble = `<script>
window.OPEN_TV_DEMO = true;
window.OPEN_TV_SERVICES = ${JSON.stringify(services)};
window.__demoOpen = function (s) {
  var d = document.getElementById('demo-open');
  if (!d) { d = document.createElement('div'); d.id = 'demo-open';
    d.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:#000;color:#fff;font:700 34px system-ui;z-index:2147483645;text-align:center;padding:5vw';
    document.body.appendChild(d); }
  d.innerHTML = 'Would open <span style="color:#5cc8ff">' + s.name + '</span><div style="font:500 20px ui-monospace,monospace;opacity:.6;margin-top:14px">' + s.url + '</div>' +
    '<div style="font:500 20px system-ui;opacity:.6;margin-top:26px">Hold SELECT (Enter) for the menu → Home</div>';
  d.style.display = 'flex';
};
window.__demoHome = function () { var d = document.getElementById('demo-open'); if (d) d.style.display = 'none'; };
</script>`;

html = html
  .replace('<script>\n  // Bundled demo', preamble + '\n<script>\n  // Bundled demo')
  .replace('<script src="/nav-core.js"></script>', '<script>' + read('extension/nav-core.js') + '</script>')
  .replace('<script src="/shell.js"></script>', '<script>' + read('extension/shell.js') + '</script>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/demo.html'), html);
console.log('wrote dist/demo.html (' + html.length + ' bytes)');
