// Data Import Wizard: choose object + action, upload CSV, map fields, review, import, results.
import { h, icon, fmt, mount, clear, spinner, toast, badge, emptyState, objIcon, parseCsv } from '../lib.js';
import { POST, can, state } from '../api.js';
import { setupHeader } from './index.js';
import { select, dataTable, downloadCsv } from './admin-common.js';

const MAX_ROWS = 5000;
const COMPUTED = new Set(['Formula', 'Rollup', 'AutoNumber', 'Id']);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const MODES = [
  ['insert', 'Add new records', 'Create a new record for every row in the file.', 'plus'],
  ['update', 'Update existing records', 'Match rows to existing records and update them. Unmatched rows are reported as errors.', 'edit'],
  ['upsert', 'Add new and update existing records', 'Update rows that match an existing record; create the rest.', 'refresh'],
];

export default async function render(container, { app, query }) {
  app.setTitle('Data Import Wizard');
  const header = setupHeader('Data Import Wizard', { crumb: 'Setup › Data', iconName: 'upload', description: 'Import up to 5,000 records at a time from a CSV file. Validation rules, required fields and automation run for every record.' });
  if (!(can('ImportData') || can('ModifyAllData'))) {
    mount(container, header, h('div', { class: 'card p-24' }, emptyState('Insufficient privileges', 'You need the "Import Data" permission to use the Data Import Wizard.', { iconName: 'lock' })));
    return;
  }

  const objects = [...state.objects.values()].filter((o) => o.perms?.create || o.perms?.edit).sort((a, b) => a.label.localeCompare(b.label));
  const st = { step: 1, object: query?.object && objects.some((o) => o.apiName === query.object) ? query.object : null, mode: 'insert', fileName: '', headers: [], rows: [], mapping: [], matchField: 'Id', result: null, running: false };
  const stepper = h('div', { class: 'sa-stepper' });
  const body = h('div');
  const footer = h('div', { class: 'sa-wizard-footer' });

  const obj = () => state.objects.get(st.object);
  const mappable = () => (obj()?.fields || []).filter((f) => f.apiName === 'Id'
    || (!COMPUTED.has(f.type) && !f.readOnly && (!f.system || ['Name', 'OwnerId'].includes(f.apiName)) && f.access?.edit !== false));
  const matchOptions = () => [['Id', 'Record ID'], ...(obj()?.fields || []).filter((f) => f.apiName === 'Name' ? !f.readOnly : (f.externalId || f.unique)).map((f) => [f.apiName, `${f.label}${f.externalId ? ' (External ID)' : f.unique ? ' (Unique)' : ''}`])];

  function autoMap() {
    const fields = mappable();
    const used = new Set();
    st.mapping = st.headers.map((hd) => {
      const n = norm(hd);
      const f = fields.find((x) => !used.has(x.apiName) && norm(x.apiName) === n) || fields.find((x) => !used.has(x.apiName) && norm(x.label) === n)
        || fields.find((x) => !used.has(x.apiName) && n && (norm(x.apiName).replace(/c$/, '') === n || norm(x.label).replace(/id$/, '') === n));
      if (f && (f.apiName !== 'Id' || st.mode !== 'insert')) { used.add(f.apiName); return f.apiName; }
      return '';
    });
  }

  function loadText(text, name) {
    const parsed = parseCsv(text.replace(/^﻿/, ''));
    if (parsed.length < 2) { toast('The file needs a header row and at least one data row.', 'error'); return false; }
    const headers = parsed[0].map((x) => x.trim());
    if (headers.some((x) => !x)) { toast('Every column needs a header.', 'error'); return false; }
    const rows = parsed.slice(1);
    if (rows.length > MAX_ROWS) { toast(`The file has ${fmt.number(rows.length)} rows. The limit is ${fmt.number(MAX_ROWS)} per import.`, 'error'); return false; }
    st.headers = headers; st.rows = rows; st.fileName = name;
    autoMap();
    return true;
  }

  function buildRows() {
    return st.rows.map((r) => {
      const out = {};
      st.mapping.forEach((field, i) => {
        if (!field) return;
        const val = (r[i] ?? '').trim();
        if (val === '') return;
        out[field] = val;
      });
      return out;
    });
  }

  const canNext = () => {
    if (st.step === 1) return !!st.object;
    if (st.step === 2) return st.rows.length > 0;
    if (st.step === 3) {
      const mapped = st.mapping.filter(Boolean);
      if (!mapped.length) return false;
      if (new Set(mapped).size !== mapped.length) return false;
      if (st.mode !== 'insert' && !mapped.includes(st.matchField)) return false;
      return true;
    }
    return false;
  };

  function drawStepper() {
    const steps = ['Choose data', 'Upload file', 'Map fields', 'Review & import'];
    mount(stepper, steps.map((s, i) => {
      const n = i + 1;
      return h('div', { class: ['sa-stepper-item', n === st.step && 'current', (n < st.step || st.result) && 'done'] },
        h('span', { class: 'sa-stepper-num' }, n < st.step || st.result ? icon('check') : String(n)), h('span', s));
    }));
  }

  function drawFooter() {
    clear(footer);
    if (st.result) {
      footer.append(h('button', { class: 'btn', onClick: reset }, icon('refresh'), 'Start a New Import'), h('div', { class: 'spacer' }),
        h('a', { class: 'btn btn-brand', href: `#/o/${st.object}` }, `View ${obj()?.pluralLabel || st.object}`));
      return;
    }
    if (st.step > 1) footer.append(h('button', { class: 'btn', disabled: st.running, onClick: () => { st.step--; draw(); } }, icon('chevronLeft'), 'Back'));
    footer.append(h('div', { class: 'spacer' }));
    if (st.step < 4) footer.append(h('button', { class: 'btn btn-brand', disabled: !canNext(), onClick: () => { st.step++; draw(); } }, 'Next', icon('chevronRight')));
    else footer.append(h('button', { class: 'btn btn-brand', disabled: st.running, onClick: start }, st.running ? 'Importing…' : 'Start Import'));
  }

  function reset() {
    Object.assign(st, { step: 1, fileName: '', headers: [], rows: [], mapping: [], result: null, running: false });
    draw();
  }

  // ----- steps -----
  function step1() {
    let term = '';
    const grid = h('div', { class: 'sa-obj-grid', role: 'radiogroup', 'aria-label': 'Object' });
    const drawGrid = () => mount(grid, objects.filter((o) => !term || o.label.toLowerCase().includes(term)).map((o) =>
      h('button', { class: ['sa-obj-tile', st.object === o.apiName && 'selected'], type: 'button', role: 'radio', 'aria-checked': String(st.object === o.apiName),
        onClick: () => { if (st.object !== o.apiName) { st.object = o.apiName; st.matchField = 'Id'; if (st.headers.length) autoMap(); } drawGrid(); drawFooter(); } },
      objIcon(o), h('span', { class: 'grow' }, h('div', { class: 'strong' }, o.pluralLabel || o.label), h('div', { class: 'tiny muted' }, o.apiName)),
      st.object === o.apiName ? icon('check', { cls: 'sa-tile-check' }) : null)));
    drawGrid();
    const modeList = h('div', { class: 'sa-mode-list', role: 'radiogroup', 'aria-label': 'Action' });
    const drawModes = () => mount(modeList, MODES.map(([k, l, d, ic]) => h('label', { class: ['sa-mode', st.mode === k && 'selected'] },
      h('input', { type: 'radio', name: 'imp-mode', checked: st.mode === k, onChange: () => { st.mode = k; if (st.headers.length) autoMap(); drawModes(); } }),
      h('span', { class: 'sa-mode-icon' }, icon(ic)), h('div', { class: 'grow' }, h('div', { class: 'strong' }, l), h('div', { class: 'small muted' }, d)))));
    drawModes();
    const search = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Search objects...', 'aria-label': 'Search objects', onInput: () => { term = search.value.trim().toLowerCase(); drawGrid(); } });
    return h('div', { class: 'sa-wizard-cols' },
      h('div', h('div', { class: 'row mb-8' }, h('h3', { class: 'grow' }, 'What kind of data are you importing?'), h('div', { class: 'input-group sa-search' }, icon('search'), search)), grid),
      h('div', h('h3', { class: 'mb-8' }, 'What do you want to do?'), modeList));
  }

  function step2() {
    const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', id: 'imp-file', class: 'sr-only', onChange: () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast('Files larger than 10 MB are not supported.', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => { if (loadText(String(reader.result), file.name)) draw(); };
      reader.onerror = () => toast('Could not read the file.', 'error');
      reader.readAsText(file);
    } });
    const drop = h('label', { class: 'sa-dropzone', for: 'imp-file' },
      icon('upload', { size: 28 }), h('div', { class: 'strong' }, 'Choose a CSV file or drag it here'), h('div', { class: 'small muted' }, 'UTF-8, comma-separated, first row contains column headers.'), fileInput);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('over');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { if (loadText(String(reader.result), file.name)) draw(); };
      reader.readAsText(file);
    });
    const paste = h('textarea', { class: 'input mono', id: 'imp-paste', rows: 7, placeholder: 'FirstName,LastName,Company,Email\nAda,Lovelace,Analytical Engines,ada@example.com' });
    const templateFields = mappable().filter((f) => f.apiName !== 'Id' && (f.required || ['Name', 'Email', 'Phone'].includes(f.apiName))).slice(0, 8);
    return h('div', { class: 'sa-wizard-cols' },
      h('div',
        h('h3', { class: 'mb-8' }, 'Upload your file'), drop,
        st.rows.length ? h('div', { class: 'alert success mt-16' }, icon('check'), h('div', h('strong', st.fileName || 'Pasted data'), ` — ${fmt.number(st.rows.length)} rows, ${st.headers.length} columns loaded.`)) : null,
        h('div', { class: 'small muted mt-16' }, 'Need a template? ',
          h('button', { class: 'link-btn', onClick: () => downloadCsv(`${st.object}-template`, templateFields.map((f) => [f.apiName, f.apiName]), []) }, `Download a ${obj()?.label} CSV template`), '.')),
      h('div',
        h('h3', { class: 'mb-8' }, 'Or paste CSV data'),
        formRow2('CSV text', paste),
        h('button', { class: 'btn mt-8', onClick: () => { if (!paste.value.trim()) { toast('Paste some CSV first', 'warning'); return; } if (loadText(paste.value, 'Pasted data')) draw(); } }, icon('check'), 'Use Pasted Data')));
  }

  function formRow2(label, el) { return h('div', h('label', { class: 'form-label', for: el.id }, label), el); }

  function step3() {
    const fields = mappable();
    const opts = [['', "-- Don't map --"], ...fields.filter((f) => f.apiName !== 'Id' || st.mode !== 'insert').map((f) => [f.apiName, `${f.label} (${f.apiName})${f.required && !f.system ? ' *' : ''}`])];
    const mapped = st.mapping.filter(Boolean);
    const dupes = new Set(mapped.filter((f, i) => mapped.indexOf(f) !== i));
    const required = fields.filter((f) => f.required && f.apiName !== 'Id' && f.defaultValue == null && !(f.values || []).some((x) => x.isDefault) && f.type !== 'Checkbox');
    const missingReq = st.mode === 'insert' ? required.filter((f) => !mapped.includes(f.apiName)) : [];
    const tbody = h('tbody', st.headers.map((hd, i) => {
      const sample = st.rows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(', ');
      const sel = select(opts, st.mapping[i], { cls: ['input input-sm', dupes.has(st.mapping[i]) && 'invalid'].filter(Boolean).join(' '), ariaLabel: `Map column ${hd}`, onChange: (v) => { st.mapping[i] = v; draw(); } });
      return h('tr',
        h('td', h('strong', hd)),
        h('td', h('span', { class: 'muted small truncate sa-sample', title: sample }, sample || '(empty)')),
        h('td', { class: 'center' }, icon('chevronRight', { cls: 'muted' })),
        h('td', sel),
        h('td', st.mapping[i] ? (dupes.has(st.mapping[i]) ? badge('Duplicate', 'danger') : badge('Mapped', 'success')) : badge('Unmapped')));
    }));
    const matchSel = select(matchOptions(), st.matchField, { id: 'imp-match', onChange: (v) => { st.matchField = v; draw(); } });
    return h('div',
      st.mode !== 'insert' ? h('div', { class: 'sa-match-box mb-16' },
        h('div', { class: 'grow' }, h('label', { class: 'form-label', for: 'imp-match' }, 'Match records by'), matchSel,
          h('div', { class: 'form-help' }, 'Records are matched on this field. Map a CSV column to it below.')),
        !st.mapping.includes(st.matchField) ? h('div', { class: 'alert warning' }, icon('alert'), h('div', `Map a column to "${matchOptions().find(([k]) => k === st.matchField)?.[1]}" to continue.`)) : h('div', { class: 'alert success' }, icon('check'), h('div', 'Match field is mapped.'))) : null,
      missingReq.length ? h('div', { class: 'alert warning mb-16' }, icon('alert'), h('div', 'Required fields not mapped: ', h('strong', missingReq.map((f) => f.label).join(', ')), '. Rows without them will fail unless a default or automation sets them.')) : null,
      dupes.size ? h('div', { class: 'alert danger mb-16' }, icon('alert'), h('div', 'Each field can only be mapped once.')) : null,
      h('div', { class: 'row mb-8' }, h('span', { class: 'grow muted small' }, `${mapped.length} of ${st.headers.length} columns mapped to ${obj()?.label} fields.`),
        h('button', { class: 'btn btn-sm', onClick: () => { autoMap(); draw(); } }, icon('refresh'), 'Auto-map'),
        h('button', { class: 'btn btn-sm', onClick: () => { st.mapping = st.headers.map(() => ''); draw(); } }, 'Clear all')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact sa-map-table' },
        h('thead', h('tr', h('th', 'CSV Header'), h('th', 'Sample Values'), h('th', ''), h('th', `${obj()?.label} Field`), h('th', 'Status'))), tbody)));
  }

  function step4() {
    const rows = buildRows();
    const fields = new Map((obj()?.fields || []).map((f) => [f.apiName, f]));
    const cols = st.mapping.filter(Boolean);
    const empty = rows.filter((r) => !Object.keys(r).length).length;
    return h('div',
      h('div', { class: 'grid-4 mb-16' },
        tile('Object', obj()?.pluralLabel || st.object, 'layers'),
        tile('Action', MODES.find(([k]) => k === st.mode)[1], 'zap'),
        tile('Rows', fmt.number(rows.length), 'list'),
        tile('Mapped Fields', `${cols.length} of ${st.headers.length}`, 'table')),
      st.mode !== 'insert' ? h('div', { class: 'alert mb-16' }, icon('info'), h('div', 'Matching on ', h('strong', matchOptions().find(([k]) => k === st.matchField)?.[1]), '.')) : null,
      empty ? h('div', { class: 'alert warning mb-16' }, icon('alert'), h('div', `${empty} row(s) have no values in mapped columns and will likely fail.`)) : null,
      h('h3', { class: 'mb-8' }, `Preview (first ${Math.min(5, rows.length)} of ${fmt.number(rows.length)} rows)`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', h('tr', h('th', { class: 'row-num' }, '#'), cols.map((c) => h('th', fields.get(c)?.label || c)))),
        h('tbody', rows.slice(0, 5).map((r, i) => h('tr', h('td', { class: 'row-num' }, String(i + 1)), cols.map((c) => h('td', r[c] ?? h('span', { class: 'muted' }, '—')))))))));
  }

  function tile(label, value, ic) {
    return h('div', { class: 'card sa-stat' }, h('div', { class: 'sa-stat-icon' }, icon(ic)), h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'sa-stat-value truncate', style: { fontSize: '17px' } }, value), h('div', { class: 'sa-stat-label' }, label)));
  }

  async function start() {
    st.running = true;
    drawFooter();
    mount(body, h('div', { class: 'center p-24' }, spinner(), h('div', { class: 'muted' }, `Importing ${fmt.number(st.rows.length)} rows into ${obj()?.pluralLabel}…`)));
    try {
      st.result = await POST(`/api/records/${encodeURIComponent(st.object)}/import`, { rows: buildRows(), mode: st.mode, matchField: st.mode === 'insert' ? undefined : st.matchField });
      const r = st.result;
      toast(`Import complete: ${r.created} created, ${r.updated} updated, ${r.errors.length} errors`, r.errors.length ? 'warning' : 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    st.running = false;
    draw();
  }

  function results() {
    const r = st.result;
    const total = st.rows.length;
    return h('div',
      h('div', { class: ['alert', r.errors.length ? 'warning' : 'success', 'mb-16'] }, icon(r.errors.length ? 'alert' : 'check'),
        h('div', h('strong', 'Import finished. '), `${fmt.number(total - r.errors.length)} of ${fmt.number(total)} rows processed successfully.`)),
      h('div', { class: 'grid-3 mb-16' },
        tile('Records Created', fmt.number(r.created), 'plus'),
        tile('Records Updated', fmt.number(r.updated), 'edit'),
        tile('Errors', fmt.number(r.errors.length), 'alert')),
      r.errors.length ? h('div',
        h('div', { class: 'row mb-8' }, h('h3', { class: 'grow' }, 'Errors'),
          h('button', { class: 'btn btn-sm', onClick: () => downloadCsv(`${st.object}-import-errors`, [['row', 'Row'], ['message', 'Error'], ...st.headers.map((hd, i) => [(e) => st.rows[e.row - 1]?.[i], hd])], r.errors) }, icon('download'), 'Download Errors')),
        dataTable({ compact: true, rows: r.errors, maxRows: 200, columns: [
          { key: 'row', label: 'Row', cls: 'num', width: '70px' },
          { key: 'message', label: 'Error', render: (e) => h('span', { class: 'sa-wrap', style: { color: 'var(--danger)' } }, e.message) },
          { key: 'data', label: 'Row Data', sortable: false, render: (e) => h('span', { class: 'muted small truncate', title: (st.rows[e.row - 1] || []).join(', ') }, (st.rows[e.row - 1] || []).join(', ')) },
        ] }).el) : null);
  }

  function draw() {
    drawStepper();
    if (st.result) mount(body, results());
    else mount(body, [null, step1, step2, step3, step4][st.step]());
    drawFooter();
  }

  draw();
  mount(container, header, h('div', { class: 'card' }, h('div', { class: 'card-header sa-stepper-wrap' }, stepper), h('div', { class: 'card-body' }, body), footer));
}
