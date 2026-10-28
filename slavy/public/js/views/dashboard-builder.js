// Dashboard builder: properties, running user, and a live-preview canvas of components
// (add / edit / duplicate / remove / reorder via buttons or drag & drop).
import { h, icon, mount, clear, modal, confirmDialog, toast, spinner, emptyState, debounce } from '../lib.js';
import { GET, POST, PUT, can, me } from '../api.js';
import { lookupInput } from '../fields.js';
import { normalizeResult, FORMAT_LABELS } from './report-view.js';
import { componentCard, COMPONENT_TYPES, pickDef } from './dashboard-view.js';

// Same derivation the server uses in runDashboard(), so the preview matches the saved dashboard.
export function deriveComponent(c, res, reportName) {
  if (!res) return { ...c, reportName };
  if (res.error) return { ...c, reportName, error: res.error };
  const measure = c.measure || res.chart?.measure?.key || res.aggregates[1]?.key || 'COUNT';
  const mMeta = res.aggregates.find((a) => a.key === measure) || res.aggregates[0];
  return {
    ...c, reportName, objectLabel: res.objectLabel, value: res.grandTotals[mMeta.key], measure: mMeta, total: res.total,
    chart: res.chart ? { ...res.chart, type: ['metric', 'gauge', 'table'].includes(c.type) ? res.chart.type : c.type || res.chart.type } : null,
    table: res.groups ? res.groups.slice(0, 10).map((g) => ({ label: g.label, value: g.totals[mMeta.key] }))
      : (res.rows || []).slice(0, 10).map((r) => ({ label: r._labels?.[res.columns[0].path] ?? r[res.columns[0].path], value: res.columns[1] ? (r._labels?.[res.columns[1].path] ?? r[res.columns[1].path]) : '' })),
  };
}

