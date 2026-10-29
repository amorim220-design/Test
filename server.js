'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, 'www');
const port = Number(process.env.PORT || 8080);
const keyFile = path.join(__dirname, '.link-key');
const maxBody = 2 * 1024 * 1024;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function linkKey() {
  try {
    const v = fs.readFileSync(keyFile, 'utf8').trim();
    if (v) return v;
  } catch (e) {}
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let k = '';
  for (let i = 0; i < 6; i++) k += chars[Math.floor(Math.random() * chars.length)];
  try {
    fs.writeFileSync(keyFile, k, { mode: 0o600 });
  } catch (e) {}
  return k;
}

const KEY = linkKey();
const displays = new Set();
let lastState = null;

function lanUrls() {
  const urls = [];
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) urls.push('http://' + n.address + ':' + port);
    }
  }
  return urls;
}

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store'
  });
  res.end(body);
}

function broadcast(payload) {
  const chunk = 'data: ' + JSON.stringify(payload) + '\n\n';
  for (const res of displays) {
    try {
      res.write(chunk);
    } catch (e) {
      displays.delete(res);
    }
  }
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > maxBody) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf8')));
  req.on('error', () => cb(''));
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const url = decodeURIComponent(parsed.pathname);
  const query = parsed.searchParams;

  if (url === '/api/link') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method' });
    return sendJson(res, 200, {
      key: KEY,
      urls: lanUrls(),
      displays: displays.size,
      hasState: !!lastState
    });
  }

  if (url === '/api/stream') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method' });
    if (query.get('key') !== KEY) return sendJson(res, 403, { error: 'bad key' });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    res.write('retry: 2000\n\n');
    displays.add(res);
    if (lastState) res.write('data: ' + JSON.stringify(lastState) + '\n\n');
    req.on('close', () => displays.delete(res));
    return;
  }

  if (url === '/api/state') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
    if (query.get('key') !== KEY) return sendJson(res, 403, { error: 'bad key' });
    return readBody(req, body => {
      let data = null;
      try {
        data = JSON.parse(body);
      } catch (e) {}
      if (!data || !Array.isArray(data.shapes)) return sendJson(res, 400, { error: 'bad payload' });
      lastState = { project: { app: 'prism-mapper', version: 1, shapes: data.shapes } };
      broadcast(lastState);
      sendJson(res, 200, { ok: true, displays: displays.size });
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'method' });
  }

  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(data);
  });
});

setInterval(() => {
  for (const res of displays) {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      displays.delete(res);
    }
  }
}, 20000).unref();

server.listen(port, '0.0.0.0', () => {
  console.log('Prism Mapper:');
  console.log('  http://localhost:' + port);
  for (const u of lanUrls()) console.log('  ' + u);
  console.log('  modo Link: código ' + KEY);
  console.log('  tela do projetor: ' + (lanUrls()[0] || 'http://localhost:' + port) +
    '/?display=1&key=' + KEY);
});
