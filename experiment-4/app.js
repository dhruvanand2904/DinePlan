const $ = id => document.getElementById(id);

let allRecords = [];
let feed = [];
let updateStats = { countsById: {}, list: [], totalUpdates: 0, mostUpdated: null };
let selectedId = '';

const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// Popup notification (Toast message confirming updates)
function showToast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(window._t);
  window._t = setTimeout(() => { t.className = 'toast'; }, 3800);
}

async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json();
  if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

function renderUpdateCountCards() {
  const box = $('updateCountGrid');
  const list = updateStats.list || [];
  if (!list.length) {
    box.innerHTML = '<div class="empty-box"><b>No customer records found.</b></div>';
    return;
  }

  box.innerHTML = list.map(item => `
    <article class="count-card">
      <div>
        <h4>${esc(item.customerName)} <small style="display:inline;">(${esc(item.reqId)})</small></h4>
        <small>${esc(item.diningZone)} · ${item.updateCount === 1 ? 'Updated 1 time' : `Updated ${item.updateCount} times`}</small>
      </div>
      <div class="count-bubble ${item.updateCount === 0 ? 'zero' : ''}" title="Total updates by ${esc(item.customerName)}">
        ${item.updateCount}×
      </div>
    </article>
  `).join('');
}

function renderEditorForm(id) {
  const rec = allRecords.find(r => r.reqId === id) || allRecords[0];
  const container = $('dynamicFields');

  if (!rec) {
    container.innerHTML = '<p style="color:var(--muted);">No active records available in submissions.json.</p>';
    return;
  }

  selectedId = rec.reqId;
  $('recordSelector').value = selectedId;
  const cnt = updateStats.countsById?.[rec.reqId] || 0;
  $('editTitle').textContent = `Editing: ${rec.customerName} (${rec.reqId}) · Updated ${cnt}×`;

  const keys = Object.keys(rec).filter(k => !['reqId', 'updatedAt'].includes(k));
  container.innerHTML = keys.map(k => {
    const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    return `
      <label>${esc(label)}
        <input data-field="${esc(k)}" value="${esc(rec[k] ?? '')}">
      </label>
    `;
  }).join('');
}

function renderDiffCards() {
  const box = $('changeCards');
  if (!feed.length) {
    box.innerHTML = `
      <div class="empty-box">
        <b>No edited persons recorded yet</b>
        <p style="margin:6px 0 0;">Edit any person or alter attributes above to see change logs appear here.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = feed.slice(0, 8).map(item => {
    const diffs = Object.entries(item.changes || {});
    return `
      <article class="change-card">
        <div class="change-top">
          <div>
            <h4>${esc(item.customerName)} <small>(${esc(item.reqId)})</small></h4>
            <small>${new Date(item.changedAt).toLocaleString()}</small>
          </div>
          <span class="badge ${esc(item.action)}">${esc(item.action)}</span>
        </div>
        <div>
          ${diffs.map(([k, d]) => `
            <div class="diff-row">
              <span>${esc(k)}</span>
              <div>
                <del>${esc(d.from)}</del> → <ins>${esc(d.to)}</ins>
              </div>
            </div>
          `).join('')}
        </div>
      </article>
    `;
  }).join('');
}

// Renders the FULL table (like Experiment 2) containing ALL records + Update Count column
function renderFullTable() {
  const q = $('searchInput').value.trim().toLowerCase();
  const rows = allRecords.filter(r => JSON.stringify(r).toLowerCase().includes(q));

  const allKeys = [...new Set([
    'reqId', 'customerName', 'phone', 'eventType', 'diningZone',
    'mealCourse', 'dietaryPreference', 'guests', 'tableCount', 'seatsPerTable',
    'tableShape', 'roomWidth', 'roomHeight', 'status',
    ...allRecords.flatMap(r => Object.keys(r))
  ])].filter(k => k !== 'updatedAt');

  $('tableHead').innerHTML = `
    <tr>
      <th>Update Count</th>
      ${allKeys.map(k => `<th>${esc(k)}</th>`).join('')}
      <th>Actions</th>
    </tr>
  `;

  if (!rows.length) {
    $('tableBody').innerHTML = `
      <tr>
        <td colspan="${allKeys.length + 2}" style="text-align:center;padding:28px;color:var(--muted);">
          No matching dining records found.
        </td>
      </tr>
    `;
    return;
  }

  $('tableBody').innerHTML = rows.map(r => {
    const count = updateStats.countsById?.[r.reqId] || 0;
    return `
      <tr>
        <td><span class="pill-status info">${count} ${count === 1 ? 'time' : 'times'}</span></td>
        ${allKeys.map(k => `<td>${esc(r[k])}</td>`).join('')}
        <td><button class="tiny-btn" data-edit="${esc(r.reqId)}">✎ Edit</button></td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => {
      renderEditorForm(btn.dataset.edit);
      window.scrollTo({ top: document.querySelector('.workspace-grid').offsetTop - 90, behavior: 'smooth' });
    };
  });
}

