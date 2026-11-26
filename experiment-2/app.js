const $ = id => document.getElementById(id);
let records = [];

const FIELDS = [
  'reqId', 'customerName', 'phone', 'email', 'eventType', 'diningZone',
  'mealCourse', 'dietaryPreference', 'beveragePackage', 'eventDate',
  'eventTime', 'guests', 'tableCount', 'seatsPerTable', 'tableShape',
  'tableDirection', 'roomWidth', 'roomHeight', 'assignedServer', 'status', 'notes'
];

const LABELS = {
  reqId: 'ID', customerName: 'Customer', phone: 'Phone', email: 'Email',
  eventType: 'Occasion', diningZone: 'Dining Zone', mealCourse: 'Course',
  dietaryPreference: 'Dietary', beveragePackage: 'Beverage', eventDate: 'Date',
  eventTime: 'Time', guests: 'Guests', tableCount: 'Tables', seatsPerTable: 'Seats/Tbl',
  tableShape: 'Shape', tableDirection: 'Facing', roomWidth: 'Width(ft)',
  roomHeight: 'Height(ft)', assignedServer: 'Server', status: 'Status', notes: 'Notes'
};

const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function showToast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(window._t);
  window._t = setTimeout(() => { t.className = 'toast'; }, 3400);
}

async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json();
  if (!res.ok || data.success === false) throw new Error(data.message || 'Server error');
  return data;
}

