// Developer Console: SOQL Query Editor, REST Explorer, Schema browser and Formula Tester.
import { h, icon, mount, clear, fmt, toast, showMenu, badge, spinner, emptyState, store, downloadText, escapeHtml, objIcon, promptDialog } from '../lib.js';
import { POST, getObj, objForId, state, can } from '../api.js';
import { lookupInput } from '../fields.js';
import { formulaEditor } from '../components/formula.js';

const TABS = [
  { id: 'query', label: 'Query Editor', icon: 'database' },
  { id: 'rest', label: 'REST Explorer', icon: 'globe' },
  { id: 'schema', label: 'Schema', icon: 'layers' },
  { id: 'formula', label: 'Formula Tester', icon: 'code' },
];

const SAMPLES = [
  'SELECT Id, Name, Industry, AnnualRevenue FROM Account ORDER BY AnnualRevenue DESC LIMIT 10',
  'SELECT Name, Amount, StageName, CloseDate, Account.Name, Owner.Name FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC LIMIT 20',
  'SELECT Name, Industry, (SELECT Name, Email, Title FROM Contacts) FROM Account LIMIT 5',
  'SELECT StageName, COUNT(Id) deals, SUM(Amount) total FROM Opportunity GROUP BY StageName',
  'SELECT Name, Subject, Status, Priority, Account.Name FROM Case WHERE CreatedDate = LAST_N_DAYS:30',
  "SELECT Name, Company, Status FROM Lead WHERE Status != 'Closed - Converted' LIMIT 25",
  'SELECT Name, ActivityDate, Status, Owner.Name FROM Task WHERE ActivityDate = THIS_WEEK',
  'SELECT COUNT() FROM Contact',
];

const isIdLike = (v) => typeof v === 'string' && /^[a-zA-Z0-9]{15}$/.test(v) && !!objForId(v);

// ---------- result flattening ----------
function flatten(rec, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(rec || {})) {
    if (k === 'attributes') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('records' in v && 'totalSize' in v) out[key] = { __child: v };
      else flatten(v, key, out);
    } else out[key] = v;
  }
  return out;
}

function columnsFor(rows) {
  const cols = [];
  const seen = new Set();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  // A null parent relationship ("Account": null) shouldn't add a column when Account.* columns exist.
  return cols.filter((c) => !cols.some((o) => o !== c && o.startsWith(c + '.')));
}

function childColumns(rows, cols) {
  return new Set(cols.filter((c) => rows.some((r) => r[c] && r[c].__child)));
}

