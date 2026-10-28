// Report builder: pick a report type (object), then edit outline (groups, columns, summaries, chart) and filters
// with a live, debounced preview rendered by the same code as the report run page.
import { h, icon, mount, clear, modal, confirmDialog, toast, showMenu, closeMenu, spinner, emptyState, debounce, objIcon, badge } from '../lib.js';
import { GET, POST, PUT, state, can, getObj, pathOptions, fieldAtPath } from '../api.js';
import { effectiveType, isNumeric } from '../fields.js';
import { filterEditor } from '../components/filters.js';
import { renderChart, CHART_TYPES } from '../charts.js';
import { renderReportTable, renderTotals, normalizeResult, chartTitle, FORMAT_LABELS } from './report-view.js';

const OPS = [{ op: 'sum', label: 'Sum' }, { op: 'avg', label: 'Average' }, { op: 'min', label: 'Min' }, { op: 'max', label: 'Max' }];
const GRANULARITIES = [['day', 'Day'], ['week', 'Week'], ['month', 'Calendar Month'], ['quarter', 'Calendar Quarter'], ['year', 'Calendar Year']];
const aggKey = (a) => (a.op === 'count' ? 'COUNT' : `${a.op.toUpperCase()}:${a.field}`);
const clone = (x) => JSON.parse(JSON.stringify(x));
const readable = (o) => o.field?.access?.read !== false;
const isDateField = (f) => ['Date', 'DateTime'].includes(effectiveType(f));

function newDef(objApi) {
  const obj = getObj(objApi);
  const cols = (obj.listColumns || ['Name']).filter((p) => fieldAtPath(objApi, p));
  return {
    name: '', description: '', folder: '', visibility: 'private', object: obj.apiName, format: 'tabular',
    columns: cols.length ? cols : ['Name'], filters: [], filterLogic: '', scope: 'all', groupings: [], colGroupings: [],
    aggregates: [], sort: null, rowLimit: null, chart: null, showDetails: true,
  };
}

// Searchable, grouped field picker in a popover. onPick(path)
export function fieldPicker(anchor, { objApi, filter, exclude, onPick, placeholder = 'Search fields...' }) {
  const opts = pathOptions(objApi).filter(readable).filter((o) => (!filter || filter(o.field, o)) && !exclude?.has(o.path));
  const input = h('input', { class: 'input input-sm', placeholder, 'aria-label': 'Search fields', autocomplete: 'off' });
  const list = h('div', { class: 'an-picker-list', role: 'listbox' });
  let first = null;
  const draw = () => {
    clear(list);
    const term = input.value.trim().toLowerCase();
    const matches = opts.filter((o) => !term || o.label.toLowerCase().includes(term) || o.path.toLowerCase().includes(term));
    first = matches[0] || null;
    if (!matches.length) { list.appendChild(h('div', { class: 'muted small', style: { padding: '8px 10px' } }, 'No matching fields')); return; }
    let group = null;
    for (const o of matches.slice(0, 300)) {
      if (o.group !== group) { group = o.group; list.appendChild(h('div', { class: 'menu-header' }, group)); }
      list.appendChild(h('button', { class: 'menu-item', type: 'button', role: 'option', onClick: () => { closeMenu(); onPick(o.path); } },
        h('span', { class: 'grow truncate' }, o.field.label), h('span', { class: 'muted tiny' }, effectiveType(o.field))));
    }
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && first) { e.preventDefault(); closeMenu(); onPick(first.path); } });
  draw();
  showMenu(anchor, [{ node: h('div', { class: 'an-picker' }, input, list) }], { width: 320 });
  setTimeout(() => input.focus(), 20);
}

