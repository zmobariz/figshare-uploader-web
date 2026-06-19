/* Bulk Uploader for Figshare v2 — frontend */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const M = window.FigMapping;
  const LS_SETTINGS = 'fig_settings_v2';
  const LS_TEMPLATES = 'fig_templates_v2';

  const state = {
    connected: false,
    workbook: null, rows: [], headers: [], fileName: '',
    operation: 'create', sync: 'create', mode: 'metadata', publish: 'false',
    reserveDoi: false, embargo: { enabled: false, date: '' }, concurrency: 2,
    fileMap: new Map(),
    mapping: { fields: {}, customFields: {}, defaults: { categories: [], license: null, defined_type: '', group_id: null } },
    lookups: null, existingByTitle: null, existingArticles: null,
    results: [], running: false, cancel: false, validated: false,
  };

  /* ---------------- persistence ---------------- */
  function saveSettings() {
    const s = { baseUrl: $('#baseUrl').value, operation: state.operation, sync: state.sync, mode: state.mode, publish: state.publish, reserveDoi: state.reserveDoi, concurrency: state.concurrency };
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); } catch (e) {}
  }
  function loadSettings() {
    let s; try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}'); } catch (e) { s = {}; }
    if (s.baseUrl) $('#baseUrl').value = s.baseUrl;
    if (s.operation) state.operation = s.operation;
    if (s.sync) state.sync = s.sync;
    if (s.mode) state.mode = s.mode;
    if (s.publish) state.publish = s.publish;
    if (s.reserveDoi) state.reserveDoi = s.reserveDoi;
    if (s.concurrency) state.concurrency = s.concurrency;
  }
  const getTemplates = () => { try { return JSON.parse(localStorage.getItem(LS_TEMPLATES) || '{}'); } catch (e) { return {}; } };
  const setTemplates = (t) => { try { localStorage.setItem(LS_TEMPLATES, JSON.stringify(t)); } catch (e) {} };

  /* ---------------- connection ---------------- */
  $('#toggleToken').addEventListener('click', () => { const t = $('#token'); t.type = t.type === 'password' ? 'text' : 'password'; });
  $('#baseUrl').addEventListener('change', saveSettings);
  $('#btnTest').addEventListener('click', testConnection);
  async function testConnection() {
    const token = $('#token').value.trim(), baseUrl = $('#baseUrl').value.trim(), status = $('#connStatus');
    if (!token) { status.className = 'inline-status err'; status.textContent = 'Enter a token first.'; return; }
    status.className = 'inline-status load'; status.innerHTML = '<span class="spin"></span> Checking...'; setChip('off', 'Checking...');
    try {
      const j = await postJSON('/api/test-token', { token, baseUrl });
      if (!j.ok) throw new Error(j.error);
      state.connected = true; status.className = 'inline-status ok'; status.textContent = `Connected as ${j.account.name}`;
      setChip('ok', j.account.name); state.existingByTitle = null; state.existingArticles = null; loadLookups(); refreshReadiness();
    } catch (e) { state.connected = false; status.className = 'inline-status err'; status.textContent = e.message; setChip('err', 'Connection failed'); }
  }
  function setChip(s, t) { $('#connChip').dataset.state = s; $('#connText').textContent = t; }

  async function loadLookups() {
    try {
      const j = await postJSON('/api/lookups', creds());
      if (!j.ok) return;
      state.lookups = j;
      fillDatalist('#catList', (j.categories || []).map((c) => `${c.id} — ${c.title}`));
      fillDatalist('#licList', (j.licenses || []).map((l) => `${l.value} — ${l.name}`));
      fillDatalist('#typeList', M.ITEM_TYPES);
    } catch (e) {}
  }
  function fillDatalist(sel, items) { const dl = $(sel); dl.innerHTML = ''; items.forEach((v) => dl.appendChild(new Option(v, v))); }

  /* ---------------- data file ---------------- */
  setupDropzone('#dzData', '#dataFile', '#pickData', (f) => loadWorkbook(f[0]));
  $('#clearData').addEventListener('click', () => {
    state.workbook = null; state.rows = []; state.headers = []; state.validated = false;
    $('#previewWrap').classList.add('hidden'); $('#sheetPickWrap').classList.add('hidden'); $('#preflightReport').innerHTML = '';
    $('#dataMeta').innerHTML = 'No file loaded yet'; renderMapping(); refreshReadiness();
  });
  $('#sheetPick').addEventListener('change', () => loadSheet($('#sheetPick').value));

  function loadWorkbook(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => {
      try {
        state.workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        state.fileName = file.name;
        const names = state.workbook.SheetNames;
        const sp = $('#sheetPick'); sp.innerHTML = ''; names.forEach((n) => sp.appendChild(new Option(n, n)));
        $('#sheetPickWrap').classList.toggle('hidden', names.length <= 1);
        loadSheet(names[0]);
      } catch (err) { $('#dataMeta').textContent = 'Could not read file: ' + err.message; }
    };
    r.readAsArrayBuffer(file);
  }
  function loadSheet(name) {
    const ws = state.workbook.Sheets[name];
    state.rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    state.headers = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || []).map((h) => String(h).trim()).filter(Boolean);
    state.validated = false; $('#preflightReport').innerHTML = '';
    $('#dataMeta').innerHTML = `<strong>${esc(state.fileName)}</strong> · sheet “${esc(name)}”`;
    renderPreview();
    state.mapping.fields = M.autoMatch(state.headers);
    populateCfColumns(); renderMapping(); refreshReadiness();
  }
  function renderPreview() {
    $('#previewWrap').classList.remove('hidden');
    $('#rowCount').textContent = `${state.rows.length} row${state.rows.length === 1 ? '' : 's'}`;
    $('#colCount').textContent = `${state.headers.length} columns`;
    const t = $('#previewTable'); t.innerHTML = '';
    const thead = el('thead'), htr = el('tr');
    state.headers.forEach((h) => htr.appendChild(el('th', null, esc(h)))); thead.appendChild(htr); t.appendChild(thead);
    const tb = el('tbody');
    state.rows.slice(0, 8).forEach((row) => { const tr = el('tr'); state.headers.forEach((h) => tr.appendChild(el('td', 'trunc', esc(row[h] == null ? '' : row[h])))); tb.appendChild(tr); });
    t.appendChild(tb);
  }

  /* ---------------- operation & options ---------------- */
  $('#operation').addEventListener('change', () => { state.operation = $('#operation').value; applyOperationUI(); saveSettings(); state.validated = false; refreshReadiness(); });
  $('#sync').addEventListener('change', () => { state.sync = $('#sync').value; saveSettings(); state.validated = false; refreshReadiness(); });
  setupSegmented('#segMode', (v) => { state.mode = v; $('#card-files').classList.toggle('hidden', v !== 'files' && state.operation !== 'addfiles'); saveSettings(); state.validated = false; refreshReadiness(); });
  setupSegmented('#segPublish', (v) => { state.publish = v; $('#publishWarn').style.visibility = v === 'true' ? 'visible' : 'hidden'; saveSettings(); state.validated = false; refreshReadiness(); });
  $('#optReserveDoi').addEventListener('change', () => { state.reserveDoi = $('#optReserveDoi').checked; saveSettings(); });
  $('#optEmbargo').addEventListener('change', () => { state.embargo.enabled = $('#optEmbargo').checked; $('#embargoDate').classList.toggle('hidden', !state.embargo.enabled); });
  $('#embargoDate').addEventListener('change', () => { state.embargo.date = $('#embargoDate').value; });
  $('#concurrency').addEventListener('change', () => { state.concurrency = parseInt($('#concurrency').value, 10); saveSettings(); });
  $('#deleteConfirm').addEventListener('change', refreshReadiness);

  function applyOperationUI() {
    const op = state.operation;
    const showSync = op === 'create';
    const showModePublish = op === 'create' || op === 'update';
    $('#syncField').style.visibility = showSync ? 'visible' : 'hidden';
    $('#modePublishRow').classList.toggle('hidden', !(showModePublish || op === 'addfiles'));
    $('#card-files').classList.toggle('hidden', !((state.mode === 'files' && showModePublish) || op === 'addfiles'));
    $('#deleteGuard').classList.toggle('hidden', op !== 'delete');
    const hints = {
      create: 'Each row creates a new article.',
      update: 'Each row updates an existing article (by Article ID column, or matched on Title).',
      addfiles: 'Attach files to existing articles (needs Article ID or Title match).',
      publish: 'Publish existing draft articles (needs Article ID or Title match).',
      delete: 'Permanently delete draft articles (needs Article ID or Title match).',
    };
    $('#opHint').textContent = hints[op] || '';
  }

  $('#catAdd').addEventListener('click', () => {
    const id = parseLeadingId($('#catPick').value);
    if (id != null && !state.mapping.defaults.categories.includes(id)) state.mapping.defaults.categories.push(id);
    $('#catPick').value = ''; renderCatChips(); updateJson();
  });
  function renderCatChips() {
    const box = $('#catChips'); box.innerHTML = '';
    state.mapping.defaults.categories.forEach((id) => {
      const found = (state.lookups && (state.lookups.categories || []).find((c) => c.id === id)) || null;
      const chip = el('span', 'chip', `${id}${found ? ' · ' + esc(found.title) : ''}`);
      const x = el('button', 'linklike', ' ✕'); x.onclick = () => { state.mapping.defaults.categories = state.mapping.defaults.categories.filter((c) => c !== id); renderCatChips(); updateJson(); };
      chip.appendChild(x); box.appendChild(chip);
    });
  }
  $('#licPick').addEventListener('change', () => { state.mapping.defaults.license = parseLeadingId($('#licPick').value); updateJson(); });
  $('#typePick').addEventListener('change', () => { state.mapping.defaults.defined_type = $('#typePick').value.trim(); updateJson(); });
  $('#groupPick').addEventListener('change', () => { const n = parseInt($('#groupPick').value, 10); state.mapping.defaults.group_id = isNaN(n) ? null : n; updateJson(); });

  /* ---------------- attachments ---------------- */
  setupDropzone('#dzFiles', '#attachFiles', '#pickFiles', (files) => {
    [...files].forEach((f) => state.fileMap.set(M.baseName(f.name).toLowerCase(), f)); renderChips(); state.validated = false; refreshReadiness();
  });
  function renderChips() {
    const box = $('#fileChips'); box.innerHTML = '';
    $('#filesMeta').textContent = state.fileMap.size ? `${state.fileMap.size} file(s) ready` : 'No files added yet';
    [...state.fileMap.values()].forEach((f) => {
      const chip = el('span', 'chip', `📎 ${esc(f.name)} <span class="sz">${fmtSize(f.size)}</span>`);
      const x = el('button', 'linklike', ' ✕'); x.onclick = () => { state.fileMap.delete(M.baseName(f.name).toLowerCase()); renderChips(); };
      chip.appendChild(x); box.appendChild(chip);
    });
  }

  /* ---------------- mapping ---------------- */
  $('#btnAutoMap').addEventListener('click', () => { state.mapping.fields = M.autoMatch(state.headers); renderMapping(); });
  function renderMapping() {
    const grid = $('#mapGrid');
    if (!state.headers.length) { grid.innerHTML = '<p class="muted small">Load a spreadsheet first to choose columns.</p>'; updateJson(); return; }
    grid.innerHTML = '';
    M.FIG_FIELDS.forEach((f) => {
      const cur = state.mapping.fields[f.key];
      const curCol = typeof cur === 'string' ? cur : (cur && cur.column) || '';
      const curSep = typeof cur === 'object' && cur ? (cur.separator || ';') : ';';
      const isList = f.type === 'list' || f.type === 'intlist' || f.type === 'authors';
      const row = el('div', 'map-row');
      const tip = f.meta === false ? 'no metadata' : (isList ? 'list' : '');
      row.appendChild(el('div', 'map-label', `${esc(f.label)}${f.key === 'title' ? ' <span class="req">*</span>' : ''}${tip ? ` <span class="tip">${tip}</span>` : ''}`));
      const sel = el('select'); sel.appendChild(new Option('— not mapped —', ''));
      state.headers.forEach((h) => { const o = new Option(h, h); if (curCol === h) o.selected = true; sel.appendChild(o); });
      sel.onchange = () => {
        const v = sel.value;
        if (!v) delete state.mapping.fields[f.key];
        else state.mapping.fields[f.key] = isList ? { column: v, separator: (state.mapping.fields[f.key] && state.mapping.fields[f.key].separator) || ';' } : v;
        state.validated = false; updateJson(); refreshReadiness();
      };
      row.appendChild(sel);
      if (isList) {
        const sw = el('div', 'sep-input'); const si = el('input'); si.type = 'text'; si.value = curSep; si.maxLength = 3; si.title = 'separator';
        si.oninput = () => { const m = state.mapping.fields[f.key]; if (m && typeof m === 'object') { m.separator = si.value || ';'; updateJson(); } };
        sw.appendChild(el('span', null, 'split on')); sw.appendChild(si); row.appendChild(sw);
      } else row.appendChild(el('div'));
      grid.appendChild(row);
    });
    updateJson();
  }

  function populateCfColumns() { const sel = $('#cfColumn'); sel.innerHTML = '<option value="">— column —</option>'; state.headers.forEach((h) => sel.appendChild(new Option(h, h))); }
  $('#cfAdd').addEventListener('click', () => {
    const name = $('#cfName').value.trim(), col = $('#cfColumn').value, list = $('#cfList').checked;
    if (!name || !col) return;
    state.mapping.customFields[name] = { column: col, separator: ';', list };
    $('#cfName').value = ''; $('#cfColumn').value = ''; $('#cfList').checked = false; renderCfRows(); updateJson();
  });
  function renderCfRows() {
    const box = $('#cfRows'); box.innerHTML = '';
    Object.keys(state.mapping.customFields).forEach((name) => {
      const m = state.mapping.customFields[name];
      const chip = el('div', 'cf-chip', `<span class="cf-key">${esc(name)}</span> <span class="cf-arrow">←</span> ${esc(m.column)}${m.list ? ' <span class="tip">(list)</span>' : ''}`);
      const x = el('button', 'ghost small', 'Remove'); x.onclick = () => { delete state.mapping.customFields[name]; renderCfRows(); updateJson(); };
      chip.appendChild(x); box.appendChild(chip);
    });
  }

  $('#btnExportMap').addEventListener('click', () => downloadFile('figshare-mapping.json', JSON.stringify(exportMapping(), null, 2), 'application/json'));
  function exportMapping() { return { version: 2, mapping: { fields: state.mapping.fields, customFields: state.mapping.customFields, defaults: state.mapping.defaults }, options: { operation: state.operation, sync: state.sync, mode: state.mode, publish: state.publish === 'true', reserveDoi: state.reserveDoi, concurrency: state.concurrency } }; }
  $('#btnImportMap').addEventListener('click', () => $('#mapFile').click());
  $('#mapFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = () => { try { applyMapping(JSON.parse(r.result)); } catch (err) { alert('Could not read mapping JSON: ' + err.message); } }; r.readAsText(file); e.target.value = '';
  });
  function applyMapping(parsed) {
    const map = parsed.mapping || parsed;
    state.mapping.fields = map.fields || {};
    state.mapping.customFields = map.customFields || {};
    state.mapping.defaults = Object.assign({ categories: [], license: null, defined_type: '', group_id: null }, map.defaults || {});
    if (parsed.options && parsed.options.operation) { state.operation = parsed.options.operation; $('#operation').value = state.operation; }
    syncDefaultsUI(); renderMapping(); renderCfRows(); renderCatChips(); applyOperationUI(); state.validated = false; refreshReadiness();
  }
  function syncDefaultsUI() {
    $('#licPick').value = state.mapping.defaults.license != null ? String(state.mapping.defaults.license) : '';
    $('#typePick').value = state.mapping.defaults.defined_type || '';
    $('#groupPick').value = state.mapping.defaults.group_id != null ? String(state.mapping.defaults.group_id) : '';
  }
  function refreshTemplateSelect() { const sel = $('#templateSelect'); const t = getTemplates(); sel.innerHTML = '<option value="">Templates...</option>'; Object.keys(t).forEach((n) => sel.appendChild(new Option(n, n))); }
  $('#btnSaveTpl').addEventListener('click', () => { const name = prompt('Save mapping template as:'); if (!name) return; const t = getTemplates(); t[name] = exportMapping(); setTemplates(t); refreshTemplateSelect(); $('#templateSelect').value = name; });
  $('#templateSelect').addEventListener('change', () => { const n = $('#templateSelect').value; if (!n) return; const t = getTemplates(); if (t[n]) applyMapping(t[n]); });
  $('#btnDelTpl').addEventListener('click', () => { const n = $('#templateSelect').value; if (!n) return; const t = getTemplates(); delete t[n]; setTemplates(t); refreshTemplateSelect(); });

  $('#btnToggleJson').addEventListener('click', () => { const p = $('#jsonPreview'); p.classList.toggle('hidden'); $('#btnToggleJson').textContent = p.classList.contains('hidden') ? 'View JSON' : 'Hide JSON'; updateJson(); });
  function updateJson() { $('#jsonPreview').textContent = JSON.stringify(exportMapping().mapping, null, 2); }
  $('#btnPreview').addEventListener('click', () => {
    let box = $('#previewBox'); if (box) { box.remove(); $('#btnPreview').textContent = 'Preview payloads'; return; }
    box = el('div', 'preview-box'); box.id = 'previewBox';
    const built = state.rows.slice(0, 5).map((r) => M.buildRow(r, state.mapping, { lookups: state.lookups }));
    if (!built.length) box.innerHTML = '<p class="muted small">No rows to preview.</p>';
    built.forEach((b, i) => {
      const d = el('div', 'pv-row');
      d.appendChild(el('div', 'pv-head', `Row ${i + 1} → ${esc(state.operation)}${b.articleId ? ' (id ' + esc(b.articleId) + ')' : ''}${b.fileNames.length ? ' · files: ' + esc(b.fileNames.join(', ')) : ''}`));
      d.appendChild(el('pre', null, esc(JSON.stringify(b.meta, null, 2))));
      box.appendChild(d);
    });
    $('#jsonPreview').before(box); $('#btnPreview').textContent = 'Hide preview';
  });

  /* ---------------- pre-flight check ---------------- */
  $('#btnValidate').addEventListener('click', preflight);
  function needsId() { return ['update', 'addfiles', 'publish', 'delete'].includes(state.operation); }
  function hasTitleMap() { return !!state.mapping.fields.title; }
  function hasIdMap() { return !!state.mapping.fields.articleId; }

  async function ensureExisting(force) {
    if (state.existingByTitle && !force) return;
    const need = force || (state.operation === 'create' && state.sync !== 'create') || (needsId() && !hasIdMap());
    if (!need) { state.existingByTitle = new Map(); state.existingArticles = []; return; }
    const j = await postJSON('/api/list-articles', creds());
    const arr = (j.ok && j.articles) ? j.articles : [];
    const map = new Map();
    arr.forEach((a) => { if (a.title) map.set(String(a.title).trim().toLowerCase(), String(a.id)); });
    state.existingArticles = arr; state.existingByTitle = map;
  }

  async function preflight() {
    const msg = $('#validateMsg'), report = $('#preflightReport');
    msg.innerHTML = ''; report.innerHTML = '';
    const pre = [];
    if (!state.connected) pre.push('Not connected — test your token in step 1.');
    if (!state.rows.length) pre.push('No spreadsheet rows loaded.');
    if (state.operation === 'create' && !hasTitleMap()) pre.push('Map the <b>Title</b> field for create.');
    if (needsId() && !hasIdMap() && !hasTitleMap()) pre.push('Map an <b>Article ID</b> column or <b>Title</b> for this operation.');
    if (state.operation === 'delete' && !$('#deleteConfirm').checked) pre.push('Tick the delete confirmation box.');
    if (pre.length) { msg.innerHTML = `<div class="block err"><b>Fix first:</b><ul>${pre.map((e) => '<li>' + e + '</li>').join('')}</ul></div>`; state.validated = false; refreshReadiness(); return; }

    msg.innerHTML = '<span class="inline-status load"><span class="spin"></span> Running pre-flight checks (reading your existing articles)...</span>';
    try {
      if (!state.lookups) await loadLookups();
      await ensureExisting(true);
    } catch (e) { msg.innerHTML = `<div class="block err">Could not load Figshare data: ${esc(e.message)}</div>`; state.validated = false; refreshReadiness(); return; }
    msg.innerHTML = '';

    const ctx = { operation: state.operation, sync: state.sync, mode: state.mode, publish: state.publish === 'true', lookups: state.lookups, existing: state.existingArticles || [], fileSet: new Set([...state.fileMap.keys()]) };
    const rep = M.preflight(state.rows, state.mapping, ctx);
    state.validated = !rep.blocking && (state.operation !== 'delete' || $('#deleteConfirm').checked);
    renderPreflight(rep);
    refreshReadiness();
  }

  function renderPreflight(rep) {
    const c = rep.counts, box = $('#preflightReport');
    const tiles = [['Total', c.total, ''], ['Ready', c.ok, 't-ok'], ['Duplicates', c.dup, 't-dup'], ['Warnings', c.warn, 't-warn'], ['Errors', c.error, 't-err']];
    let html = '<div class="pf-tiles">' + tiles.map((a) => `<div class="pf-tile ${a[2]}"><div class="pf-n">${a[1]}</div><div class="pf-l">${a[0]}</div></div>`).join('') + '</div>';
    const seg = (n, cl) => n > 0 ? `<span class="${cl}" style="width:${(n / c.total * 100).toFixed(2)}%"></span>` : '';
    html += `<div class="pf-bar">${seg(c.ok, 'b-ok')}${seg(c.dup, 'b-dup')}${seg(c.warn, 'b-warn')}${seg(c.error, 'b-err')}</div>`;
    html += '<div class="pf-legend"><span><i class="d-ok"></i>Ready</span><span><i class="d-dup"></i>Duplicate</span><span><i class="d-warn"></i>Warning</span><span><i class="d-err"></i>Error</span></div>';
    html += rep.blocking
      ? `<div class="block err" style="margin-top:12px"><b>${c.error} row(s) blocked.</b> Fix the errors below — Start stays disabled until they're resolved.</div>`
      : `<div class="block ok" style="margin-top:12px"><b>Cleared for upload.</b>${c.dup ? ` ${c.dup} duplicate(s) flagged — review below.` : ''}${c.warn ? ` ${c.warn} warning(s).` : ''}</div>`;
    const issues = rep.rows.filter((r) => r.bucket !== 'ok');
    if (!issues.length) html += '<p class="muted small" style="margin-top:10px">All rows look good.</p>';
    else {
      html += '<div class="table-scroll" style="margin-top:12px"><table class="pf-table"><thead><tr><th>#</th><th>Title</th><th>Status</th><th>Issues</th></tr></thead><tbody>';
      issues.forEach((r) => {
        const label = r.bucket === 'dup' ? 'Duplicate' : r.bucket === 'error' ? 'Error' : 'Warning';
        let link = '';
        if (r.dupOf && String(r.dupOf).indexOf('fig:') === 0) { const id = String(r.dupOf).slice(4); link = ` <a class="res-link" href="https://figshare.com/account/articles/${id}" target="_blank" rel="noopener">view existing</a>`; }
        html += `<tr><td>${r.row}</td><td class="trunc">${esc(r.title || '(no title)')}</td><td><span class="status-pill ${r.bucket}">${label}</span></td><td>${esc(r.issues.join(' · '))}${link}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
    box.innerHTML = html;
  }

  function refreshReadiness() {
    const ready = state.connected && state.rows.length && state.validated && !state.running && (state.operation !== 'delete' || $('#deleteConfirm').checked);
    $('#btnRun').disabled = !ready;
  }

  /* ---------------- run ---------------- */
  $('#btnRun').addEventListener('click', () => state.running ? stopRun() : startRun(allIndices()));
  $('#btnRetry').addEventListener('click', () => { const idx = state.results.map((r, i) => (r && r.status === 'error') ? i : -1).filter((i) => i >= 0); if (idx.length) startRun(idx); });
  function stopRun() { state.cancel = true; $('#btnRun').textContent = 'Stopping...'; }
  const allIndices = () => state.rows.map((_, i) => i);

  async function startRun(indices) {
    state.running = true; state.cancel = false;
    $('#btnRun').textContent = 'Stop'; $('#btnRun').disabled = false;
    $('#btnValidate').disabled = true; $('#btnRetry').disabled = true;
    $('#progressWrap').classList.remove('hidden');

    await ensureExisting();
    ensureResultsTable();
    if (!state.results.length) state.results = new Array(state.rows.length).fill(null);
    indices.forEach((i) => markRow(i, 'running', '<span class="spin"></span> Working...'));

    const total = indices.length;
    await pool(indices, state.concurrency, async (i) => {
      if (state.cancel) { markRow(i, 'error', 'Cancelled'); state.results[i] = { row: i + 1, status: 'error', error: 'cancelled' }; return; }
      await processRow(i);
      updateProgress(total);
    });

    state.running = false; $('#btnRun').textContent = 'Start'; $('#btnValidate').disabled = false;
    const anyErr = state.results.some((r) => r && r.status === 'error');
    $('#btnRetry').disabled = !anyErr;
    $('#btnExportResults').disabled = false; $('#btnWriteback').disabled = false;
    refreshReadiness();
  }

  async function processRow(i) {
    const row = state.rows[i];
    const b = M.buildRow(row, state.mapping, { lookups: state.lookups });
    let op = state.operation, articleId = b.articleId || null;
    const title = b.meta.title ? String(b.meta.title).trim().toLowerCase() : null;

    if (op === 'create' && state.sync !== 'create' && title && state.existingByTitle.has(title)) {
      const ex = state.existingByTitle.get(title);
      if (state.sync === 'skip') { markRow(i, 'skip', `Skipped — exists (ID ${ex})`); state.results[i] = { row: i + 1, title: b.meta.title, status: 'skipped', articleId: ex }; return; }
      if (state.sync === 'update') { op = 'update'; articleId = ex; }
    } else if (needsId() && !articleId && title) {
      articleId = state.existingByTitle.get(title) || null;
    }

    const fd = new FormData();
    Object.entries(creds()).forEach(([k, v]) => fd.append(k, v));
    fd.append('operation', op); fd.append('mode', state.mode); fd.append('publish', state.publish);
    fd.append('reserveDoi', String(state.reserveDoi));
    if (state.embargo.enabled && state.embargo.date) fd.append('embargo', JSON.stringify({ enabled: true, date: state.embargo.date, type: 'article' }));
    fd.append('metadata', JSON.stringify(b.meta));
    if (articleId) fd.append('articleId', articleId);
    if (state.mode === 'files' || op === 'addfiles') b.fileNames.forEach((n) => { const f = state.fileMap.get(M.baseName(n).toLowerCase()); if (f) fd.append('files', f, f.name); });

    try {
      const res = await fetch('/api/process', { method: 'POST', body: fd });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Failed');
      const url = j.publishedUrl || j.privateUrl;
      const linkLabel = j.published ? 'View published' : (j.action === 'deleted' ? 'Deleted' : 'View');
      let extra = j.uploaded && j.uploaded.length ? ` · ${j.uploaded.length} file(s)` : '';
      if (j.doi) extra += ` · DOI ${j.doi}`;
      if (j.warnings && j.warnings.length) extra += ` · ⚠ ${j.warnings.join('; ')}`;
      const resultHtml = j.action === 'deleted' ? `Deleted (ID ${j.articleId})` : `<a class="res-link" href="${url}" target="_blank" rel="noopener">${linkLabel}</a> (ID ${j.articleId})${extra}`;
      markRow(i, 'done', resultHtml, j.action);
      state.results[i] = { row: i + 1, title: b.meta.title || '', status: j.action, articleId: j.articleId || '', doi: j.doi || '', url, files: (j.uploaded || []).length, warnings: (j.warnings || []).join('; ') };
    } catch (e) {
      markRow(i, 'error', esc(e.message));
      state.results[i] = { row: i + 1, title: b.meta.title || '', status: 'error', error: e.message };
    }
  }

  function ensureResultsTable() {
    let t = $('#resTable');
    if (t && t.tBodies[0] && t.tBodies[0].rows.length === state.rows.length) return;
    const wrap = $('#resultsWrap'); wrap.innerHTML = '';
    t = el('table'); t.id = 'resTable';
    t.innerHTML = '<thead><tr><th>#</th><th>Title</th><th>Status</th><th>Result</th></tr></thead>';
    const tb = el('tbody');
    state.rows.forEach((row, i) => {
      const b = M.buildRow(row, state.mapping, { lookups: state.lookups });
      const tr = el('tr'); tr.id = `res-${i}`;
      tr.innerHTML = `<td>${i + 1}</td><td class="trunc">${esc(b.meta.title || b.articleId || '(row ' + (i + 1) + ')')}</td><td><span class="status-pill pending">Pending</span></td><td class="res-cell">—</td>`;
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
  }
  function markRow(i, status, resultHtml, action) {
    const tr = $(`#res-${i}`); if (!tr) return;
    const labels = { pending: 'Pending', running: 'Working', done: action ? action[0].toUpperCase() + action.slice(1) : 'Done', error: 'Failed', skip: 'Skipped' };
    const cls = status === 'skip' ? 'pending' : status;
    tr.querySelector('td:nth-child(3)').innerHTML = `<span class="status-pill ${cls}">${labels[status]}</span>`;
    if (resultHtml != null) tr.querySelector('.res-cell').innerHTML = resultHtml;
  }
  function updateProgress(total) {
    const processed = state.results.filter((r) => r).length;
    const done = state.results.filter((r) => r && r.status !== 'error' && r.status !== 'skipped').length;
    const err = state.results.filter((r) => r && r.status === 'error').length;
    const skip = state.results.filter((r) => r && r.status === 'skipped').length;
    $('#progressBar').style.width = Math.round((processed / state.rows.length) * 100) + '%';
    $('#progressStats').innerHTML = `<span class="s-done">✔ ${done} ok</span><span class="s-err">✘ ${err} failed</span><span class="s-pending">◷ ${skip} skipped</span>`;
  }

  $('#btnExportResults').addEventListener('click', () => {
    const head = ['row', 'title', 'status', 'articleId', 'doi', 'url', 'files', 'error', 'warnings'];
    const lines = [head.join(',')].concat(state.results.filter(Boolean).map((r) => head.map((h) => csv(r[h] == null ? '' : r[h])).join(',')));
    downloadFile('figshare-results.csv', lines.join('\n'), 'text/csv');
  });
  $('#btnWriteback').addEventListener('click', () => {
    const out = state.rows.map((row, i) => {
      const r = state.results[i] || {};
      return Object.assign({}, row, { _status: r.status || '', _article_id: r.articleId || '', _doi: r.doi || '', _url: r.url || '', _error: r.error || '' });
    });
    const ws = XLSX.utils.json_to_sheet(out); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results'); XLSX.writeFile(wb, 'figshare-upload-results.xlsx');
  });

  /* ---------------- helpers ---------------- */
  function creds() { return { token: $('#token').value.trim(), baseUrl: $('#baseUrl').value.trim() }; }
  async function postJSON(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); }
  async function pool(items, n, worker) { let i = 0; const run = async () => { while (i < items.length) { if (state.cancel) return; await worker(items[i++]); } }; await Promise.all(Array.from({ length: Math.max(1, n) }, run)); }
  function parseLeadingId(v) { const m = String(v).match(/^\s*(\d+)/); return m ? parseInt(m[1], 10) : null; }
  function setupSegmented(sel, onChange) { const seg = $(sel); seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { seg.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); onChange(b.dataset.val); })); }
  function setupDropzone(dzSel, inputSel, pickSel, onFiles) {
    const dz = $(dzSel), input = $(inputSel);
    $(pickSel).addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files.length) onFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
  }
  function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'; return (b / 1073741824).toFixed(2) + ' GB'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function csv(s) { const v = String(s).replace(/"/g, '""'); return /[",\n]/.test(v) ? `"${v}"` : v; }
  function downloadFile(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

  /* ---------------- init ---------------- */
  loadSettings();
  $('#operation').value = state.operation;
  $('#sync').value = state.sync;
  $('#concurrency').value = String(state.concurrency);
  $('#optReserveDoi').checked = state.reserveDoi;
  document.querySelectorAll('#segMode button').forEach((b) => b.classList.toggle('active', b.dataset.val === state.mode));
  document.querySelectorAll('#segPublish button').forEach((b) => b.classList.toggle('active', b.dataset.val === state.publish));
  $('#publishWarn').style.visibility = state.publish === 'true' ? 'visible' : 'hidden';
  applyOperationUI(); refreshTemplateSelect(); renderMapping();

  /* ---------------- version + update notifications ---------------- */
  const UB = { banner: $('#updateBanner'), text: $('#ubText'), download: $('#ubDownload'), restart: $('#ubRestart'), close: $('#ubClose') };
  let _updateDismissed = false;
  if (UB.close) UB.close.addEventListener('click', () => { _updateDismissed = true; UB.banner.classList.add('hidden'); });
  if (UB.restart) UB.restart.addEventListener('click', () => { if (window.desktopUpdater) window.desktopUpdater.restart(); });
  const _btnCheck = $('#btnCheckUpdates');
  if (_btnCheck) _btnCheck.addEventListener('click', (e) => { e.preventDefault(); _updateDismissed = false; manualCheck(); });

  function showBanner(msg, opts) {
    opts = opts || {};
    if (_updateDismissed || !UB.banner) return;
    UB.text.textContent = msg;
    UB.download.classList.toggle('hidden', !opts.showDownload);
    UB.restart.classList.toggle('hidden', !opts.showRestart);
    if (opts.url) UB.download.href = opts.url;
    UB.banner.classList.remove('hidden');
  }
  function hideBanner() { if (UB.banner) UB.banner.classList.add('hidden'); }

  async function fetchVersion(force) {
    try { const r = await fetch('/api/version' + (force ? '?force=1' : '')); return await r.json(); }
    catch (e) { return null; }
  }
  function setAboutVersion(v) { const a = $('#aboutVersion'); if (a && v && v.current) a.textContent = 'v' + v.current; }
  function flashUpToDate() {
    const a = $('#aboutVersion'); if (!a) return;
    const old = a.textContent; a.textContent = old + ' · up to date'; setTimeout(() => { a.textContent = old; }, 2500);
  }

  async function webUpdateCheck(force) {
    const v = await fetchVersion(force);
    setAboutVersion(v);
    if (v && v.updateAvailable) showBanner('A new version (v' + v.latest + ') is available — you have v' + v.current + '.', { showDownload: true, url: v.url });
    else if (force) flashUpToDate();
    return v;
  }
  async function manualCheck() {
    if (window.desktopUpdater) window.desktopUpdater.check();
    await webUpdateCheck(true);
  }

  function initVersionAndUpdates() {
    fetchVersion(false).then((v) => {
      setAboutVersion(v);
      if (window.desktopUpdater) {
        // Desktop build: native auto-updater drives the banner; fall back to the
        // web download banner if it errors (unsigned macOS / portable .exe).
        window.desktopUpdater.onState((st) => {
          if (!st || _updateDismissed) return;
          const ver = (st.info && st.info.version) || '';
          if (st.state === 'available') showBanner('Downloading update v' + ver + '…', {});
          else if (st.state === 'downloading') showBanner('Downloading update… ' + Math.round((st.info && st.info.percent) || 0) + '%', {});
          else if (st.state === 'downloaded') showBanner('Update v' + ver + ' is ready to install.', { showRestart: true });
          else if (st.state === 'error') { if (v && v.updateAvailable) showBanner('A new version (v' + v.latest + ') is available.', { showDownload: true, url: v.url }); }
          else if (st.state === 'none') hideBanner();
        });
        window.desktopUpdater.check();
      } else if (v && v.updateAvailable) {
        showBanner('A new version (v' + v.latest + ') is available — you have v' + v.current + '.', { showDownload: true, url: v.url });
      }
    });
  }
  initVersionAndUpdates();
})();