function cellText(v) {
  if (v == null) return '';
  if (v.__child) return `${v.__child.totalSize} records`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function resultTable(records, { nested = false } = {}) {
  const rows = records.map((r) => flatten(r));
  const cols = columnsFor(rows);
  const childCols = childColumns(rows, cols);
  const tbody = h('tbody');
  rows.forEach((r, i) => {
    let expanded = null;
    const tr = h('tr', h('td', { class: 'row-num' }, String(i + 1)), cols.map((c) => {
      const v = r[c];
      if (childCols.has(c)) {
        const n = v?.__child?.totalSize || 0;
        if (!n) return h('td', h('span', { class: 'muted' }, '0 records'));
        return h('td', h('button', {
          class: 'dc-child-btn', 'aria-expanded': 'false',
          onClick: (e) => {
            const btn = e.currentTarget;
            if (expanded && expanded.dataset.col === c) { expanded.remove(); expanded = null; btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('open'); return; }
            expanded?.remove();
            tr.parentNode.querySelectorAll(`tr[data-parent="${i}"]`).forEach((x) => x.remove());
            tr.querySelectorAll('.dc-child-btn.open').forEach((b) => { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
            expanded = h('tr', { class: 'dc-child-row', dataset: { col: c, parent: String(i) } }, h('td', { colspan: String(cols.length + 1) },
              h('div', { class: 'dc-child' }, h('div', { class: 'tiny muted mb-8' }, `${c} · ${n} record${n === 1 ? '' : 's'}`), resultTable(v.__child.records, { nested: true }))));
            tr.after(expanded);
            btn.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
          },
        }, icon('chevronRight', { size: 12 }), `${n} record${n === 1 ? '' : 's'}`));
      }
      if (isIdLike(v)) return h('td', h('a', { href: `#/r/${v}`, class: 'mono' }, v));
      if (typeof v === 'boolean') return h('td', h('span', { class: v ? 'dc-true' : 'muted' }, String(v)));
      if (typeof v === 'number') return h('td', { class: 'num' }, String(v));
      return h('td', { title: v == null ? '' : String(v) }, v == null ? '' : String(v));
    }));
    tbody.appendChild(tr);
  });
  return h('div', { class: ['table-wrap', nested ? 'dc-nested' : 'dc-grid'] }, h('table', { class: 'table compact' },
    h('thead', h('tr', h('th', { class: 'row-num' }, '#'), cols.map((c) => h('th', c)))), tbody));
}

function toCsv(records) {
  const rows = records.map((r) => flatten(r));
  const cols = columnsFor(rows);
  const esc = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [cols.map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(cellText(r[c]))).join(','))].join('\n');
}

// ---------- JSON highlighting (escapes every token) ----------
function highlightJson(text) {
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[1]) {
      const raw = m[1];
      if (m[2]) out += `<span class="j-key">${escapeHtml(raw)}</span>${escapeHtml(m[2])}`;
      else {
        const inner = raw.slice(1, -1);
        if (/^\/services\/data\/[\w./?=&%-]+$/.test(inner)) out += `<span class="j-str">"<a href="#" class="j-link" data-path="${escapeHtml(inner)}">${escapeHtml(inner)}</a>"</span>`;
        else out += `<span class="j-str">${escapeHtml(raw)}</span>`;
      }
    } else if (m[3]) out += `<span class="j-lit">${m[0]}</span>`;
    else out += `<span class="j-num">${m[0]}</span>`;
    last = re.lastIndex;
  }
  return out + escapeHtml(text.slice(last));
}