$('editForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!selectedId) return;
  try {
    const payload = {};
    document.querySelectorAll('#dynamicFields [data-field]').forEach(inp => {
      const k = inp.dataset.field;
      const val = inp.value.trim();
      payload[k] = ['guests', 'tableCount', 'seatsPerTable', 'roomWidth', 'roomHeight'].includes(k)
        ? Number(val || 0)
        : val;
    });

    const res = await api('records/' + encodeURIComponent(selectedId), {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    // Pop-up notification confirming update
    showToast(`✓ Success: Record ${selectedId} has been successfully updated! (Total updates: ${res.customerUpdates}×)`);
    await loadState();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('alterBtn').addEventListener('click', async () => {
  try {
    const key = $('alterKey').value.trim();
    const value = $('alterValue').value.trim();
    const scope = $('alterScope').value;

    if (!key) throw new Error('Please enter a new attribute name.');

    const res = await api('alter', {
      method: 'POST',
      body: JSON.stringify({ key, value, scope, reqId: selectedId })
    });

    $('alterKey').value = '';
    $('alterValue').value = '';

    // Pop-up notification confirming attribute change / schema alteration
    showToast(`✓ Success: Attribute "${key}" has been successfully added and updated across submissions.json!`);
    await loadState();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('recordSelector').addEventListener('change', e => {
  renderEditorForm(e.target.value);
});

$('searchInput').addEventListener('input', renderFullTable);

async function loadState() {
  const data = await api('state');
  allRecords = data.records || [];
  feed = data.feed || [];
  updateStats = data.updateStats || { countsById: {}, list: [], totalUpdates: 0, mostUpdated: null };

  const schemaKeys = [...new Set(allRecords.flatMap(r => Object.keys(r)))];

  $('kpiTotalUpdates').textContent = updateStats.totalUpdates || 0;
  if (updateStats.mostUpdated) {
    $('kpiTopCustomer').textContent = updateStats.mostUpdated.customerName;
    $('kpiTopCount').textContent = `${updateStats.mostUpdated.updateCount} updates (${updateStats.mostUpdated.reqId})`;
  } else {
    $('kpiTopCustomer').textContent = 'None yet';
    $('kpiTopCount').textContent = '0 updates';
  }
  $('kpiEdited').textContent = Object.keys(updateStats.countsById || {}).length;
  $('kpiAttrs').textContent = schemaKeys.length;

  $('recordSelector').innerHTML = allRecords.map(r => {
    const cnt = updateStats.countsById?.[r.reqId] || 0;
    return `<option value="${esc(r.reqId)}">${esc(r.reqId)} · ${esc(r.customerName)} (${cnt}×)</option>`;
  }).join('');

  if (!selectedId || !allRecords.some(r => r.reqId === selectedId)) {
    selectedId = allRecords[0]?.reqId || '';
  }

  renderUpdateCountCards();
  renderEditorForm(selectedId);
  renderDiffCards();
  renderFullTable();
  $('syncStatus').textContent = 'Express.js Synced · ' + new Date().toLocaleTimeString();
}

loadState().catch(err => showToast(err.message, true));