function pickObject(root, app) {
  app.setTitle('New Report');
  const objs = [...state.objects.values()].filter((o) => o.perms?.read).sort((a, b) => a.label.localeCompare(b.label));
  const q = h('input', { class: 'input', placeholder: 'Search report types...', 'aria-label': 'Search report types', autocomplete: 'off' });
  const grid = h('div', { class: 'an-type-grid' });
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    const list = objs.filter((o) => !t || o.label.toLowerCase().includes(t) || o.pluralLabel.toLowerCase().includes(t) || o.apiName.toLowerCase().includes(t));
    clear(grid);
    if (!list.length) { grid.appendChild(emptyState('No report types found', 'Try a different search.')); return; }
    list.forEach((o) => grid.appendChild(h('button', { class: 'an-type-card', type: 'button', onClick: () => app.navigate(`/reports/new?object=${encodeURIComponent(o.apiName)}`) },
      objIcon(o, 'lg'), h('div', { class: 'grow' }, h('div', { class: 'strong' }, o.pluralLabel), h('div', { class: 'muted small' }, o.isCustom ? 'Custom object' : 'Standard object')), icon('chevronRight'))));
  };
  q.addEventListener('input', draw);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') grid.querySelector('.an-type-card')?.click(); });
  draw();
  mount(root, h('div', { class: 'an-type-picker' },
    h('div', { class: 'page-header an-page-header' }, h('div', { class: 'title-row' }, h('div', { class: 'an-hero-icon' }, icon('chart')),
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, h('a', { href: '#/reports' }, 'Reports'), ' › New Report'), h('h1', 'Choose a Report Type')),
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/reports' }, 'Cancel')))),
    h('div', { class: 'card' }, h('div', { class: 'card-body' },
      h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'A report type decides which records your report returns. Pick the object you want to report on; you can add fields from related parent records later.'),
      h('div', { class: 'input-group mb-16' }, icon('search'), q), grid))));
  setTimeout(() => q.focus(), 30);
}

