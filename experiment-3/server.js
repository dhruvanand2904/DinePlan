const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT || 3003);
const EXP2_DIR = path.resolve(__dirname, '..', 'experiment-2');
const DATA_FILE = path.join(EXP2_DIR, 'submissions.json');
const FEED_FILE = path.join(EXP2_DIR, 'exp3-feed.json');

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
      if (p === '/api/state' && req.method === 'GET') {
        const records = readJson(DATA_FILE);
        const feed = readJson(FEED_FILE);

        const editedIds = [...new Set(feed.map(item => item.reqId))];
        const editedPersons = editedIds.map(id => {
          const liveRec = records.find(r => r.reqId === id);
          const latestEvent = feed.find(item => item.reqId === id);
          return liveRec
            ? { ...liveRec, _lastAction: latestEvent.action, _lastChangedAt: latestEvent.changedAt }
            : { ...(latestEvent.snapshot || { reqId: id, customerName: latestEvent.customerName }), _lastAction: 'deleted', _lastChangedAt: latestEvent.changedAt };
        });

        return send(res, 200, 'application/json', JSON.stringify({
          success: true,
          linkedPath: DATA_FILE,
          records,
          feed,
          editedPersons
        }));
      }

      if (p === '/api/alter' && req.method === 'POST') {
        const body = await jsonBody(req);
        const key = String(body.key || '').trim();
        const value = String(body.value ?? '').trim();
        const scope = body.scope || 'single';
        const targetId = String(body.reqId || '').trim();

        if (!key) throw new Error('Attribute name is required.');
        if (['reqId', 'updatedAt'].includes(key)) throw new Error('Cannot alter system reserved keys.');

        const records = readJson(DATA_FILE);
        const feed = readJson(FEED_FILE);
        const now = new Date().toISOString();

        if (scope === 'all') {
          records.forEach(rec => {
            const prev = rec[key];
            rec[key] = value;
            rec.updatedAt = now;
            feed.unshift({
              eventId: 'ALT-' + Date.now().toString().slice(-6) + '-' + rec.reqId,
              reqId: rec.reqId,
              customerName: rec.customerName,
              action: 'altered',
              changes: { [key]: { from: prev ?? 'none', to: value } },
              snapshot: { ...rec },
              changedAt: now
            });
          });
        } else {
          const idx = records.findIndex(r => r.reqId === targetId);
          if (idx === -1) throw new Error('Select a valid reservation ID to alter.');
          const rec = records[idx];
          const prev = rec[key];
          rec[key] = value;
          rec.updatedAt = now;

          feed.unshift({
            eventId: 'ALT-' + Date.now().toString().slice(-6),
            reqId: rec.reqId,
            customerName: rec.customerName,
            action: 'altered',
            changes: { [key]: { from: prev ?? 'none', to: value } },
            snapshot: { ...rec },
            changedAt: now
          });
        }

        writeJson(DATA_FILE, records);
        writeJson(FEED_FILE, feed);

        return send(res, 200, 'application/json', JSON.stringify({
          success: true,
          message: `Attribute "${key}" added to submissions.json.`
        }));
      }

      const match = p.match(/^\/api\/records\/([^/]+)$/);
      if (match && req.method === 'PUT') {
        const id = decodeURIComponent(match[1]);
        const body = await jsonBody(req);
        const records = readJson(DATA_FILE);
        const feed = readJson(FEED_FILE);
        const idx = records.findIndex(r => r.reqId === id);

        if (idx === -1) throw new Error('Record not found in submissions.json.');

        const oldRec = records[idx];
        const changes = {};
        for (const [k, v] of Object.entries(body)) {
          if (k === 'reqId' || k === 'updatedAt' || k.startsWith('_')) continue;
          if (String(oldRec[k] ?? '') !== String(v ?? '')) {
            changes[k] = { from: oldRec[k] ?? '—', to: v };
          }
        }

        const updatedRec = { ...oldRec, ...body, reqId: id, updatedAt: new Date().toISOString() };
        delete updatedRec._lastAction;
        delete updatedRec._lastChangedAt;

        records[idx] = updatedRec;
        writeJson(DATA_FILE, records);

        if (Object.keys(changes).length > 0) {
          feed.unshift({
            eventId: 'EDT-' + Date.now().toString().slice(-6),
            reqId: id,
            customerName: updatedRec.customerName,
            action: 'updated',
            changes,
            snapshot: updatedRec,
            changedAt: updatedRec.updatedAt
          });
          writeJson(FEED_FILE, feed);
        }

        return send(res, 200, 'application/json', JSON.stringify({ success: true, record: updatedRec }));
      }

      if (match && req.method === 'DELETE') {
        const id = decodeURIComponent(match[1]);
        const records = readJson(DATA_FILE);
        const feed = readJson(FEED_FILE);
        const idx = records.findIndex(r => r.reqId === id);

        if (idx === -1) throw new Error('Record not found in submissions.json.');

        const removed = records[idx];
        records.splice(idx, 1);
        writeJson(DATA_FILE, records);

        feed.unshift({
          eventId: 'DEL-' + Date.now().toString().slice(-6),
          reqId: id,
          customerName: removed.customerName,
          action: 'deleted',
          changes: { status: { from: removed.status, to: 'DELETED FROM SUBMISSIONS.JSON' } },
          snapshot: removed,
          changedAt: new Date().toISOString()
        });
        writeJson(FEED_FILE, feed);

        return send(res, 200, 'application/json', JSON.stringify({ success: true }));
      }

      return send(res, 404, 'application/json', JSON.stringify({ success: false, message: 'API route not found.' }));
    } catch (err) {
      return send(res, 400, 'application/json', JSON.stringify({ success: false, message: err.message || 'Bad request' }));
    }
  }

  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`\n[Experiment 3] DinePlan Edited-Records & Alter Console running at http://localhost:${PORT}`);
  console.log(` -> Linked to Exp 2 submissions.json: ${DATA_FILE}\n`);
});
