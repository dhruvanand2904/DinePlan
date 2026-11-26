const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT || 3002);
const DATA_FILE = path.join(__dirname, 'submissions.json');
const FEED_FILE = path.join(__dirname, 'exp3-feed.json');

function readJson(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
  });
}

function logChangeForExp3And4(record, action, changes) {
  const feed = readJson(FEED_FILE);
  feed.unshift({
    eventId: 'EVT-' + Date.now().toString().slice(-6),
    reqId: record.reqId,
    customerName: record.customerName,
    action,
    changes,
    snapshot: record,
    changedAt: new Date().toISOString()
  });
  writeJson(FEED_FILE, feed);
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(__dirname, pathname);
  const allowed = new Set(['index.html', 'style.css', 'app.js'].map(f => path.join(__dirname, f)));
  if (!allowed.has(filePath)) return send(res, 404, 'text/plain', 'Not found');

  const ext = path.extname(filePath);
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  }[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) return send(res, 404, 'text/plain', 'File not found');
    send(res, 200, mime, content);
  });
}

http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;

  if (p.startsWith('/api/')) {
    try {
      if (p === '/api/records' && req.method === 'GET') {
        return send(res, 200, 'application/json', JSON.stringify({
          success: true,
          records: readJson(DATA_FILE)
        }));
      }

      if (p === '/api/records' && req.method === 'POST') {
        const body = await jsonBody(req);
        if (!String(body.customerName || '').trim()) {
          throw new Error('Customer name is required.');
        }
        const records = readJson(DATA_FILE);
        const nextNum = 1001 + records.length;
        const reqId = 'DP-' + nextNum + '-' + Date.now().toString().slice(-3);
        const newRecord = { reqId, ...body, updatedAt: new Date().toISOString() };
        records.push(newRecord);
        writeJson(DATA_FILE, records);

        return send(res, 201, 'application/json', JSON.stringify({
          success: true,
          record: newRecord
        }));
      }

      const match = p.match(/^\/api\/records\/([^/]+)$/);
      if (match && req.method === 'PUT') {
        const id = decodeURIComponent(match[1]);
        const body = await jsonBody(req);
        const records = readJson(DATA_FILE);
        const idx = records.findIndex(r => String(r.reqId) === id);
        if (idx === -1) {
          return send(res, 404, 'application/json', JSON.stringify({
            success: false,
            message: 'Reservation not found.'
          }));
        }

        const oldRec = records[idx];
        const changes = {};
        for (const [k, v] of Object.entries(body)) {
          if (k === 'reqId' || k === 'updatedAt') continue;
          if (String(oldRec[k] ?? '') !== String(v ?? '')) {
            changes[k] = { from: oldRec[k] ?? '—', to: v };
          }
        }

        const updatedRec = { ...oldRec, ...body, reqId: id, updatedAt: new Date().toISOString() };
        records[idx] = updatedRec;
        writeJson(DATA_FILE, records);

        if (Object.keys(changes).length > 0) {
          logChangeForExp3And4(updatedRec, 'updated', changes);
        }

        return send(res, 200, 'application/json', JSON.stringify({
          success: true,
          record: updatedRec,
          changedCount: Object.keys(changes).length
        }));
      }

      return send(res, 404, 'application/json', JSON.stringify({ success: false, message: 'API route not found.' }));
    } catch (err) {
      return send(res, 400, 'application/json', JSON.stringify({ success: false, message: err.message || 'Bad request' }));
    }
  }

  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`\n[Experiment 2] DinePlan Data Entry & Blueprint running at http://localhost:${PORT}`);
  console.log(` -> Owns submissions.json: ${DATA_FILE}`);
  console.log(` -> Feeds Experiment 3 & 4 via: ${FEED_FILE}\n`);
});