export default async function reportBuilder(root, { params, query, app }) {
  if (!can('ManageReports')) {
    app.setTitle('Report Builder');
    mount(root, h('div', { class: 'card' }, emptyState('Insufficient privileges', 'You need the Manage Reports permission to create or edit reports.', { iconName: 'lock' })));
    return;
  }
  const isNew = params.id === 'new';
  let existing = null, def;
  if (isNew) {
    if (!query.object || !getObj(query.object)) return pickObject(root, app);
    def = newDef(query.object);
  } else {
    mount(root, spinner());
    existing = await GET(`/api/reports/${encodeURIComponent(params.id)}`);
    def = clone({
      name: existing.name, description: existing.description, folder: existing.folder, visibility: existing.visibility, object: existing.object,
      format: existing.format, columns: existing.columns || [], filters: existing.filters || [], filterLogic: existing.filterLogic || '', scope: existing.scope,
      groupings: existing.groupings || [], colGroupings: existing.colGroupings || [], aggregates: existing.aggregates || [], sort: existing.sort || null,
      rowLimit: existing.rowLimit || null, chart: existing.chart || null, showDetails: existing.showDetails !== false,
    });
  }
  const obj = getObj(def.object);
  if (!obj) throw Object.assign(new Error(`The report type ${def.object} is not available.`), { status: 404 });
  const readOnly = existing && !existing.canEdit;
  app.setTitle(isNew ? 'New Report' : `Edit: ${def.name}`);

  let dirty = false, tab = 'outline', autoPreview = true, pendingPicker = null;
  const stash = { groupings: [], colGroupings: [] };

  // ---------- header ----------
  const titleEl = h('h1', { class: 'truncate' });
  const formatGroup = h('div', { class: 'btn-group', role: 'group', 'aria-label': 'Report format' });
  const dirtyBadge = h('span', { class: 'badge warning hidden' }, 'Unsaved changes');
  const drawHeader = () => {
    titleEl.textContent = def.name || 'New Report';
    clear(formatGroup);
    for (const f of ['tabular', 'summary', 'matrix']) {
      formatGroup.appendChild(h('button', { class: ['btn btn-sm', def.format === f && 'active'], type: 'button', 'aria-pressed': String(def.format === f), onClick: () => setFormat(f) }, FORMAT_LABELS[f]));
    }
    dirtyBadge.classList.toggle('hidden', !dirty);
  };

  const side = h('div', { class: 'an-side-body' });
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const previewBody = h('div', { class: 'an-preview-body' });
  const previewStatus = h('span', { class: 'muted small' });

  function changed({ redraw = true, preview = true } = {}) {
    dirty = true;
    drawHeader();
    if (redraw) drawSide();
    if (preview && autoPreview) schedulePreview();
    else if (preview) previewStatus.textContent = 'Preview out of date';
  }

  // ---------- format ----------
  function setFormat(f) {
    if (f === def.format) return;
    if (f === 'tabular') {
      stash.groupings = def.groupings; stash.colGroupings = def.colGroupings;
      def.groupings = []; def.colGroupings = [];
    } else {
      if (!def.groupings.length && stash.groupings.length) def.groupings = stash.groupings;
      if (f === 'summary') {
        if (def.colGroupings.length) stash.colGroupings = def.colGroupings;
        def.colGroupings = [];
        def.groupings = def.groupings.slice(0, 3);
      } else {
        if (!def.colGroupings.length && stash.colGroupings.length) def.colGroupings = stash.colGroupings;
        if (def.groupings.length > 1) { stash.groupings = def.groupings; def.groupings = def.groupings.slice(0, 1); }
      }
      if (!def.chart) def.chart = { type: 'column' };
    }
    def.format = f;
    tab = 'outline';
    pendingPicker = f !== 'tabular' && !def.groupings.length ? 'rows' : f === 'matrix' && !def.colGroupings.length ? 'cols' : null;
    changed();
    if (pendingPicker) {
      const target = side.querySelector(`[data-add="${pendingPicker}"]`);
      pendingPicker = null;
      if (target) setTimeout(() => target.click(), 60);
    }
  }

  // ---------- side panel ----------
  const sectionEl = (title, count, ...children) => h('section', { class: 'an-section' }, h('div', { class: 'an-section-title' }, h('span', { class: 'grow' }, title), count != null ? h('span', { class: 'badge' }, count) : null), children);
  const fieldLabel = (p) => fieldAtPath(def.object, p)?.fullLabel || p;
  const moveBtns = (list, i, label) => [
    h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', disabled: i === 0, 'aria-label': `Move ${label} up`, title: 'Move up', onClick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; changed(); } }, icon('arrowUp', { size: 14 })),
    h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', disabled: i === list.length - 1, 'aria-label': `Move ${label} down`, title: 'Move down', onClick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; changed(); } }, icon('arrowDown', { size: 14 })),
  ];
  const removeBtn = (label, fn) => h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', 'aria-label': `Remove ${label}`, title: 'Remove', onClick: fn }, icon('x', { size: 14 }));
  const groupable = (f) => f && !['TextArea', 'LongTextArea', 'MultiPicklist', 'Id'].includes(effectiveType(f));

  function groupItems(list, kind) {
    return list.map((g, i) => {
      const f = fieldAtPath(def.object, g.field);
      const label = fieldLabel(g.field);
      return h('div', { class: 'an-item an-item-group' },
        h('div', { class: 'row gap-4' }, h('span', { class: 'an-item-level' }, kind === 'cols' ? 'C' : i + 1), h('span', { class: 'grow truncate strong', title: label }, label),
          kind === 'rows' && list.length > 1 ? moveBtns(list, i, label) : null,
          removeBtn(label, () => { list.splice(i, 1); changed(); })),
        h('div', { class: 'row gap-4 mt-8' },
          f && isDateField(f) ? h('select', { class: 'input input-sm', 'aria-label': `Group ${label} by`, onChange: (e) => { g.dateGranularity = e.target.value; changed(); } },
            GRANULARITIES.map(([v, l]) => h('option', { value: v, selected: (g.dateGranularity || 'day') === v }, l))) : null,
          h('div', { class: 'btn-group' },
            h('button', { class: ['btn btn-sm', g.sortDir !== 'desc' && 'active'], type: 'button', 'aria-pressed': String(g.sortDir !== 'desc'), title: 'Sort ascending', onClick: () => { g.sortDir = 'asc'; changed(); } }, icon('arrowUp', { size: 12 }), 'Asc'),
            h('button', { class: ['btn btn-sm', g.sortDir === 'desc' && 'active'], type: 'button', 'aria-pressed': String(g.sortDir === 'desc'), title: 'Sort descending', onClick: () => { g.sortDir = 'desc'; changed(); } }, icon('arrowDown', { size: 12 }), 'Desc'))));
    });
  }

  function addGroupButton(list, kind, max) {
    const used = new Set([...def.groupings, ...def.colGroupings].map((g) => g.field));
    return h('button', {
      class: 'btn btn-sm an-add-btn', type: 'button', disabled: list.length >= max, dataset: { add: kind },
      onClick: (e) => fieldPicker(e.currentTarget, {
        objApi: def.object, filter: groupable, exclude: used, placeholder: 'Add group...',
        onPick: (path) => {
          const f = fieldAtPath(def.object, path);
          list.push({ field: path, sortDir: 'asc', ...(f && isDateField(f) ? { dateGranularity: 'month' } : {}) });
          if (def.format === 'tabular') { def.format = 'summary'; if (!def.chart) def.chart = { type: 'column' }; }
          changed();
        },
      }),
    }, icon('plus', { size: 14 }), kind === 'cols' ? 'Add column group' : 'Add group');
  }

  function outlineTab() {
    const out = [];
    // groups
    const maxRows = def.format === 'matrix' ? 1 : 3;
    out.push(sectionEl(def.format === 'matrix' ? 'Group Rows' : 'Groups', `${def.groupings.length}/${maxRows}`,
      def.format !== 'tabular' && !def.groupings.length ? h('div', { class: 'alert warning an-mini-alert' }, icon('alert'), h('div', `Add a group to make this a ${def.format} report.`)) : null,
      def.format === 'tabular' ? h('div', { class: 'muted small mb-8' }, 'Adding a group turns this into a summary report.') : null,
      groupItems(def.groupings, 'rows'),
      addGroupButton(def.groupings, 'rows', maxRows)));
    if (def.format === 'matrix') {
      out.push(sectionEl('Group Columns', `${def.colGroupings.length}/1`,
        !def.colGroupings.length ? h('div', { class: 'alert warning an-mini-alert' }, icon('alert'), h('div', 'Add a column group to build the matrix.')) : null,
        groupItems(def.colGroupings, 'cols'), addGroupButton(def.colGroupings, 'cols', 1)));
    }
    // columns
    const colSet = new Set(def.columns);
    out.push(sectionEl('Columns', def.columns.length,
      !def.columns.length ? h('div', { class: 'muted small mb-8' }, `No columns selected. The ${obj.nameField?.label || 'Name'} column will be shown.`) : null,
      h('div', { class: 'an-col-list' }, def.columns.map((p, i) => h('div', { class: 'an-item row gap-4' },
        h('span', { class: 'grow truncate', title: fieldLabel(p) }, fieldLabel(p)), moveBtns(def.columns, i, fieldLabel(p)),
        removeBtn(fieldLabel(p), () => {
          def.columns.splice(i, 1);
          if (def.sort?.field === p) def.sort = null;
          changed();
        })))),
      h('div', { class: 'row gap-4' },
        h('button', { class: 'btn btn-sm an-add-btn', type: 'button', disabled: def.columns.length >= 50, onClick: (e) => fieldPicker(e.currentTarget, { objApi: def.object, exclude: colSet, placeholder: 'Add column...', onPick: (path) => { def.columns.push(path); changed(); } }) }, icon('plus', { size: 14 }), 'Add column'),
        def.columns.length ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => { def.columns = []; def.sort = null; changed(); } }, 'Remove all') : null)));
    // summaries
    const aggKeys = new Set(def.aggregates.map(aggKey));
    out.push(sectionEl('Summaries', def.aggregates.length + 1,
      h('div', { class: 'an-item row gap-4' }, icon('list', { size: 14 }), h('span', { class: 'grow' }, 'Record Count'), h('span', { class: 'muted tiny' }, 'Always')),
      def.aggregates.map((a, i) => h('div', { class: 'an-item row gap-4' },
        h('select', { class: 'input input-sm', style: { width: '96px' }, 'aria-label': 'Summary function', onChange: (e) => {
          const next = { op: e.target.value, field: a.field };
          if (aggKeys.has(aggKey(next))) { toast('That summary already exists.', 'warning'); e.target.value = a.op; return; }
          const oldKey = aggKey(a);
          a.op = next.op;
          if (def.chart?.measure === oldKey) def.chart.measure = aggKey(a);
          changed();
        } }, OPS.map((o) => h('option', { value: o.op, selected: o.op === a.op }, o.label))),
        h('span', { class: 'grow truncate', title: fieldLabel(a.field) }, fieldLabel(a.field)),
        removeBtn(`${a.op} of ${fieldLabel(a.field)}`, () => {
          if (def.chart?.measure === aggKey(a)) delete def.chart.measure;
          def.aggregates.splice(i, 1); changed();
        }))),
      h('button', { class: 'btn btn-sm an-add-btn', type: 'button', disabled: def.aggregates.length >= 10, onClick: (e) => fieldPicker(e.currentTarget, {
        objApi: def.object, filter: (f) => isNumeric(f), placeholder: 'Summarize a number field...',
        onPick: (path) => {
          const op = OPS.find((o) => !aggKeys.has(aggKey({ op: o.op, field: path })));
          if (!op) { toast('All summaries for that field are already added.', 'warning'); return; }
          def.aggregates.push({ op: op.op, field: path });
          changed();
        },
      }) }, icon('plus', { size: 14 }), 'Add summary')));
    // sort (tabular)
    if (def.format === 'tabular') {
      const cols = def.columns.length ? def.columns : ['Name'];
      out.push(sectionEl('Sort Rows', null, h('div', { class: 'row gap-4' },
        h('select', { class: 'input input-sm', 'aria-label': 'Sort by', onChange: (e) => { def.sort = e.target.value ? { field: e.target.value, dir: def.sort?.dir || 'asc' } : null; changed(); } },
          h('option', { value: '' }, `Default (${obj.nameField?.label || 'Name'})`), cols.map((p) => h('option', { value: p, selected: def.sort?.field === p }, fieldLabel(p)))),
        h('select', { class: 'input input-sm', style: { width: '120px' }, 'aria-label': 'Sort direction', disabled: !def.sort, onChange: (e) => { def.sort = { ...def.sort, dir: e.target.value }; changed(); } },
          h('option', { value: 'asc', selected: def.sort?.dir !== 'desc' }, 'Ascending'), h('option', { value: 'desc', selected: def.sort?.dir === 'desc' }, 'Descending')))));
    } else {
      out.push(sectionEl('Display', null,
        def.format === 'summary' ? h('label', { class: 'checkbox mb-8' }, h('input', { type: 'checkbox', checked: def.showDetails !== false, onChange: (e) => { def.showDetails = e.target.checked; changed({ redraw: false }); } }), 'Show detail rows') : null,
        h('div', { class: 'form-label' }, 'Chart'),
        h('div', { class: 'an-chart-picker' }, [{ id: 'none', label: 'None', icon: 'x' }, ...CHART_TYPES].map((t) => h('button', {
          class: ['an-chart-opt', (def.chart?.type || 'column') === t.id && 'active'], type: 'button', title: t.label, 'aria-pressed': String((def.chart?.type || 'column') === t.id),
          onClick: () => { def.chart = { ...(def.chart || {}), type: t.id }; changed(); },
        }, icon(t.icon, { size: 16 }), h('span', t.label)))),
        def.chart?.type !== 'none' ? h('div', { class: 'mt-8' }, h('label', { class: 'form-label', for: 'an-measure' }, 'Measure'),
          h('select', { class: 'input input-sm', id: 'an-measure', onChange: (e) => { def.chart = { ...(def.chart || { type: 'column' }), measure: e.target.value }; changed({ redraw: false }); } },
            [{ key: 'COUNT', label: 'Record Count' }, ...def.aggregates.map((a) => ({ key: aggKey(a), label: `${OPS.find((o) => o.op === a.op)?.label} of ${fieldLabel(a.field)}` }))]
              .map((m) => h('option', { value: m.key, selected: (def.chart?.measure || (def.aggregates[0] ? aggKey(def.aggregates[0]) : 'COUNT')) === m.key }, m.label)))) : null));
    }
    return out;
  }

  function filtersTab() {
    const fe = filterEditor({ objApi: def.object, filters: def.filters, logic: def.filterLogic, title: 'Field Filters', onChange: ({ filters, filterLogic }) => {
      def.filters = filters.map((f) => ({ ...f })); def.filterLogic = filterLogic; changed({ redraw: false });
      tabBar.querySelector('[data-tab="filters"] .badge')?.replaceChildren(String(def.filters.length));
    } });
    const limit = h('input', { class: 'input input-sm', id: 'an-row-limit', type: 'number', min: 1, max: 2000, placeholder: 'No limit', value: def.rowLimit ?? '',
      onChange: (e) => { const v = parseInt(e.target.value, 10); def.rowLimit = v > 0 ? v : null; changed({ redraw: false }); } });
    return [
      sectionEl('Show Me', null, h('div', { class: 'btn-group' },
        [['all', `All ${obj.pluralLabel.toLowerCase()}`], ['mine', `My ${obj.pluralLabel.toLowerCase()}`]].map(([v, l]) => h('button', {
          class: ['btn btn-sm', (def.scope || 'all') === v && 'active'], type: 'button', 'aria-pressed': String((def.scope || 'all') === v), onClick: () => { def.scope = v; changed(); },
        }, l)))),
      h('section', { class: 'an-section' }, fe.el),
      sectionEl('Row Limit', null, limit, h('div', { class: 'form-help' }, 'Only the first N records (after sorting) are included.')),
    ];
  }

  function drawSide() {
    clear(tabBar);
    for (const [id, label, count] of [['outline', 'Outline', null], ['filters', 'Filters', def.filters.length]]) {
      tabBar.appendChild(h('button', { class: ['tab', tab === id && 'active'], role: 'tab', 'aria-selected': String(tab === id), dataset: { tab: id }, onClick: () => { tab = id; drawSide(); } },
        label, count != null ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, String(count)) : null));
    }
    mount(side, tab === 'outline' ? outlineTab() : filtersTab());
  }

  // ---------- preview ----------
  let seq = 0;
  const payload = () => ({ ...def, name: def.name || 'New Report' });
  async function runPreview() {
    const my = ++seq;
    previewStatus.textContent = 'Updating…';
    previewBody.classList.add('an-busy');
    try {
      const result = normalizeResult(await POST('/api/reports/run', payload()), def);
      if (my !== seq) return;
      drawPreview(result);
      previewStatus.textContent = `${result.total} record${result.total === 1 ? '' : 's'}`;
    } catch (e) {
      if (my !== seq) return;
      mount(previewBody, h('div', { class: 'p-16' }, h('div', { class: 'alert danger' }, icon('alert'), h('div', h('strong', 'Preview failed. '), e.message))));
      previewStatus.textContent = 'Error';
    } finally {
      if (my === seq) previewBody.classList.remove('an-busy');
    }
  }
  const schedulePreview = debounce(runPreview, 450);

  function drawPreview(result) {
    const grouped = !!(result.groups || result.matrix);
    const needsGroup = def.format !== 'tabular' && !grouped;
    mount(previewBody,
      needsGroup ? h('div', { class: 'alert warning', style: { margin: '12px 16px 0' } }, icon('info'), h('div', `Add ${def.format === 'matrix' && def.groupings.length ? 'a column group' : 'a group'} to see the ${def.format} layout. Showing rows for now.`)) : null,
      h('div', { class: 'an-preview-totals' }, renderTotals(result)),
      grouped && result.chart ? h('div', { class: 'an-preview-chart' }, h('div', { class: 'small strong mb-8' }, chartTitle(result)), renderChart(result.chart, { height: 240 })) : null,
      renderReportTable(result, { showDetails: def.showDetails !== false, maxHeight: '520px' }).el);
  }

  // ---------- save / run ----------
  let folderCache = null;
  async function propertiesDialog({ save = false, andRun = false } = {}) {
    if (!folderCache) folderCache = await GET('/api/reports').then((l) => [...new Set(l.map((r) => r.folder).filter(Boolean))].sort()).catch(() => []);
    const asCopy = readOnly;
    const name = h('input', { class: 'input', id: 'an-r-name', value: def.name, maxlength: 120, required: true });
    const desc = h('textarea', { class: 'input', id: 'an-r-desc', rows: 3 });
    desc.value = def.description || '';
    const folder = h('input', { class: 'input', id: 'an-r-folder', value: def.folder && !['Private', 'Public'].includes(def.folder) ? def.folder : '', list: 'an-report-folders', placeholder: 'e.g. Sales Reports' });
    const vis = h('select', { class: 'input', id: 'an-r-vis' }, h('option', { value: 'private', selected: def.visibility !== 'public' }, 'Private — only you'), h('option', { value: 'public', selected: def.visibility === 'public' }, 'Public — everyone who can run reports'));
    return new Promise((resolve) => {
      let result = null;
      const go = async (btn) => {
        if (!name.value.trim()) { m.setError('Enter a report name.'); name.classList.add('invalid'); name.focus(); return; }
        Object.assign(def, { name: name.value.trim(), description: desc.value.trim(), folder: folder.value.trim(), visibility: vis.value });
        if (!save) { result = true; m.close(); changed({ redraw: false, preview: false }); return; }
        btn.disabled = true;
        try {
          const saved = await persist(asCopy);
          result = saved; m.close();
          afterSave(saved, andRun);
        } catch (e) { m.setError(e.message); btn.disabled = false; }
      };
      const saveBtn = h('button', { class: 'btn btn-brand', onClick: (e) => go(e.currentTarget) }, save ? (andRun ? 'Save & Run' : 'Save') : 'Done');
      const m = modal({
        title: asCopy && save ? 'Save a Copy' : save ? 'Save Report' : 'Report Properties',
        body: h('div', { class: 'col gap-12' },
          asCopy && save ? h('div', { class: 'alert' }, icon('info'), h('div', "You can't edit the original report, so a copy will be saved.")) : null,
          h('div', h('label', { class: 'form-label', for: 'an-r-name' }, h('span', { class: 'req' }, '*'), 'Report Name'), name),
          h('div', h('label', { class: 'form-label', for: 'an-r-desc' }, 'Description'), desc),
          h('div', { class: 'form-grid', style: { gap: '4px 12px' } },
            h('div', h('label', { class: 'form-label', for: 'an-r-folder' }, 'Folder'), folder, h('datalist', { id: 'an-report-folders' }, folderCache.map((f) => h('option', { value: f })))),
            h('div', h('label', { class: 'form-label', for: 'an-r-vis' }, 'Visibility'), vis))),
        footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn],
        onClose: () => resolve(result),
      });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(saveBtn); });
    });
  }

  async function persist(asCopy) {
    const body = { ...def, name: def.name || 'Untitled Report' };
    return existing && !asCopy ? PUT(`/api/reports/${existing.id}`, body) : POST('/api/reports', body);
  }

  function afterSave(saved, andRun) {
    dirty = false;
    toast(`Report "${saved.name}" was saved.`, 'success');
    if (andRun) app.navigate(`/reports/${saved.id}`);
    else if (!existing || existing.id !== saved.id) app.navigate(`/reports/${saved.id}/edit`);
    else { existing = { ...existing, ...saved }; drawHeader(); }
  }

  async function save(andRun) {
    if (!existing || readOnly || !def.name) return propertiesDialog({ save: true, andRun });
    try { afterSave(await persist(false), andRun); } catch (e) { toast(e.message, 'error'); }
  }

  async function runNow() {
    if (existing && !dirty && !readOnly) { app.navigate(`/reports/${existing.id}`); return; }
    const body = h('div', spinner());
    modal({ title: `${def.name || 'New Report'} (unsaved)`, size: 'xl', body });
    try {
      const result = normalizeResult(await POST('/api/reports/run', payload()), def);
      const grouped = !!(result.groups || result.matrix);
      mount(body, renderTotals(result),
        grouped && result.chart ? h('div', { class: 'card mb-16' }, h('div', { class: 'card-header' }, h('h3', chartTitle(result))), h('div', { class: 'card-body' }, renderChart(result.chart, { height: 300 }))) : null,
        h('div', { class: 'card' }, renderReportTable(result, { showDetails: def.showDetails !== false, maxHeight: '60vh' }).el));
    } catch (e) {
      mount(body, h('div', { class: 'alert danger' }, icon('alert'), h('div', e.message)));
    }
  }

  async function cancel() {
    if (dirty && !(await confirmDialog('Discard your unsaved changes to this report?', { title: 'Discard Changes', confirmLabel: 'Discard', danger: true }))) return;
    dirty = false;
    app.navigate(existing ? `/reports/${existing.id}` : '/reports');
  }

  // ---------- layout ----------
  const autoToggle = h('label', { class: 'row gap-4 small', title: 'Update the preview automatically as you edit' },
    h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: autoPreview, onChange: (e) => { autoPreview = e.target.checked; if (autoPreview) runPreview(); } }), h('span')), 'Auto-update');

  mount(root, h('div', { class: 'an-builder' },
    h('div', { class: 'page-header an-page-header an-builder-header' },
      h('div', { class: 'title-row' },
        objIcon(obj, 'lg'),
        h('div', { class: 'grow' },
          h('div', { class: 'eyebrow' }, h('a', { href: '#/reports' }, 'Reports'), ` › Report: ${obj.pluralLabel}`),
          h('div', { class: 'row gap-4' }, titleEl,
            h('button', { class: 'btn btn-ghost btn-sm btn-icon', title: 'Edit name and properties', 'aria-label': 'Edit report name and properties', onClick: () => propertiesDialog() }, icon('edit', { size: 14 })),
            dirtyBadge)),
        h('div', { class: 'actions' },
          formatGroup,
          h('span', { class: 'an-divider' }),
          h('button', { class: 'btn', onClick: cancel }, 'Cancel'),
          h('button', { class: 'btn', onClick: runNow }, icon('play', { size: 14 }), 'Run'),
          h('button', { class: 'btn', onClick: () => save(false) }, readOnly ? 'Save As' : 'Save'),
          h('button', { class: 'btn btn-brand', onClick: () => save(true) }, readOnly ? 'Save As & Run' : 'Save & Run'))),
      readOnly ? h('div', { class: 'alert mt-8' }, icon('lock'), h('div', "You don't have access to change this report. Saving creates a copy you own.")) : null),
    h('div', { class: 'an-builder-body' },
      h('aside', { class: 'card an-builder-side' }, tabBar, side),
      h('div', { class: 'card an-builder-preview' },
        h('div', { class: 'card-header' }, h('h3', 'Preview'), previewStatus, autoToggle,
          h('button', { class: 'btn btn-sm', onClick: runPreview }, icon('refresh', { size: 14 }), 'Refresh')),
        previewBody))));

  drawHeader();
  drawSide();
  mount(previewBody, spinner());
  runPreview();

  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !document.querySelector('.modal-backdrop')) { e.preventDefault(); save(false); } };
  const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onUnload);
  return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); closeMenu(); };
}
