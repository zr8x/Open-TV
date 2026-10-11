#!/usr/bin/env node
// Tiny dependency-free server for the launcher. Binds to localhost only.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.OPEN_TV_PORT || 7070);

const FILES = {
  '/': ['launcher/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['launcher/index.html', 'text/html; charset=utf-8'],
  '/nav-core.js': ['extension/nav-core.js', 'text/javascript'],
  '/shell.js': ['extension/shell.js', 'text/javascript'],
  '/api/services': ['server/services.json', 'application/json'],
};

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/health') { res.writeHead(200); return res.end('ok'); }
  const hit = FILES[url];
  if (!hit) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(path.join(ROOT, hit[0]), (err, buf) => {
    if (err) { res.writeHead(500); return res.end('error'); }
    res.writeHead(200, { 'Content-Type': hit[1], 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`open-tv launcher on http://localhost:${PORT}`));