function renderBlueprint() {
  const zone = $('diningZone').value || 'Main Dining';
  const shape = $('tableShape').value || 'Circle';
  const dir = $('tableDirection').value || 'North';
  const tables = Math.max(1, Math.min(20, Number($('tableCount').value) || 3));
  const seats = Math.max(2, Math.min(14, Number($('seatsPerTable').value) || 6));
  const guests = Math.max(1, Number($('guests').value) || 12);
  const wFt = Math.max(12, Number($('roomWidth').value) || 32);
  const hFt = Math.max(12, Number($('roomHeight').value) || 24);
  const area = wFt * hFt;
  const totalChairs = tables * seats;

  $('bpTitle').textContent = `BLUEPRINT · ${zone.toUpperCase()} (${dir.toUpperCase()})`;
  $('bpAreaLabel').textContent = `${wFt} ft × ${hFt} ft (${area} sq.ft)`;
  $('bpTables').textContent = `${tables} × ${shape}`;
  $('bpChairs').textContent = `${totalChairs} Chairs`;
  $('bpGuests').textContent = `${guests} Guests`;
  $('bpDensity').textContent = `${(area / guests).toFixed(1)} sq.ft`;

  const svg = $('blueprintSvg');
  const padX = 56, padY = 48;
  const maxW = 560 - padX * 2;
  const maxH = 400 - padY * 2;
  const ratio = wFt / hFt;
  let roomW = maxW, roomH = maxW / ratio;
  if (roomH > maxH) { roomH = maxH; roomW = maxH * ratio; }
  const rx = (560 - roomW) / 2;
  const ry = (400 - roomH) / 2;

  let out = `
    <line x1="${rx}" y1="${ry - 18}" x2="${rx + roomW}" y2="${ry - 18}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="${rx + roomW / 2}" y="${ry - 24}" fill="#94a3b8" font-size="11" font-weight="700" text-anchor="middle">${wFt} FT WIDTH</text>
    <line x1="${rx - 18}" y1="${ry}" x2="${rx - 18}" y2="${ry + roomH}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="${rx - 24}" y="${ry + roomH / 2}" fill="#94a3b8" font-size="11" font-weight="700" text-anchor="middle" transform="rotate(-90 ${rx - 24} ${ry + roomH / 2})">${hFt} FT DEPTH</text>

    <rect x="${rx}" y="${ry}" width="${roomW}" height="${roomH}" rx="8" fill="rgba(15, 23, 42, 0.72)" stroke="#38bdf8" stroke-width="2.5"/>

    <rect x="${rx + 22}" y="${ry + roomH - 4}" width="46" height="8" fill="#34d399" rx="2"/>
    <path d="M ${rx + 22} ${ry + roomH} A 42 42 0 0 1 ${rx + 64} ${ry + roomH - 36}" fill="none" stroke="#34d399" stroke-width="1.2" stroke-dasharray="3 3"/>
    <text x="${rx + 45}" y="${ry + roomH + 16}" fill="#34d399" font-size="9" font-weight="800" text-anchor="middle">ENTRANCE</text>

    <rect x="${rx + roomW - 76}" y="${ry + 10}" width="64" height="22" rx="4" fill="rgba(167, 139, 250, 0.25)" stroke="#a78bfa" stroke-width="1.4"/>
    <text x="${rx + roomW - 44}" y="${ry + 24}" fill="#c4b5fd" font-size="8.5" font-weight="700" text-anchor="middle">SERVICE BAR</text>

    <circle cx="${rx + 26}" cy="${ry + 24}" r="12" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" stroke-width="1"/>
    <text x="${rx + 26}" y="${ry + 27}" fill="#7dd3fc" font-size="9" font-weight="800" text-anchor="middle">${dir[0]}</text>
  `;

  const innerX = rx + 34, innerY = ry + 42, innerW = roomW - 68, innerH = roomH - 72;
  const cols = Math.ceil(Math.sqrt(tables * (innerW / innerH)));
  const rows = Math.ceil(tables / cols);
  const cellW = innerW / cols, cellH = innerH / rows;
  const baseRadius = Math.max(14, Math.min(cellW, cellH) * 0.24);

  for (let i = 0; i < tables; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const cx = innerX + cellW * (c + 0.5), cy = innerY + cellH * (r + 0.5);

    for (let s = 0; s < seats; s++) {
      const angle = (2 * Math.PI * s) / seats - Math.PI / 2;
      const dist = baseRadius + 9;
      const sx = cx + Math.cos(angle) * dist, sy = cy + Math.sin(angle) * dist;
      out += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.3" fill="#f59e0b" stroke="#14202e" stroke-width="1"/>`;
    }

    if (shape === 'Circle') {
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${baseRadius.toFixed(1)}" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" stroke-width="2"/>`;
    } else if (shape === 'Rectangle') {
      const tw = baseRadius * 2.3, th = baseRadius * 1.45;
      out += `<rect x="${(cx - tw / 2).toFixed(1)}" y="${(cy - th / 2).toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" rx="5" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" stroke-width="2"/>`;
    } else {
      const side = baseRadius * 1.85;
      out += `<rect x="${(cx - side / 2).toFixed(1)}" y="${(cy - side / 2).toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" rx="5" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" stroke-width="2"/>`;
    }
    out += `<text x="${cx.toFixed(1)}" y="${(cy + 3.5).toFixed(1)}" fill="#e0f2fe" font-size="10" font-weight="800" text-anchor="middle">T${i + 1}</text>`;
  }

  svg.innerHTML = out;
}

function renderAll() {
  $('kpiRecords').textContent = records.length;
  $('kpiTables').textContent = records.reduce((sum, r) => sum + (Number(r.tableCount) || 0), 0);
  $('kpiChairs').textContent = records.reduce((sum, r) => sum + (Number(r.tableCount) || 0) * (Number(r.seatsPerTable) || 0), 0);
  $('kpiGuests').textContent = records.reduce((sum, r) => sum + (Number(r.guests) || 0), 0);

  const q = $('searchBox').value.trim().toLowerCase();
  const filtered = records.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  const allKeys = [...new Set([...FIELDS, ...records.flatMap(r => Object.keys(r))])].filter(k => k !== 'updatedAt');

  $('tableHead').innerHTML = `<tr>${allKeys.map(k => `<th>${esc(LABELS[k] || k)}</th>`).join('')}<th>Capacity</th><th>Action</th></tr>`;

  $('tableBody').innerHTML = filtered.map(r => {
    const cap = (Number(r.tableCount) || 0) * (Number(r.seatsPerTable) || 0);
    const ok = cap >= (Number(r.guests) || 0);
    return `<tr>
      ${allKeys.map(k => `<td>${esc(r[k])}</td>`).join('')}
      <td><span class="pill-status ${ok ? 'ok' : 'warn'}">${cap} seats</span></td>
      <td><button class="tiny-btn" data-edit="${esc(r.reqId)}">✎ Edit</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="${allKeys.length + 2}" style="text-align:center;padding:24px;color:var(--muted);">No matching records found.</td></tr>`;

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => loadForEdit(btn.dataset.edit);
  });
}

