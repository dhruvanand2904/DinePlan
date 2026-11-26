const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3004);

// Linked directly to Experiment 2's JSON files (no duplicate submissions.json in Exp 4)
const EXP2_DIR = path.resolve(__dirname, '..', 'experiment-2');
const DATA_FILE = path.join(EXP2_DIR, 'submissions.json');
const FEED_FILE = path.join(EXP2_DIR, 'exp3-feed.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

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

// Express.js helper: Computes how many times each customer has updated/altered their reservation
function computeCustomerUpdateStats(records, feed) {
  const countsById = {};
  const lastUpdatedById = {};

  feed.forEach(evt => {
    const id = evt.reqId;
    if (!id) return;
    countsById[id] = (countsById[id] || 0) + 1;
    if (!lastUpdatedById[id]) {
      lastUpdatedById[id] = evt.changedAt;
    }
  });

  // Combine active records and any deleted records from feed so every customer's update count is tracked
  const customerMap = new Map();
  records.forEach(r => {
    customerMap.set(r.reqId, {
      reqId: r.reqId,
      customerName: r.customerName,
      diningZone: r.diningZone,
      status: r.status,
      updateCount: countsById[r.reqId] || 0,
      lastUpdatedAt: lastUpdatedById[r.reqId] || r.updatedAt
    });
  });

  feed.forEach(evt => {
    if (!customerMap.has(evt.reqId)) {
      customerMap.set(evt.reqId, {
        reqId: evt.reqId,
        customerName: evt.customerName,
        diningZone: evt.snapshot?.diningZone || '—',
        status: 'Deleted',
        updateCount: countsById[evt.reqId] || 1,
        lastUpdatedAt: lastUpdatedById[evt.reqId] || evt.changedAt
      });
    }
  });

  const list = Array.from(customerMap.values()).sort((a, b) => b.updateCount - a.updateCount);
  const totalUpdates = Object.values(countsById).reduce((sum, n) => sum + n, 0);
  const mostUpdated = list.length && list[0].updateCount > 0 ? list[0] : null;

  return { countsById, list, totalUpdates, mostUpdated };
}

// GET full linked state + Express.js customer update frequencies
app.get('/api/state', (req, res) => {
  const records = readJson(DATA_FILE);
  const feed = readJson(FEED_FILE);
  const updateStats = computeCustomerUpdateStats(records, feed);

  const editedIds = [...new Set(feed.map(item => item.reqId))];
  const editedPersons = editedIds.map(id => {
    const liveRec = records.find(r => r.reqId === id);
    const latestEvent = feed.find(item => item.reqId === id);
    const updateCount = updateStats.countsById[id] || 0;
    return liveRec
      ? { ...liveRec, _updateCount: updateCount, _lastAction: latestEvent.action, _lastChangedAt: latestEvent.changedAt }
      : { ...(latestEvent.snapshot || { reqId: id, customerName: latestEvent.customerName }), _updateCount: updateCount, _lastAction: 'deleted', _lastChangedAt: latestEvent.changedAt };
  });

  res.json({
    success: true,
    linkedPath: DATA_FILE,
    records,
    feed,
    editedPersons,
    updateStats
  });
});

// Dedicated Express.js endpoint returning customer update counts
app.get('/api/update-counts', (req, res) => {
  const records = readJson(DATA_FILE);
  const feed = readJson(FEED_FILE);
  res.json({
    success: true,
    ...computeCustomerUpdateStats(records, feed)
  });
});

// POST /api/alter: Add new JSON attributes to Experiment 2's submissions.json
app.post('/api/alter', (req, res) => {
  try {
    const key = String(req.body.key || '').trim();
    const value = String(req.body.value ?? '').trim();
    const scope = req.body.scope || 'single';
    const targetId = String(req.body.reqId || '').trim();

    if (!key) return res.status(400).json({ success: false, message: 'Attribute name is required.' });
    if (['reqId', 'updatedAt'].includes(key)) {
      return res.status(400).json({ success: false, message: 'Cannot alter system reserved keys.' });
    }

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
      if (idx === -1) return res.status(404).json({ success: false, message: 'Select a valid reservation ID to alter.' });
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

    res.json({ success: true, message: `Attribute "${key}" added to submissions.json.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/records/:id: Edit a person's record in submissions.json & increment update counter
app.put('/api/records/:id', (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const records = readJson(DATA_FILE);
    const feed = readJson(FEED_FILE);
    const idx = records.findIndex(r => r.reqId === id);

    if (idx === -1) return res.status(404).json({ success: false, message: 'Record not found in submissions.json.' });

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
    delete updatedRec._updateCount;

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

    const customerUpdates = feed.filter(e => e.reqId === id).length;
    res.json({ success: true, record: updatedRec, customerUpdates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/records/:id: Delete a person from submissions.json
app.delete('/api/records/:id', (req, res) => {
  try {
    const id = req.params.id;
    const records = readJson(DATA_FILE);
    const feed = readJson(FEED_FILE);
    const idx = records.findIndex(r => r.reqId === id);

    if (idx === -1) return res.status(404).json({ success: false, message: 'Record not found in submissions.json.' });

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

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n[Experiment 4 - Express.js] DinePlan Console + Customer Update Counter running at http://localhost:${PORT}`);
  console.log(` -> Linked to Exp 2 submissions.json: ${DATA_FILE}\n`);
});