export default async function devConsole(root, { query, app }) {
  app.setTitle('Developer Console');
  if (!(can('RunSoql') || can('ModifyAllData'))) {
    mount(root, h('div', { class: 'card p-24' }, emptyState('Insufficient privileges', 'You need the “Use Developer Console (SOQL)” permission to open the Developer Console. Ask your administrator.', { iconName: 'lock', action: h('a', { class: 'btn', href: '#/home' }, 'Go Home') })));
    return;
  }
  let active = query.q ? 'query' : store.get('devconsole:tab', 'query');
  if (!TABS.some((t) => t.id === active)) active = 'query';
  const tabBar = h('div', { class: 'dc-tabs', role: 'tablist' });
  const panes = {};
  const body = h('div', { class: 'dc-body' });
  mount(root, h('div', { class: 'dc' },
    h('div', { class: 'dc-header' },
      h('span', { class: 'dc-logo' }, icon('code')),
      h('div', h('h1', 'Developer Console'), h('div', { class: 'small muted' }, `${state.session?.org?.name || 'Slavy'} · ${state.session?.user?.Name || ''}`)),
      tabBar, h('span', { class: 'spacer' }),
      can('ViewSetup') || can('CustomizeApplication') ? h('a', { class: 'btn btn-ghost btn-sm', href: '#/setup/api' }, icon('help', { size: 14 }), 'API Docs') : null),
    body));

  const show = (id) => {
    active = id;
    store.set('devconsole:tab', id);
    clear(tabBar);
    for (const t of TABS) {
      tabBar.appendChild(h('button', { class: ['dc-tab', t.id === id && 'active'], role: 'tab', 'aria-selected': String(t.id === id), onClick: () => show(t.id) }, icon(t.icon, { size: 14 }), t.label));
    }
    if (!panes[id]) { panes[id] = builders[id](); body.appendChild(panes[id]); }
    for (const [k, el] of Object.entries(panes)) el.classList.toggle('hidden', k !== id);
    panes[id].querySelector('[data-autofocus]')?.focus();
  };

  // ---------- Query Editor ----------
  let setQuery = null;
  const builders = {
    query() {
      const ta = h('textarea', { class: 'input dc-soql', spellcheck: 'false', 'aria-label': 'SOQL query', 'data-autofocus': '', placeholder: 'SELECT Id, Name FROM Account LIMIT 10' });
      ta.value = query.q || store.get('devconsole:soql', SAMPLES[0]);
      const status = h('div', { class: 'dc-status' }, h('span', { class: 'muted' }, 'Press ', h('span', { class: 'kbd' }, 'Ctrl/⌘'), ' + ', h('span', { class: 'kbd' }, 'Enter'), ' to execute.'));
      const results = h('div', { class: 'dc-results' }, emptyState('No results yet', 'Write a SOQL query and click Execute.', { iconName: 'database' }));
      let last = null;
      const exportBtn = h('button', { class: 'btn btn-sm', disabled: true, onClick: () => last && downloadText(`${last.object || 'query'}-results.csv`, toCsv(last.records)) }, icon('download', { size: 14 }), 'Export CSV');
      const execBtn = h('button', { class: 'btn btn-brand', onClick: () => execute() }, icon('play', { size: 14 }), 'Execute');

      async function execute() {
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
        const q = (sel.length > 10 ? sel : ta.value).trim();
        if (!q) { ta.focus(); return; }
        store.set('devconsole:soql', ta.value);
        execBtn.disabled = true;
        mount(results, spinner());
        const t0 = performance.now();
        try {
          const r = await POST('/api/soql', { q });
          const ms = r.ms ?? Math.round(performance.now() - t0);
          const object = /\bFROM\s+(\w+)/i.exec(q)?.[1];
          last = { ...r, object };
          addHistory(q, r.totalSize);
          exportBtn.disabled = !r.records.length;
          mount(status, h('span', { class: 'strong' }, 'Query Results'), h('span', { class: 'muted' }, ` — Total Rows: ${fmt.number(r.totalSize)}`),
            r.records.length && r.records.length < r.totalSize ? h('span', { class: 'muted' }, ` (showing ${r.records.length})`) : null,
            h('span', { class: 'muted' }, ` · ${ms} ms`));
          if (!r.records.length) mount(results, r.totalSize ? h('div', { class: 'dc-count' }, h('div', { class: 'dc-count-num' }, fmt.number(r.totalSize)), h('div', { class: 'muted' }, 'COUNT()')) : emptyState('No rows returned', 'The query ran successfully but matched no records.', { iconName: 'search' }));
          else mount(results, resultTable(r.records));
        } catch (e) {
          last = null;
          exportBtn.disabled = true;
          mount(status, h('span', { class: 'strong', style: { color: 'var(--danger)' } }, 'Query failed'));
          mount(results, h('div', { class: 'alert danger dc-error' }, icon('alert'), h('div', h('div', { class: 'strong' }, e.message), h('div', { class: 'small mt-4' }, 'Check object and field API names in the Schema tab.'))));
        } finally { execBtn.disabled = false; }
      }

      function addHistory(q, rows) {
        const hist = store.get('devconsole:history', []).filter((x) => x.q !== q);
        hist.unshift({ q, rows, at: new Date().toISOString() });
        store.set('devconsole:history', hist.slice(0, 30));
      }

      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); execute(); }
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
      });
      setQuery = (q, run) => { ta.value = q; show('query'); if (run) execute(); };

      const pane = h('div', { class: 'dc-pane dc-query' },
        h('div', { class: 'card dc-editor' },
          h('div', { class: 'dc-toolbar' }, execBtn,
            h('button', { class: 'btn', onClick: (e) => showMenu(e.currentTarget, [{ header: 'Sample queries' }, ...SAMPLES.map((s) => ({ label: s, onClick: () => { ta.value = s; ta.focus(); } }))], { width: 520 }) }, icon('list', { size: 14 }), 'Samples'),
            h('button', { class: 'btn', onClick: (e) => {
              const hist = store.get('devconsole:history', []);
              showMenu(e.currentTarget, [{ header: 'Query history' },
                ...(hist.length ? hist.map((x) => ({ label: x.q, meta: `${x.rows} rows · ${fmt.relative(x.at)}`, onClick: () => { ta.value = x.q; ta.focus(); } })) : [{ label: 'No queries yet', disabled: true }]),
                hist.length ? 'sep' : null, hist.length ? { label: 'Clear history', icon: 'trash', danger: true, onClick: () => { store.set('devconsole:history', []); toast('Query history cleared'); } } : null], { width: 560 });
            } }, icon('clock', { size: 14 }), 'History'),
            aiSoqlButton((q) => { ta.value = q; ta.focus(); execute(); }),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn btn-ghost', onClick: () => { ta.value = ''; ta.focus(); } }, 'Clear')),
          ta),
        h('div', { class: 'card dc-results-card' }, h('div', { class: 'dc-results-head' }, status, h('span', { class: 'spacer' }), exportBtn), results));
      if (query.q) setTimeout(execute, 0);
      return pane;
    },

    // ---------- REST Explorer ----------
    rest() {
      const method = h('select', { class: 'input dc-method', 'aria-label': 'HTTP method', onChange: () => drawBody() }, ['GET', 'POST', 'PATCH', 'DELETE'].map((m) => h('option', { value: m }, m)));
      const path = h('input', { class: 'input mono', value: '/services/data/v1.0/sobjects', 'aria-label': 'Request path', 'data-autofocus': '', onKeydown: (e) => { if (e.key === 'Enter') send(); } });
      const reqBody = h('textarea', { class: 'input mono dc-body-input', rows: 6, spellcheck: 'false', 'aria-label': 'Request body (JSON)' });
      reqBody.value = '{\n  "Name": "Acme Robotics",\n  "Industry": "Technology"\n}';
      const bodyWrap = h('div');
      const respHead = h('div', { class: 'dc-results-head' }, h('span', { class: 'muted' }, 'Send a request to see the response.'));
      const pre = h('pre', { class: 'dc-json' });
      pre.addEventListener('click', (e) => {
        const a = e.target.closest('a.j-link');
        if (!a) return;
        e.preventDefault();
        method.value = 'GET'; drawBody();
        path.value = a.dataset.path;
        send();
      });
      let lastText = '';
      const sendBtn = h('button', { class: 'btn btn-brand', onClick: () => send() }, icon('play', { size: 14 }), 'Send');

      function drawBody() {
        clear(bodyWrap);
        if (['POST', 'PATCH'].includes(method.value)) bodyWrap.appendChild(h('div', { class: 'mt-8' }, h('label', { class: 'form-label' }, 'Request Body (JSON)'), reqBody));
      }
      drawBody();

      async function send() {
        let p = path.value.trim();
        if (!p.startsWith('/')) p = '/' + p;
        let payload;
        if (['POST', 'PATCH'].includes(method.value)) {
          try { payload = JSON.stringify(JSON.parse(reqBody.value || '{}')); } catch (e) { toast(`Request body isn’t valid JSON: ${e.message}`, 'error'); return; }
        }
        sendBtn.disabled = true;
        mount(respHead, spinner());
        const t0 = performance.now();
        try {
          const res = await fetch(p, { method: method.value, credentials: 'same-origin', headers: { 'X-Requested-With': 'slavy', ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload });
          const text = await res.text();
          const ms = Math.round(performance.now() - t0);
          let pretty = text;
          try { pretty = text ? JSON.stringify(JSON.parse(text), null, 2) : ''; } catch { /* not JSON */ }
          lastText = pretty;
          const kind = res.status < 300 ? 'success' : res.status < 500 ? 'warning' : 'danger';
          mount(respHead, badge(`${res.status} ${res.statusText}`, kind), h('span', { class: 'muted small' }, `${method.value} ${p} · ${ms} ms · ${fmt.number(text.length)} bytes`),
            h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', onClick: () => navigator.clipboard?.writeText(lastText).then(() => toast('Response copied', 'success', { timeout: 1500 })) }, icon('copy', { size: 13 }), 'Copy'));
          pre.innerHTML = pretty ? highlightJson(pretty) : '<span class="muted">(empty response body)</span>';
        } catch (e) {
          mount(respHead, badge('Network error', 'danger'), h('span', { class: 'small' }, e.message));
          pre.textContent = '';
        } finally { sendBtn.disabled = false; }
      }

      const quick = [
        ['GET', '/services/data/v1.0', 'Resources'], ['GET', '/services/data/v1.0/sobjects', 'SObjects'], ['GET', '/services/data/v1.0/sobjects/Account/describe', 'Describe Account'],
        ['GET', '/services/data/v1.0/query?q=' + encodeURIComponent('SELECT Id, Name FROM Account LIMIT 5'), 'Query'], ['GET', '/services/data/v1.0/search?q=' + encodeURIComponent('FIND {Acme}'), 'Search'],
        ['GET', '/services/data/v1.0/limits', 'Limits'], ['POST', '/services/data/v1.0/sobjects/Account', 'Create Account'],
      ];
      return h('div', { class: 'dc-pane' },
        h('div', { class: 'card p-16' },
          h('div', { class: 'row' }, method, h('div', { class: 'grow' }, path), sendBtn),
          h('div', { class: 'row wrap mt-8 gap-4' }, h('span', { class: 'tiny muted' }, 'Try:'), quick.map(([m, p, l]) => h('button', { class: 'chip dc-chip', onClick: () => { method.value = m; drawBody(); path.value = p; if (m === 'GET') send(); else path.focus(); } }, h('span', { class: `http-method sm ${m.toLowerCase()}` }, m), l))),
          bodyWrap,
          h('div', { class: 'form-help mt-8' }, 'Requests use your current session. Links to other ', h('code', '/services/data'), ' resources in responses are clickable.')),
        h('div', { class: 'card dc-results-card' }, respHead, h('div', { class: 'dc-json-wrap' }, pre)));
    },

    // ---------- Schema ----------
    schema() {
      const objs = [...state.objects.values()].sort((a, b) => a.label.localeCompare(b.label));
      let current = objs[0]?.apiName;
      const search = h('input', { class: 'input input-sm', placeholder: 'Search objects...', 'aria-label': 'Search objects', 'data-autofocus': '', onInput: () => drawList() });
      const list = h('div', { class: 'dc-objlist' });
      const detail = h('div', { class: 'card dc-schema-detail' });
      const fieldSearch = h('input', { class: 'input input-sm', placeholder: 'Filter fields...', 'aria-label': 'Filter fields', onInput: () => drawDetail(false) });
      function drawList() {
        const t = search.value.trim().toLowerCase();
        clear(list);
        const shown = objs.filter((o) => !t || o.label.toLowerCase().includes(t) || o.apiName.toLowerCase().includes(t));
        if (!shown.length) list.appendChild(h('div', { class: 'muted small p-16' }, 'No objects'));
        for (const o of shown) list.appendChild(h('button', { class: ['dc-obj', o.apiName === current && 'active'], onClick: () => { current = o.apiName; fieldSearch.value = ''; drawList(); drawDetail(); } },
          objIcon(o, 'sm'), h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'truncate' }, o.label), h('div', { class: 'tiny muted mono truncate' }, o.apiName))));
      }
      const tableWrap = h('div');
      function drawDetail(full = true) {
        const o = getObj(current);
        if (!o) { mount(detail, emptyState('Select an object', '')); return; }
        const t = fieldSearch.value.trim().toLowerCase();
        const fields = o.fields.filter((f) => !t || f.label.toLowerCase().includes(t) || f.apiName.toLowerCase().includes(t));
        const flags = (f) => [f.required && 'Required', f.unique && 'Unique', f.externalId && 'External ID', f.isCustom && 'Custom', f.system && 'System', f.isNameField && 'Name', (f.readOnly || f.type === 'Formula' || f.type === 'Rollup' || f.type === 'AutoNumber') && 'Read-only', f.polymorphic && 'Polymorphic'].filter(Boolean);
        const typeText = (f) => (f.type === 'Formula' || f.type === 'Rollup' ? `${f.type} (${f.returnType || 'Number'})` : f.type);
        const len = (f) => (f.length ? String(f.length) : f.precision ? `${f.precision}, ${f.scale ?? 0}` : '');
        const ref = (f) => (f.referenceTo ? [].concat(f.referenceTo).join(', ') + (f.relationshipName ? ` (${f.relationshipName})` : '') : '');
        mount(tableWrap, h('div', { class: 'table-wrap dc-grid' }, h('table', { class: 'table compact' },
          h('thead', h('tr', h('th', 'Field Label'), h('th', 'API Name'), h('th', 'Type'), h('th', 'Length'), h('th', 'Reference To'), h('th', 'Flags'))),
          h('tbody', fields.map((f) => h('tr',
            h('td', f.label), h('td', h('code', f.apiName)), h('td', typeText(f)), h('td', { class: 'num' }, len(f)), h('td', { class: 'small' }, ref(f)),
            h('td', flags(f).map((x) => h('span', { class: 'chip' }, x)))))))));
        if (!full) return;
        const q = `SELECT ${['Id', ...o.fields.filter((f) => !f.system && f.apiName !== 'Id').slice(0, 5).map((f) => f.apiName)].filter((v, i, a) => a.indexOf(v) === i).join(', ')} FROM ${o.apiName} LIMIT 20`;
        mount(detail,
          h('div', { class: 'card-header' }, objIcon(o), h('div', { class: 'grow' }, h('h3', o.label), h('div', { class: 'small muted' }, h('code', o.apiName), ` · Key prefix ${o.keyPrefix} · ${o.fields.length} fields`)),
            o.isCustom ? badge('Custom', 'brand') : badge('Standard'),
            h('button', { class: 'btn btn-sm', onClick: () => { if (!setQuery) show('query'); setQuery(q, true); } }, icon('play', { size: 13 }), 'Query'),
            can('CustomizeApplication') ? h('a', { class: 'btn btn-sm', href: `#/setup/objects/${o.apiName}` }, icon('external', { size: 13 }), 'Object Manager') : null),
          h('div', { class: 'p-16', style: { paddingBottom: '8px' } }, h('div', { class: 'input-group', style: { maxWidth: '280px' } }, icon('search'), fieldSearch)),
          tableWrap,
          o.children?.length ? h('div', { class: 'p-16' }, h('h4', { class: 'mb-8' }, 'Child Relationships'), h('div', { class: 'row wrap gap-4' }, o.children.map((c) => h('span', { class: 'chip', title: `${c.object}.${c.field}` }, `${c.pluralLabel} (${c.object}.${c.field})`)))) : null);
      }
      drawList();
      drawDetail();
      return h('div', { class: 'dc-pane dc-schema' },
        h('div', { class: 'card dc-objpane' }, h('div', { class: 'p-16', style: { paddingBottom: '8px' } }, h('div', { class: 'input-group' }, icon('search'), search)), list),
        detail);
    },

    // ---------- Formula Tester ----------
    formula() {
      const objs = [...state.objects.values()].sort((a, b) => a.label.localeCompare(b.label));
      let objApi = objs.find((o) => o.apiName === 'Opportunity')?.apiName || objs[0]?.apiName;
      let recordId = null;
      let formula = "IF(Amount > 100000, 'Large deal', 'Standard deal')";
      const objSel = h('select', { class: 'input', 'aria-label': 'Object', onChange: () => { objApi = objSel.value; recordId = null; drawEditor(); } }, objs.map((o) => h('option', { value: o.apiName, selected: o.apiName === objApi }, o.label)));
      const recWrap = h('div');
      const feWrap = h('div');
      const result = h('div', { class: 'dc-formula-result' }, h('div', { class: 'muted small' }, 'Choose a record and click Evaluate to see the result.'));
      let fe;
      function drawEditor() {
        mount(recWrap, lookupInput({ objects: [objApi], placeholder: `Search ${getObj(objApi)?.pluralLabel || ''}...`, onChange: (v) => { recordId = v; } }).el);
        if (getObj(objApi) && objApi !== 'Opportunity') formula = '';
        fe = formulaEditor({ objApi, value: formula, rows: 5, onChange: (v) => { formula = v; } });
        mount(feWrap, fe.el);
        fe.el.querySelector('textarea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); evaluate(); } });
      }
      const evalBtn = h('button', { class: 'btn btn-brand', onClick: () => evaluate() }, icon('play', { size: 14 }), 'Evaluate');
      async function evaluate() {
        if (!formula.trim()) { mount(result, h('div', { class: 'alert warning' }, icon('alert'), h('div', 'Enter a formula first.'))); return; }
        evalBtn.disabled = true;
        mount(result, spinner());
        try {
          const r = await POST('/api/formula/check', { object: objApi, formula, recordId: recordId || undefined });
          if (!r.ok) mount(result, h('div', { class: 'alert danger' }, icon('alert'), h('div', h('div', { class: 'strong' }, 'Formula error'), h('div', { class: 'mono small mt-4' }, r.error))));
          else if (!recordId) mount(result, h('div', { class: 'alert success' }, icon('check'), h('div', h('div', { class: 'strong' }, 'No syntax errors'), h('div', { class: 'small' }, 'Select a record to see the value this formula returns.'))));
          else mount(result, h('div', { class: 'dc-formula-value' }, h('div', { class: 'tiny muted' }, 'RESULT'), h('div', { class: 'dc-formula-out mono' }, r.sample === '' || r.sample == null ? h('span', { class: 'muted' }, '(blank)') : String(r.sample)),
            h('a', { class: 'small', href: `#/r/${recordId}` }, 'Open record')));
        } catch (e) { mount(result, h('div', { class: 'alert danger' }, icon('alert'), h('div', e.message))); } finally { evalBtn.disabled = false; }
      }
      drawEditor();
      return h('div', { class: 'dc-pane dc-formula' },
        h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Formula'), evalBtn), h('div', { class: 'card-body' },
          h('div', { class: 'grid-2' }, h('div', h('label', { class: 'form-label' }, 'Object'), objSel), h('div', h('label', { class: 'form-label' }, 'Sample Record (optional)'), recWrap)),
          h('div', { class: 'mt-16' }, feWrap))),
        h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Result')), h('div', { class: 'card-body' }, result)));
    },
  };

  show(active);
}

// "Ask AI": natural language → SOQL (shown only when generative AI is available to the user).
function aiSoqlButton(onQuery) {
  const btn = h('button', { class: 'btn ai-btn', onClick: async () => {
    const question = await promptDialog('Describe the data you want, in plain English:', { title: 'Write SOQL with AI', confirmLabel: 'Generate', multiline: true });
    if (!question) return;
    btn.disabled = true;
    try {
      const r = await POST('/api/ai/soql', { question });
      toast(r.explanation || 'Query generated', 'success');
      onQuery(r.soql);
    } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
  } }, icon('sparkles', { size: 14 }), 'Ask AI');
  import('../ai/status.js').then(({ aiStatus, canGenerate }) => aiStatus().then((st) => { if (!canGenerate(st, 'builder')) btn.remove(); }));
  return btn;
}