export default async function dashboardBuilder(root, { params, query, app }) {
  const isNew = params.id === 'new';
  app.setTitle(isNew ? 'New Dashboard' : 'Edit Dashboard');
  if (!can('ManageDashboards')) {
    mount(root, h('div', { class: 'card' }, emptyState('Insufficient privileges', 'You need the Manage Dashboards permission to create or edit dashboards.', { iconName: 'lock' })));
    return;
  }
  mount(root, spinner());
  const isAdmin = can('ModifyAllData');
  let dash = { name: '', description: '', folder: '', visibility: 'private', columns: 3, runningUser: 'viewer', components: [] };
  let runningUserName = me()?.Name;
  let existing = null;
  const [reports, list] = await Promise.all([GET('/api/reports'), GET('/api/dashboards').catch(() => [])]);
  if (!isNew) {
    existing = await GET(`/api/dashboards/${encodeURIComponent(params.id)}/run`);
    if (!existing.canEdit) {
      mount(root, h('div', { class: 'card' }, emptyState('Read-only dashboard', "You don't have access to edit this dashboard. Clone it to make your own copy.", { iconName: 'lock', action: h('a', { class: 'btn', href: `#/dashboards/${existing.id}` }, 'Back to Dashboard') })));
      return;
    }
    dash = {
      name: existing.name, description: existing.description || '', folder: existing.folder || '', visibility: existing.visibility || 'private',
      columns: existing.columns || 3, runningUser: existing.runningUser || 'viewer', components: (existing.components || []).map(pickDef),
    };
    runningUserName = existing.runningUserName;
    app.setTitle(`Edit: ${dash.name}`);
  }
  const folders = [...new Set(list.map((d) => d.folder).filter((f) => f && !['Private', 'Public'].includes(f)))].sort();
  const reportById = new Map(reports.map((r) => [r.id, r]));
  let dirty = false;
  let dragFrom = null;

  // ---------- report runs (cached per report) ----------
  const runs = new Map();
  const runReport = (id, force) => {
    if (!runs.has(id) || force) {
      runs.set(id, GET(`/api/reports/${encodeURIComponent(id)}/run`).then((r) => normalizeResult(r)).catch((e) => ({ error: e.status === 404 ? 'Source report not found' : e.message })));
    }
    return runs.get(id);
  };

  // ---------- properties panel ----------
  const nameInput = h('input', { class: 'input', id: 'an-d-name', value: dash.name, maxlength: 120, placeholder: 'e.g. Sales Overview', onInput: (e) => { dash.name = e.target.value; titleEl.textContent = dash.name || 'New Dashboard'; mark(); } });
  const descInput = h('textarea', { class: 'input', id: 'an-d-desc', rows: 2, onInput: (e) => { dash.description = e.target.value; mark(); } });
  descInput.value = dash.description;
  const folderInput = h('input', { class: 'input', id: 'an-d-folder', value: ['Private', 'Public'].includes(dash.folder) ? '' : dash.folder, list: 'an-dash-folders', placeholder: 'e.g. Sales Dashboards', onInput: (e) => { dash.folder = e.target.value; mark(); } });
  const visSel = h('select', { class: 'input', id: 'an-d-vis', onChange: (e) => { dash.visibility = e.target.value; mark(); } },
    h('option', { value: 'private', selected: dash.visibility !== 'public' }, 'Private — only you'), h('option', { value: 'public', selected: dash.visibility === 'public' }, 'Public — everyone who can run reports'));
  const colsGroup = h('div', { class: 'btn-group', role: 'group', 'aria-label': 'Columns' });
  const drawCols = () => {
    clear(colsGroup);
    [2, 3, 4].forEach((n) => colsGroup.appendChild(h('button', { class: ['btn btn-sm', dash.columns === n && 'active'], type: 'button', 'aria-pressed': String(dash.columns === n), onClick: () => { dash.columns = n; drawCols(); mark(); drawCanvas(); } }, `${n} columns`)));
  };
  drawCols();

  const ruHost = h('div');
  const drawRunningUser = () => {
    const specific = dash.runningUser && dash.runningUser !== 'viewer';
    const radio = (value, label, checked, disabled) => h('label', { class: 'checkbox', style: { display: 'flex', margin: '4px 0' } },
      h('input', { type: 'radio', name: 'an-ru', value, checked, disabled, onChange: () => {
        if (value === 'viewer') dash.runningUser = 'viewer';
        else if (value === 'me') { dash.runningUser = me().Id; runningUserName = me().Name; }
        else if (!specific) dash.runningUser = null;
        mark(); drawRunningUser();
      } }), label);
    if (isAdmin) {
      mount(ruHost,
        radio('viewer', 'Me — the dashboard viewer', !specific && dash.runningUser === 'viewer'),
        radio('user', 'A specific user', specific || dash.runningUser == null),
        specific || dash.runningUser == null ? h('div', { class: 'mt-8' }, lookupInput({
          objects: ['User'], value: specific ? dash.runningUser : null, label: specific ? runningUserName : null, placeholder: 'Search users...',
          onChange: (id) => { dash.runningUser = id; mark(); },
        }).el) : null,
        h('div', { class: 'form-help' }, 'With a specific running user, everyone sees data as that user sees it.'));
    } else {
      mount(ruHost,
        radio('viewer', 'Me — the dashboard viewer', dash.runningUser === 'viewer'),
        specific ? radio('keep', `${runningUserName || 'Current running user'} (current)`, true) : null,
        h('div', { class: 'form-help' }, 'Only administrators can run a dashboard as another user.'));
    }
  };
  drawRunningUser();

  // ---------- header ----------
  const titleEl = h('h1', { class: 'truncate' }, dash.name || 'New Dashboard');
  const dirtyBadge = h('span', { class: 'badge warning hidden' }, 'Unsaved changes');
  const countBadge = h('span', { class: 'badge' });
  const mark = () => { dirty = true; dirtyBadge.classList.remove('hidden'); };

  // ---------- canvas ----------
  const canvas = h('div', { class: 'an-canvas' });
  const derived = new Map(); // component id -> derived preview data
  const componentFor = (c) => derived.get(c.id) || { ...c, reportName: reportById.get(c.reportId)?.name, _loading: true };

  function toolbar(c, i) {
    const n = dash.components.length;
    const b = (ic, label, fn, disabled) => h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', title: label, 'aria-label': `${label}: ${c.title || 'component'}`, disabled, onClick: fn }, icon(ic, { size: 14 }));
    return h('div', { class: 'an-comp-tools' },
      h('span', { class: 'an-grip', title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip', { size: 14 })),
      b('chevronLeft', 'Move earlier', () => move(i, i - 1), i === 0),
      b('chevronRight', 'Move later', () => move(i, i + 1), i === n - 1),
      b('edit', 'Edit component', () => editComponent(i)),
      b('copy', 'Duplicate component', () => {
        if (n >= 20) { toast('Dashboards can have up to 20 components.', 'warning'); return; }
        const copy = { ...clone(c), id: newId() };
        dash.components.splice(i + 1, 0, copy); mark(); refreshComponent(copy); drawCanvas();
      }, n >= 20),
      b('trash', 'Remove component', async () => {
        if (!(await confirmDialog(`Remove "${c.title || 'this component'}" from the dashboard?`, { title: 'Remove Component', confirmLabel: 'Remove', danger: true }))) return;
        dash.components.splice(i, 1); mark(); drawCanvas();
      }));
  }

  function move(from, to) {
    if (to < 0 || to >= dash.components.length || from === to) return;
    const [c] = dash.components.splice(from, 1);
    dash.components.splice(to, 0, c);
    mark(); drawCanvas();
  }

  function drawCanvas() {
    countBadge.textContent = `${dash.components.length}/20`;
    clear(canvas);
    if (!dash.components.length) {
      canvas.appendChild(h('div', { class: 'an-canvas-empty' }, emptyState('Add your first component', 'Components show data from a source report as a chart, metric, gauge or table.', {
        iconName: 'dashboard', action: h('button', { class: 'btn btn-brand', onClick: () => editComponent(-1) }, icon('plus'), 'Add Component'),
      })));
      return;
    }
    const grid = h('div', { class: `an-dash-grid cols-${dash.columns} an-edit-grid` });
    dash.components.forEach((c, i) => {
      const data = componentFor(c);
      const card = data._loading
        ? h('article', { class: ['card an-comp', `size-${c.size || 'medium'}`] }, h('header', { class: 'an-comp-header' }, h('div', { class: 'grow' }, h('h3', { class: 'truncate' }, c.title || data.reportName || 'Component')), toolbar(c, i)), h('div', { class: 'an-comp-body' }, spinner()))
        : componentCard(data, { toolbar: toolbar(c, i), preview: true });
      card.draggable = true;
      card.addEventListener('dragstart', (e) => { dragFrom = i; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); grid.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target')); });
      card.addEventListener('dragover', (e) => { if (dragFrom == null) return; e.preventDefault(); card.classList.add('drop-target'); });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (e) => { e.preventDefault(); const from = dragFrom; dragFrom = null; if (from != null) move(from, i); });
      card.addEventListener('dblclick', (e) => { if (!e.target.closest('button, a, input, select')) editComponent(i); });
      grid.appendChild(card);
    });
    canvas.appendChild(grid);
    canvas.appendChild(h('button', { class: 'an-add-tile', type: 'button', disabled: dash.components.length >= 20, onClick: () => editComponent(-1) }, icon('plus'), 'Add Component'));
  }

  async function refreshComponent(c) {
    const res = await runReport(c.reportId);
    derived.set(c.id, deriveComponent(c, res, reportById.get(c.reportId)?.name));
  }
  async function refreshAll() {
    derived.clear();
    drawCanvas();
    await Promise.all(dash.components.map(refreshComponent));
    drawCanvas();
  }

  // ---------- add / edit component ----------
  const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function editComponent(index, preset = {}) {
    const isAdd = index < 0;
    if (isAdd && dash.components.length >= 20) { toast('Dashboards can have up to 20 components.', 'warning'); return; }
    const c = isAdd ? { id: newId(), reportId: preset.reportId || null, type: null, title: '', subtitle: '', size: 'medium', measure: null, gauge: null, footer: '' } : clone(dash.components[index]);
    let res = null;
    let titleTouched = !isAdd;

    // report list
    const rq = h('input', { class: 'input input-sm', placeholder: 'Search reports...', 'aria-label': 'Search reports', autocomplete: 'off' });
    const rlist = h('div', { class: 'an-report-pick', role: 'listbox', 'aria-label': 'Source report' });
    const drawReports = () => {
      clear(rlist);
      const t = rq.value.trim().toLowerCase();
      const items = reports.filter((r) => !t || r.name.toLowerCase().includes(t) || (r.folder || '').toLowerCase().includes(t)).slice(0, 100);
      if (!items.length) rlist.appendChild(h('div', { class: 'muted small p-16' }, 'No reports found.'));
      items.forEach((r) => rlist.appendChild(h('button', { class: ['an-report-opt', r.id === c.reportId && 'active'], type: 'button', role: 'option', 'aria-selected': String(r.id === c.reportId), onClick: () => selectReport(r.id) },
        icon('chart', { size: 14 }), h('span', { class: 'grow truncate' }, r.name), h('span', { class: 'muted tiny' }, `${FORMAT_LABELS[r.format] || ''} · ${r.folder}`))));
    };
    rq.addEventListener('input', drawReports);

    const typeHost = h('div', { class: 'an-type-tiles' });
    const measureSel = h('select', { class: 'input input-sm', id: 'an-c-measure', onChange: () => { c.measure = measureSel.value || null; drawPreview(); } });
    const titleIn = h('input', { class: 'input input-sm', id: 'an-c-title', value: c.title, onInput: () => { c.title = titleIn.value; titleTouched = true; drawPreviewSoon(); } });
    const subIn = h('input', { class: 'input input-sm', id: 'an-c-sub', value: c.subtitle, onInput: () => { c.subtitle = subIn.value; drawPreviewSoon(); } });
    const footIn = h('input', { class: 'input input-sm', id: 'an-c-foot', value: c.footer, onInput: () => { c.footer = footIn.value; drawPreviewSoon(); } });
    const sizeSel = h('select', { class: 'input input-sm', id: 'an-c-size', onChange: () => { c.size = sizeSel.value; drawPreview(); } },
      [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large (2 columns)']].map(([v, l]) => h('option', { value: v, selected: c.size === v }, l)));
    const g = c.gauge || {};
    const num = (id, label, val) => { const el = h('input', { class: 'input input-sm', id, type: 'number', value: val ?? '', step: 'any' }); el.addEventListener('input', () => { readGauge(); drawPreviewSoon(); }); return [h('label', { class: 'form-label', for: id }, label), el]; };
    const [gMinL, gMin] = num('an-g-min', 'Minimum', g.min ?? 0);
    const [gB1L, gB1] = num('an-g-b1', 'Breakpoint 1', g.breakpoints?.[0]);
    const [gB2L, gB2] = num('an-g-b2', 'Breakpoint 2', g.breakpoints?.[1]);
    const [gMaxL, gMax] = num('an-g-max', 'Maximum', g.max);
    const gaugeBox = h('div', { class: 'an-gauge-fields' },
      h('div', { class: 'form-label' }, 'Gauge Ranges'),
      h('div', { class: 'an-gauge-grid' }, h('div', gMinL, gMin), h('div', gB1L, gB1), h('div', gB2L, gB2), h('div', gMaxL, gMax)),
      h('div', { class: 'an-gauge-legend small' }, h('span', h('i', { style: { background: 'var(--an-bad)' } }), 'Min → Breakpoint 1'), h('span', h('i', { style: { background: 'var(--an-warn)' } }), '→ Breakpoint 2'), h('span', h('i', { style: { background: 'var(--an-good)' } }), '→ Max')));
    const readGauge = () => {
      const n = (el) => (el.value === '' ? null : Number(el.value));
      c.gauge = { min: n(gMin) ?? 0, max: n(gMax), breakpoints: [n(gB1), n(gB2)].filter((x) => x != null) };
    };

    const previewHost = h('div', { class: 'an-modal-preview' });
    const formHost = h('div', { class: 'an-comp-form' });
    const drawPreview = () => {
      if (!c.reportId) { mount(previewHost, h('div', { class: 'an-preview-placeholder' }, emptyState('Choose a source report', 'A preview of the component appears here.', { iconName: 'chart' }))); return; }
      if (!res) { mount(previewHost, spinner()); return; }
      const data = deriveComponent({ ...c, type: c.type || 'metric' }, res, reportById.get(c.reportId)?.name);
      mount(previewHost, h('div', { class: `an-preview-frame size-${c.size}` }, componentCard(data, { preview: true })));
    };
    const drawPreviewSoon = debounce(drawPreview, 200);

    const drawTypes = () => {
      const grouped = !!(res && !res.error && res.chart);
      clear(typeHost);
      COMPONENT_TYPES.forEach((t) => {
        const disabled = t.needsGroups && res && !grouped;
        typeHost.appendChild(h('button', {
          class: ['an-chart-opt', c.type === t.id && 'active'], type: 'button', disabled, 'aria-pressed': String(c.type === t.id),
          title: disabled ? 'The source report needs a grouping for this chart type' : t.label,
          onClick: () => { c.type = t.id; drawTypes(); drawForm(); drawPreview(); },
        }, icon(t.icon, { size: 16 }), h('span', t.label)));
      });
      if (res && !grouped && !res.error) typeHost.appendChild(h('div', { class: 'form-help', style: { gridColumn: '1 / -1' } }, 'This report has no groupings, so only metric, gauge and table are available.'));
    };

    const drawForm = () => {
      const ready = c.reportId && res && !res.error;
      clear(measureSel);
      if (ready) {
        measureSel.appendChild(h('option', { value: '' }, `Default (${(res.aggregates.find((a) => a.key === (res.chart?.measure?.key || res.aggregates[1]?.key)) || res.aggregates[0]).label})`));
        res.aggregates.forEach((a) => measureSel.appendChild(h('option', { value: a.key, selected: c.measure === a.key }, a.label)));
      }
      gaugeBox.classList.toggle('hidden', c.type !== 'gauge');
      mount(formHost,
        h('div', { class: 'form-row' }, h('label', { class: 'form-label' }, h('span', { class: 'req' }, '*'), 'Source Report'),
          c.reportId && reportById.get(c.reportId) ? h('div', { class: 'an-selected-report' }, icon('chart', { size: 14 }), h('strong', { class: 'grow truncate' }, reportById.get(c.reportId).name), h('a', { href: `#/reports/${c.reportId}`, target: '_blank', class: 'small' }, 'Open')) : null,
          rq, rlist,
          res?.error ? h('div', { class: 'form-error' }, res.error) : null),
        h('div', { class: ['form-row', !ready && 'an-disabled'] }, h('div', { class: 'form-label' }, 'Display As'), typeHost),
        h('div', { class: ['form-grid', !ready && 'an-disabled'], style: { gap: '4px 12px' } },
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-c-measure' }, 'Measure'), measureSel,
            h('div', { class: 'form-help' }, c.type && !['metric', 'gauge', 'table'].includes(c.type) ? "Charts plot the source report's chart measure." : 'Value shown by the metric, gauge or table.')),
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-c-size' }, 'Size'), sizeSel)),
        gaugeBox,
        h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-c-title' }, 'Title'), titleIn),
        h('div', { class: 'form-grid', style: { gap: '4px 12px' } },
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-c-sub' }, 'Subtitle'), subIn),
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-c-foot' }, 'Footer'), footIn)));
    };

    async function selectReport(id) {
      c.reportId = id;
      res = null;
      const rep = reportById.get(id);
      if (!titleTouched) { c.title = rep?.name || ''; titleIn.value = c.title; }
      drawReports(); drawForm(); drawPreview();
      res = await runReport(id);
      if (c.reportId !== id) return;
      if (res.error) { c.type = c.type || 'metric'; }
      else {
        const grouped = !!res.chart;
        if (!c.type || (!grouped && !['metric', 'gauge', 'table'].includes(c.type))) c.type = grouped ? (res.chart.type && res.chart.type !== 'none' ? res.chart.type : 'column') : 'metric';
        if (c.measure && !res.aggregates.some((a) => a.key === c.measure)) c.measure = null;
      }
      drawTypes(); drawForm(); drawPreview();
    }

    const m = modal({
      title: isAdd ? 'Add Component' : 'Edit Component', size: 'xl',
      body: h('div', { class: 'an-comp-editor' }, formHost, h('div', { class: 'an-comp-editor-preview' }, h('div', { class: 'form-label' }, 'Preview'), previewHost)),
      footer: [
        h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn btn-brand', onClick: () => {
          if (!c.reportId) { m.setError('Choose a source report.'); return; }
          if (!c.type) { m.setError('Choose how to display the data.'); return; }
          if (c.type === 'gauge') {
            readGauge();
            const { min, max, breakpoints } = c.gauge;
            if (max != null && max <= min) { m.setError('The gauge maximum must be greater than the minimum.'); return; }
            if (breakpoints.some((b) => b <= min || (max != null && b >= max))) { m.setError('Breakpoints must be between the minimum and maximum.'); return; }
            if (breakpoints.length === 2 && breakpoints[0] >= breakpoints[1]) { m.setError('Breakpoint 1 must be lower than breakpoint 2.'); return; }
          } else c.gauge = null;
          c.title = c.title.trim() || reportById.get(c.reportId)?.name || '';
          const def = pickDef(c);
          if (isAdd) dash.components.push(def); else dash.components[index] = def;
          derived.set(def.id, deriveComponent(def, res, reportById.get(def.reportId)?.name));
          mark(); m.close(); drawCanvas();
          if (!res) refreshComponent(def).then(drawCanvas);
        } }, isAdd ? 'Add' : 'Update'),
      ],
    });
    drawReports(); drawTypes(); drawForm(); drawPreview();
    if (c.reportId) selectReport(c.reportId);
    else setTimeout(() => rq.focus(), 40);
  }

  // ---------- save / cancel ----------
  async function save() {
    if (!dash.name.trim()) { toast('Enter a dashboard name.', 'error'); nameInput.classList.add('invalid'); nameInput.focus(); return; }
    nameInput.classList.remove('invalid');
    if (dash.runningUser == null) { toast('Choose the running user, or switch to "Me — the dashboard viewer".', 'error'); return; }
    const body = { ...dash, name: dash.name.trim(), folder: dash.folder.trim(), components: dash.components.map(pickDef) };
    saveBtn.disabled = true;
    try {
      const saved = existing ? await PUT(`/api/dashboards/${existing.id}`, body) : await POST('/api/dashboards', body);
      dirty = false;
      toast(`Dashboard "${saved.name}" was saved.`, 'success');
      app.navigate(`/dashboards/${saved.id}`);
    } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
  }
  async function cancel() {
    if (dirty && !(await confirmDialog('Discard your unsaved changes to this dashboard?', { title: 'Discard Changes', confirmLabel: 'Discard', danger: true }))) return;
    dirty = false;
    app.navigate(existing ? `/dashboards/${existing.id}` : '/dashboards');
  }
  const saveBtn = h('button', { class: 'btn btn-brand', onClick: save }, 'Save');

  mount(root, h('div', { class: 'an-dash-builder' },
    h('div', { class: 'page-header an-page-header' },
      h('div', { class: 'title-row' },
        h('div', { class: 'an-hero-icon dash' }, icon('dashboard')),
        h('div', { class: 'grow' },
          h('div', { class: 'eyebrow' }, h('a', { href: '#/dashboards' }, 'Dashboards'), isNew ? ' › New Dashboard' : ' › Edit Dashboard'),
          h('div', { class: 'row gap-4' }, titleEl, dirtyBadge)),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onClick: () => editComponent(-1) }, icon('plus'), 'Add Component'),
          h('button', { class: 'btn', onClick: refreshAll, title: 'Re-run all source reports' }, icon('refresh'), 'Refresh'),
          h('button', { class: 'btn', onClick: cancel }, 'Cancel'),
          saveBtn))),
    h('div', { class: 'an-dash-builder-body' },
      h('aside', { class: 'card an-dash-props' },
        h('div', { class: 'card-header' }, h('h3', 'Properties')),
        h('div', { class: 'card-body' },
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-d-name' }, h('span', { class: 'req' }, '*'), 'Name'), nameInput),
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-d-desc' }, 'Description'), descInput),
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-d-folder' }, 'Folder'), folderInput, h('datalist', { id: 'an-dash-folders' }, folders.map((f) => h('option', { value: f })))),
          h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'an-d-vis' }, 'Visibility'), visSel),
          h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'Layout'), colsGroup),
          h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'View Dashboard As'), ruHost))),
      h('section', { class: 'card an-dash-canvas' },
        h('div', { class: 'card-header' }, h('h3', 'Components'), countBadge, h('span', { class: 'muted small' }, 'Drag cards or use the arrows to reorder. Double-click to edit.')),
        h('div', { class: 'card-body' }, canvas)))));

  drawCanvas();
  refreshAll();
  if (query.report && reportById.has(query.report)) {
    if (isNew && !dash.name) { dash.name = `${reportById.get(query.report).name} Dashboard`; nameInput.value = dash.name; titleEl.textContent = dash.name; }
    editComponent(-1, { reportId: query.report });
  }
  if (isNew && !query.report) setTimeout(() => nameInput.focus(), 30);

  const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onUnload);
  return () => window.removeEventListener('beforeunload', onUnload);
}
