const $ = id => document.getElementById(id);

let allRecords = [];
let editedPersons = [];
let feed = [];
let selectedId = '';

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
  if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
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
  $('editTitle').textContent = `Editing: ${rec.customerName} (${rec.reqId})`;

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
        <p style="margin:6px 0 0;">Edit any person in Experiment 2 (port 3002) or use the Edit / Alter panels above to see their changes appear here.</p>
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

function renderEditedTable() {
  const q = $('searchInput').value.trim().toLowerCase();
  const rows = editedPersons.filter(p => JSON.stringify(p).toLowerCase().includes(q));

  const baseKeys = [...new Set([
    'reqId', 'customerName', 'phone', 'eventType', 'diningZone',
    'mealCourse', 'dietaryPreference', 'guests', 'tableCount', 'seatsPerTable',
    'tableShape', 'roomWidth', 'roomHeight', 'status',
    ...allRecords.flatMap(r => Object.keys(r)),
    ...editedPersons.flatMap(r => Object.keys(r))
  ])].filter(k => !['updatedAt', '_lastAction', '_lastChangedAt'].includes(k));

  $('tableHead').innerHTML = `
    <tr>
      <th>Change Type</th>
      ${baseKeys.map(k => `<th>${esc(k)}</th>`).join('')}
      <th>Actions</th>
    </tr>
  `;

  if (!rows.length) {
    $('tableBody').innerHTML = `
      <tr>
        <td colspan="${baseKeys.length + 2}" style="text-align:center;padding:28px;color:var(--muted);">
          No edited persons found yet. Edit a reservation in Experiment 2 or use Alter/Edit above.
        </td>
      </tr>
    `;
    return;
  }

  $('tableBody').innerHTML = rows.map(p => {
    const isDeleted = p._lastAction === 'deleted';
    const badgeClass = p._lastAction === 'deleted' ? 'bad' : (p._lastAction === 'altered' ? 'warn' : 'ok');
    return `
      <tr>
        <td><span class="pill-status ${badgeClass}">${esc(p._lastAction || 'edited')}</span></td>
        ${baseKeys.map(k => `<td>${esc(p[k])}</td>`).join('')}
        <td style="display:flex;gap:6px;">
          ${isDeleted
            ? '<span style="color:var(--muted);font-size:11px;">Removed from JSON</span>'
            : `<button class="tiny-btn" data-edit="${esc(p.reqId)}">✎ Edit</button>
               <button class="tiny-btn del" data-del="${esc(p.reqId)}">✕ Delete</button>`
          }
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => {
      renderEditorForm(btn.dataset.edit);
      window.scrollTo({ top: document.querySelector('.workspace-grid').offsetTop - 90, behavior: 'smooth' });
    };
  });

  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => deletePerson(btn.dataset.del);
  });
}

async function deletePerson(id) {
  if (!confirm(`Delete ${id} from Experiment 2's submissions.json?`)) return;
  try {
    await api('records/' + encodeURIComponent(id), { method: 'DELETE' });
    showToast(`Deleted ${id} from submissions.json.`);
    await loadState();
  } catch (err) {
    showToast(err.message, true);
  }
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

    await api('records/' + encodeURIComponent(selectedId), {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast(`Saved edits to ${selectedId} in submissions.json!`);
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
    showToast(res.message);
    await loadState();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('deleteBtn').addEventListener('click', () => {
  if (selectedId) deletePerson(selectedId);
});

$('recordSelector').addEventListener('change', e => {
  renderEditorForm(e.target.value);
});

$('searchInput').addEventListener('input', renderEditedTable);

async function loadState() {
  const data = await api('state');
  allRecords = data.records || [];
  editedPersons = data.editedPersons || [];
  feed = data.feed || [];

  const schemaKeys = [...new Set(allRecords.flatMap(r => Object.keys(r)))];

  $('kpiEdited').textContent = editedPersons.length;
  $('kpiEvents').textContent = feed.length;
  $('kpiAttrs').textContent = schemaKeys.length;
  $('kpiTotalExp2').textContent = allRecords.length;

  $('recordSelector').innerHTML = allRecords.map(r =>
    `<option value="${esc(r.reqId)}">${esc(r.reqId)} · ${esc(r.customerName)}</option>`
  ).join('');

  if (!selectedId || !allRecords.some(r => r.reqId === selectedId)) {
    selectedId = allRecords[0]?.reqId || '';
  }

  renderEditorForm(selectedId);
  renderDiffCards();
  renderEditedTable();
  $('syncStatus').textContent = 'Linked to Exp 2 · ' + new Date().toLocaleTimeString();
}

loadState().catch(err => showToast(err.message, true));