function loadForEdit(id) {
  const rec = records.find(r => r.reqId === id);
  if (!rec) return;

  FIELDS.forEach(k => {
    const el = $(k);
    if (el) el.value = rec[k] ?? '';
  });

  $('formHeading').textContent = `Editing Reservation · ${rec.reqId}`;
  $('formSub').textContent = `Updating ${rec.customerName} in submissions.json (syncs to Exp 3 & Exp 4).`;
  $('editingBadge').textContent = `Mode: Edit (${rec.reqId})`;
  $('editingBadge').className = 'pill-status warn';
  $('submitBtn').textContent = '✓ Save Edits & Sync';

  renderBlueprint();
  window.scrollTo({ top: document.querySelector('.workspace-grid').offsetTop - 90, behavior: 'smooth' });
}

function resetForm() {
  $('bookingForm').reset();
  $('reqId').value = '';
  $('guests').value = 18;
  $('tableCount').value = 3;
  $('seatsPerTable').value = 6;
  $('roomWidth').value = 32;
  $('roomHeight').value = 24;
  $('assignedServer').value = 'Rohan K.';
  $('eventDate').value = new Date().toISOString().slice(0, 10);

  $('formHeading').textContent = 'New Dining Reservation';
  $('formSub').textContent = 'Enter customer & dining details to append to submissions.json.';
  $('editingBadge').textContent = 'Mode: Create';
  $('editingBadge').className = 'pill-status ok';
  $('submitBtn').textContent = '＋ Save New Reservation';
  renderBlueprint();
}

$('bookingForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const id = $('reqId').value.trim();
    const payload = {};
    FIELDS.forEach(k => {
      if (k === 'reqId') return;
      const el = $(k);
      if (el) payload[k] = el.value.trim();
    });
    ['guests', 'tableCount', 'seatsPerTable', 'roomWidth', 'roomHeight'].forEach(k => {
      payload[k] = Number(payload[k] || 0);
    });

    if (id) {
      const res = await api('records/' + encodeURIComponent(id), {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast(res.changedCount > 0
        ? `Updated ${id}! Synced to Exp 3 & Exp 4.`
        : `Saved ${id} (no field values changed).`);
    } else {
      await api('records', { method: 'POST', body: JSON.stringify(payload) });
      showToast('New dining reservation added to submissions.json!');
    }

    resetForm();
    await loadRecords();
  } catch (err) {
    showToast(err.message, true);
  }
});

['diningZone', 'tableShape', 'tableDirection', 'tableCount', 'seatsPerTable', 'guests', 'roomWidth', 'roomHeight'].forEach(id => {
  $(id).addEventListener('input', renderBlueprint);
  $(id).addEventListener('change', renderBlueprint);
});

$('resetBtn').onclick = resetForm;
$('searchBox').oninput = renderAll;

async function loadRecords() {
  const data = await api('records');
  records = data.records;
  $('syncLabel').textContent = 'Synced with submissions.json · ' + new Date().toLocaleTimeString();
  renderAll();
}

resetForm();
loadRecords().catch(err => showToast(err.message, true));
