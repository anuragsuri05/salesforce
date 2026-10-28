// Run a saved report: header actions, filters summary, totals, chart and tabular/summary/matrix data.
// Also exports the shared result renderers used by the report builder's live preview.
import { h, icon, mount, clear, fmt, modal, confirmDialog, promptDialog, toast, showMenu, spinner, emptyState, downloadText, store, badge } from '../lib.js';
import { GET, POST, PUT, DEL, can, getObj, fieldAtPath } from '../api.js';
import { displayValue, effectiveType } from '../fields.js';
import { describeFilter } from '../components/filters.js';
import { renderChart, formatValue, CHART_TYPES } from '../charts.js';

export const FORMAT_LABELS = { tabular: 'Tabular', summary: 'Summary', matrix: 'Matrix' };
const DATE_TYPES = new Set(['Date', 'DateTime']);

// ---------- result helpers ----------
const aggField = (key) => (key.includes(':') ? key.slice(key.indexOf(':') + 1) : null);
const aggOp = (key) => (key.includes(':') ? key.slice(0, key.indexOf(':')) : 'COUNT');
const OP_SHORT = { SUM: 'Sum', AVG: 'Avg', MIN: 'Min', MAX: 'Max', COUNT: 'Count' };

export function formatAgg(meta, v) {
  if (v == null || v === '') return '—';
  return formatValue(v, meta);
}

function isDateGrouping(objApi, g) {
  const f = fieldAtPath(objApi, g.field);
  return !!f && DATE_TYPES.has(effectiveType(f));
}

const keyCmp = (a, b) => {
  if (a.key === '' && b.key !== '') return 1;
  if (b.key === '' && a.key !== '') return -1;
  return String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
};

// Date groups come back ordered by their label ("Aug 2026" < "Feb 2026"); order them chronologically by key instead
// and rebuild the chart series so lines and bars read left-to-right in time.
export function normalizeResult(result, def = {}) {
  if (!result || !result.groupings) return result;
  const objApi = result.object;
  const dirOf = (i, list) => (list?.[i]?.sortDir === 'desc' ? -1 : 1);
  if (result.groups) {
    const sortLevel = (groups, level) => {
      if (!groups) return;
      const g = result.groupings[level];
      if (g && isDateGrouping(objApi, g)) {
        const d = dirOf(level, def.groupings);
        groups.sort((a, b) => (a.key === '' || b.key === '' ? keyCmp(a, b) : keyCmp(a, b) * d));
      }
      groups.forEach((x) => sortLevel(x.children, level + 1));
    };
    sortLevel(result.groups, 0);
    if (result.chart) {
      const mk = result.chart.measure?.key || 'COUNT';
      result.chart = { ...result.chart, labels: result.groups.map((g) => g.label), series: [{ name: result.chart.measure?.label || 'Record Count', values: result.groups.map((g) => g.totals[mk] ?? 0) }] };
    }
  } else if (result.matrix) {
    const m = result.matrix;
    if (isDateGrouping(objApi, result.groupings[0])) m.rows.sort((a, b) => keyCmp(a, b) * (a.key && b.key ? dirOf(0, def.groupings) : 1));
    if (result.colGroupings?.[0] && isDateGrouping(objApi, result.colGroupings[0])) m.cols.sort((a, b) => keyCmp(a, b) * (a.key && b.key ? dirOf(0, def.colGroupings) : 1));
    if (result.chart) {
      const mk = result.chart.measure?.key || 'COUNT';
      result.chart = { ...result.chart, labels: m.rows.map((r) => r.label), series: m.cols.map((c) => ({ name: c.label, values: m.rows.map((r) => m.cells[`${r.key}|${c.key}`]?.[mk] ?? 0) })) };
    }
  }
  return result;
}

function colField(objApi, c) {
  return fieldAtPath(objApi, c.path) || { apiName: c.path, type: c.type, label: c.label };
}

function renderCell(objApi, c, fd, row) {
  const v = row[c.path];
  if ((c.path === 'Name' || (fd.isNameField && !c.path.includes('.'))) && v != null && v !== '' && row._id) {
    return h('a', { href: `#/r/${row._id}` }, String(v));
  }
  return displayValue(fd, v, row, { path: c.path });
}

const isNum = (fd) => ['Number', 'Currency', 'Percent'].includes(effectiveType(fd));

// Aggregates that line up under a report column vs. ones that don't (shown as chips next to the group label).
function aggLayout(result) {
  const aggs = (result.aggregates || []).filter((a) => a.key !== 'COUNT');
  const colPaths = new Set(result.columns.map((c) => c.path));
  const byCol = new Map();
  const loose = [];
  for (const a of aggs) {
    const f = aggField(a.key);
    if (colPaths.has(f)) { if (!byCol.has(f)) byCol.set(f, []); byCol.get(f).push(a); } else loose.push(a);
  }
  return { byCol, loose };
}

function aggCell(list, totals, cls = '') {
  if (!list?.length) return h('td', { class: cls });
  if (list.length === 1) return h('td', { class: ['num', cls], title: list[0].label }, formatAgg(list[0], totals?.[list[0].key]));
  return h('td', { class: ['num', cls] }, list.map((a) => h('div', { title: a.label }, h('span', { class: 'muted tiny' }, OP_SHORT[aggOp(a.key)] + ' '), formatAgg(a, totals?.[a.key]))));
}

function looseChips(loose, totals) {
  return loose.map((a) => h('span', { class: 'an-agg-chip', title: a.label }, h('span', { class: 'muted' }, a.label + ': '), formatAgg(a, totals?.[a.key])));
}

// Renders the data portion of a report result. Returns { el, expandAll, collapseAll }.
export function renderReportTable(result, { showDetails = true, showCounts = true, maxHeight } = {}) {
  const objApi = result.object;
  const cols = result.columns.map((c) => ({ ...c, fd: colField(objApi, c) }));
  const wrap = h('div', { class: 'table-wrap an-table-wrap', style: maxHeight ? { maxHeight } : null });
  const api = { el: wrap, expandAll() {}, collapseAll() {} };

  if (result.matrix) { wrap.appendChild(matrixTable(result)); return api; }

  if (result.groups) {
    const levels = result.groupings || [];
    const { byCol, loose } = aggLayout(result);
    const collapsed = new Set();
    const table = h('table', { class: 'table compact an-report-table an-summary' });
    const thead = h('thead', h('tr',
      levels.map((g) => h('th', { class: 'an-group-col' }, g.label, g.dateGranularity && g.dateGranularity !== 'day' ? h('span', { class: 'muted' }, ` (${g.dateGranularity})`) : null)),
      cols.map((c) => h('th', { class: isNum(c.fd) ? 'num' : '' }, c.label))));
    const tbody = h('tbody');
    table.append(thead, tbody);
    const allPaths = [];
    const draw = () => {
      clear(tbody);
      const walk = (groups, level, prefix) => {
        groups.forEach((g, i) => {
          const path = `${prefix}${i}`;
          allPaths.push(path);
          const isCollapsed = collapsed.has(path);
          const hasKids = (g.children && g.children.length) || (showDetails && g.rows && g.rows.length);
          const toggle = hasKids ? h('button', { class: 'an-caret', type: 'button', 'aria-expanded': String(!isCollapsed), 'aria-label': `${isCollapsed ? 'Expand' : 'Collapse'} ${g.label}`, onClick: () => { if (isCollapsed) collapsed.delete(path); else collapsed.add(path); draw(); } }, icon(isCollapsed ? 'chevronRight' : 'chevronDown', { size: 14 })) : h('span', { class: 'an-caret-spacer' });
          tbody.appendChild(h('tr', { class: ['an-group-row', `lvl-${level}`] },
            levels.map((_, k) => (k < level ? h('td', { class: 'an-indent' }) : k === level ? h('td', { class: 'an-group-label', colSpan: levels.length - level },
              h('div', { class: 'row gap-4' }, toggle, h('span', { class: 'strong' }, g.label), showCounts ? h('span', { class: 'an-count' }, `(${fmt.number(g.totals.COUNT)})`) : null, looseChips(loose, g.totals))) : null)),
            cols.map((c) => aggCell(byCol.get(c.path), g.totals))));
          if (isCollapsed) return;
          if (g.children) walk(g.children, level + 1, path + '/');
          else if (showDetails && g.rows) {
            for (const row of g.rows) {
              tbody.appendChild(h('tr', { class: 'an-detail-row' }, h('td', { class: 'an-indent', colSpan: levels.length }), cols.map((c) => h('td', { class: isNum(c.fd) ? 'num' : '' }, renderCell(objApi, c, c.fd, row)))));
            }
          }
        });
      };
      allPaths.length = 0;
      walk(result.groups, 0, '');
      tbody.appendChild(h('tr', { class: 'grand-total' },
        h('td', { colSpan: levels.length }, h('div', { class: 'row gap-4' }, h('span', 'Total'), showCounts ? h('span', { class: 'an-count' }, `(${fmt.number(result.total)})`) : null, looseChips(loose, result.grandTotals))),
        cols.map((c) => aggCell(byCol.get(c.path), result.grandTotals))));
    };
    draw();
    api.expandAll = () => { collapsed.clear(); draw(); };
    api.collapseAll = () => { allPaths.filter((p) => !p.includes('/')).forEach((p) => collapsed.add(p)); draw(); };
    if (!result.groups.length) wrap.appendChild(emptyState('No records match', 'Try changing the report filters.', { iconName: 'filter' }));
    else wrap.appendChild(table);
    return api;
  }

  // tabular
  const rows = [...(result.rows || [])];
  if (!rows.length) { wrap.appendChild(emptyState('No records match', 'Try changing the report filters.', { iconName: 'filter' })); return api; }
  const { byCol, loose } = aggLayout(result);
  let sortCol = null, sortDir = 1;
  const table = h('table', { class: 'table compact an-report-table' });
  const draw = () => {
    clear(table);
    const sorted = sortCol == null ? rows : [...rows].sort((a, b) => {
      const c = cols[sortCol];
      const va = a._labels?.[c.path] ?? a[c.path], vb = b._labels?.[c.path] ?? b[c.path];
      if (va == null || va === '') return 1;
      if (vb == null || vb === '') return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })) * sortDir;
    });
    table.appendChild(h('thead', h('tr', h('th', { class: 'row-num' }, ''), cols.map((c, i) => h('th', {
      class: ['sortable', isNum(c.fd) && 'num'], 'aria-sort': sortCol === i ? (sortDir > 0 ? 'ascending' : 'descending') : 'none', tabindex: 0,
      onClick: () => { if (sortCol === i) sortDir = -sortDir; else { sortCol = i; sortDir = 1; } draw(); },
      onKeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); },
    }, c.label, sortCol === i ? icon(sortDir > 0 ? 'arrowUp' : 'arrowDown', { size: 12 }) : null)))));
    table.appendChild(h('tbody', sorted.map((row, i) => h('tr', h('td', { class: 'row-num' }, i + 1), cols.map((c) => h('td', { class: isNum(c.fd) ? 'num' : '' }, renderCell(objApi, c, c.fd, row)))))));
    if (byCol.size || loose.length) {
      table.appendChild(h('tfoot', h('tr', { class: 'grand-total' }, h('td', { class: 'row-num' }, ''),
        cols.map((c, i) => (i === 0 && !byCol.get(c.path) ? h('td', h('div', { class: 'row gap-4 wrap' }, h('span', 'Total'), looseChips(loose, result.grandTotals))) : aggCell(byCol.get(c.path), result.grandTotals))))));
    }
  };
  draw();
  wrap.appendChild(table);
  return api;
}

function matrixTable(result) {
  const m = result.matrix;
  const aggs = result.aggregates || [{ key: 'COUNT', label: 'Record Count', type: 'Number' }];
  const primary = aggs[aggs.length > 1 ? 1 : 0];
  const max = Math.max(1, ...Object.values(m.cells).map((c) => Math.abs(Number(c?.[primary.key]) || 0)));
  if (!m.rows.length) return emptyState('No records match', 'Try changing the report filters.', { iconName: 'filter' });
  const vals = (totals, heat) => aggs.map((a) => h('div', { class: a === primary ? 'strong' : 'muted small', title: a.label }, formatAgg(a, totals?.[a.key] ?? (a.key === 'COUNT' ? 0 : null))));
  const heatStyle = (v) => {
    const pct = Math.round(((Math.abs(Number(v)) || 0) / max) * 22);
    return pct ? { background: `color-mix(in srgb, var(--brand) ${pct}%, transparent)` } : null;
  };
  return h('table', { class: 'table compact an-report-table an-matrix' },
    h('thead',
      h('tr', h('th', { class: 'an-corner', rowSpan: 2 }, h('div', result.groupings[0].label), h('div', { class: 'muted tiny' }, aggs.map((a) => a.label).join(' · '))),
        h('th', { class: 'an-col-group', colSpan: m.cols.length + 1 }, result.colGroupings?.[0]?.label || '')),
      h('tr', m.cols.map((c) => h('th', { class: 'num' }, c.label)), h('th', { class: 'num an-total-col' }, 'Total'))),
    h('tbody', m.rows.map((r) => h('tr',
      h('th', { class: 'an-row-head', scope: 'row' }, r.label),
      m.cols.map((c) => {
        const cell = m.cells[`${r.key}|${c.key}`];
        return h('td', { class: 'num', style: heatStyle(cell?.[primary.key]) }, cell?.COUNT ? vals(cell) : h('span', { class: 'muted' }, '–'));
      }),
      h('td', { class: 'num an-total-col' }, vals(r.totals))))),
    h('tfoot', h('tr', { class: 'grand-total' }, h('th', { class: 'an-row-head', scope: 'row' }, 'Total'), m.cols.map((c) => h('td', { class: 'num' }, vals(c.totals))), h('td', { class: 'num an-total-col' }, vals(result.grandTotals)))));
}

export function renderTotals(result) {
  return h('div', { class: 'an-totals' },
    h('div', { class: 'an-total' }, h('div', { class: 'an-total-label' }, 'Total Records'), h('div', { class: 'an-total-value' }, fmt.number(result.total))),
    (result.aggregates || []).filter((a) => a.key !== 'COUNT').map((a) => h('div', { class: 'an-total' }, h('div', { class: 'an-total-label' }, a.label), h('div', { class: 'an-total-value' }, formatAgg(a, result.grandTotals?.[a.key])))),
    result.truncated ? h('div', { class: 'an-total' }, badge('Showing first 2,000 rows', 'warning')) : null);
}

export function renderFilterSummary(def) {
  const chips = [h('span', { class: 'an-filter-chip' }, h('span', { class: 'muted' }, 'Show Me: '), def.scope === 'mine' ? 'My records' : 'All records')];
  (def.filters || []).forEach((f, i) => {
    const d = describeFilter(def.object, f);
    chips.push(h('span', { class: 'an-filter-chip', title: `${i + 1}. ${d.field} ${d.op} ${d.value}` }, h('span', { class: 'muted' }, `${d.field} `), `${d.op} `, h('strong', d.value)));
  });
  if (def.filterLogic && (def.filters || []).length > 1) chips.push(h('span', { class: 'an-filter-chip' }, h('span', { class: 'muted' }, 'Logic: '), def.filterLogic));
  if (def.rowLimit) chips.push(h('span', { class: 'an-filter-chip' }, h('span', { class: 'muted' }, 'Row limit: '), def.rowLimit));
  return h('div', { class: 'an-filters' }, icon('filter', { size: 14 }), chips);
}

export function chartTitle(result) {
  const g = result.groupings?.[0]?.label;
  const m = result.chart?.measure?.label || 'Record Count';
  return g ? `${m} by ${g}${result.colGroupings?.[0] ? ` and ${result.colGroupings[0].label}` : ''}` : m;
}

// ---------- recent list ----------
export function rememberRecent(kind, id) {
  const key = `recent:${kind}`;
  const list = (store.get(key, []) || []).filter((x) => x !== id);
  store.set(key, [id, ...list].slice(0, 30));
}

// ---------- add to dashboard ----------
export async function addToDashboardDialog(report, result) {
  let dashboards = [];
  try { dashboards = (await GET('/api/dashboards')).filter((d) => d.canEdit); } catch (e) { toast(e.message, 'error'); return; }
  const grouped = !!(result?.groups || result?.matrix);
  const defType = grouped ? (report.chart?.type && report.chart.type !== 'none' ? report.chart.type : 'column') : 'metric';
  const types = [{ id: 'metric', label: 'Metric' }, { id: 'gauge', label: 'Gauge' }, { id: 'table', label: 'Table' }, ...CHART_TYPES];
  const dashSel = h('select', { class: 'input', id: 'an-add-dash' }, dashboards.map((d) => h('option', { value: d.id }, `${d.name} (${d.folder})`)));
  const typeSel = h('select', { class: 'input', id: 'an-add-type' }, types.map((t) => h('option', { value: t.id, selected: t.id === defType, disabled: !grouped && !['metric', 'gauge', 'table'].includes(t.id) }, t.label)));
  const title = h('input', { class: 'input', id: 'an-add-title', value: report.name });
  const size = h('select', { class: 'input', id: 'an-add-size' }, ['small', 'medium', 'large'].map((s) => h('option', { value: s, selected: s === 'medium' }, s[0].toUpperCase() + s.slice(1))));
  const body = dashboards.length
    ? h('div', { class: 'col gap-12' },
      h('div', h('label', { class: 'form-label', for: 'an-add-dash' }, 'Dashboard'), dashSel),
      h('div', { class: 'form-grid', style: { gap: '4px 12px' } },
        h('div', h('label', { class: 'form-label', for: 'an-add-type' }, 'Display As'), typeSel),
        h('div', h('label', { class: 'form-label', for: 'an-add-size' }, 'Size'), size)),
      h('div', h('label', { class: 'form-label', for: 'an-add-title' }, 'Component Title'), title),
      !grouped ? h('div', { class: 'alert' }, icon('info'), h('div', 'This report has no groupings, so it can be shown as a metric, gauge or table. Add a grouping to chart it.')) : null)
    : h('div', { class: 'col gap-12' }, emptyState('No dashboards you can edit', 'Create a dashboard and this report will be added as its first component.', { iconName: 'dashboard' }));
  const m = modal({
    title: 'Add to Dashboard', size: 'sm', body,
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
      can('ManageDashboards') ? h('button', { class: 'btn', onClick: () => { m.close(); location.hash = `#/dashboards/new?report=${encodeURIComponent(report.id)}`; } }, icon('plus'), 'New Dashboard') : null,
      dashboards.length ? h('button', { class: 'btn btn-brand', onClick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const d = await GET(`/api/dashboards/${dashSel.value}`);
          if ((d.components || []).length >= 20) throw new Error('Dashboards can have up to 20 components.');
          const comp = { id: `c${Date.now().toString(36)}`, reportId: report.id, type: typeSel.value, title: title.value.trim() || report.name, subtitle: '', size: size.value, footer: '' };
          await PUT(`/api/dashboards/${d.id}`, { ...d, components: [...(d.components || []), comp] });
          m.close();
          toast(`Added to "${d.name}".`, 'success', { link: { href: `#/dashboards/${d.id}`, label: 'View dashboard' } });
        } catch (err) { m.setError(err.message); e.currentTarget.disabled = false; }
      } }, 'Add') : null,
    ],
  });
}

export async function exportReport(report) {
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/export`, { credentials: 'same-origin' });
    const text = await res.text();
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = JSON.parse(text).error || msg; } catch { /* not json */ }
      throw new Error(msg || 'Export failed');
    }
    downloadText(`${(report.name || 'report').replace(/[^\w -]/g, '').trim() || 'report'}.csv`, text);
    toast('Report exported.', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function saveAsDialog(report) {
  const name = await promptDialog('Report Name', { title: 'Save Report As', value: `Copy of ${report.name}`, confirmLabel: 'Save' });
  if (name == null) return null;
  if (!name.trim()) { toast('Enter a report name.', 'error'); return null; }
  try {
    const saved = await POST('/api/reports', { ...report, id: undefined, name: name.trim() });
    toast(`Report "${saved.name}" was saved.`, 'success');
    return saved;
  } catch (e) { toast(e.message, 'error'); return null; }
}

// ---------- view ----------
export default async function reportView(root, { params, app }) {
  app.setTitle('Report');
  if (!can('RunReports')) {
    mount(root, h('div', { class: 'card' }, emptyState('Insufficient privileges', 'You need the Run Reports permission to view reports.', { iconName: 'lock' })));
    return;
  }
  mount(root, spinner());
  const report = await GET(`/api/reports/${encodeURIComponent(params.id)}`);
  rememberRecent('reports', report.id);
  app.setTitle(report.name);
  const obj = getObj(report.object);

  let showDetails = report.showDetails !== false;
  let showCounts = true;
  let showChart = store.get('report:showChart', true);
  let result = null, error = null, ranAt = null, loading = false, table = null;

  const chartBody = h('div', { class: 'card-body' });
  const chartCard = h('div', { class: 'card an-chart-card' });
  const dataBody = h('div');
  const totalsEl = h('div');
  const toolbar = h('div', { class: 'row wrap gap-12' });
  const statusEl = h('span', { class: 'muted small' });

  const run = async () => {
    loading = true;
    statusEl.textContent = 'Running…';
    refreshBtn.disabled = true;
    try {
      result = normalizeResult(await POST('/api/reports/run', { ...report, showDetails }), report);
      error = null;
      ranAt = new Date();
    } catch (e) { error = e; result = null; }
    loading = false;
    refreshBtn.disabled = false;
    draw();
  };

  const toggleSwitch = (label, value, onChange, disabled) => h('label', { class: 'row gap-4 small', style: { cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 } },
    h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: value, disabled, onChange: (e) => onChange(e.target.checked) }), h('span')), label);

  function draw() {
    statusEl.textContent = ranAt ? `As of ${fmt.time(ranAt)}` : '';
    if (error) {
      clear(totalsEl); clear(toolbar);
      chartCard.classList.add('hidden');
      mount(dataBody, h('div', { class: 'p-16' }, h('div', { class: 'alert danger' }, icon('alert'), h('div', h('strong', 'This report could not be run. '), error.message))));
      return;
    }
    if (!result) return;
    mount(totalsEl, renderTotals(result));
    const grouped = !!(result.groups || result.matrix);
    // chart
    const hasChart = grouped && result.chart;
    chartCard.classList.toggle('hidden', !hasChart || !showChart);
    if (hasChart && showChart) {
      const typeLabel = CHART_TYPES.find((t) => t.id === result.chart.type)?.label || 'Chart';
      mount(chartCard,
        h('div', { class: 'card-header' }, h('h3', chartTitle(result)), h('span', { class: 'badge' }, typeLabel),
          h('button', { class: 'btn btn-ghost btn-sm btn-icon', title: 'Hide chart', 'aria-label': 'Hide chart', onClick: () => setChart(false) }, icon('x'))),
        chartBody);
      mount(chartBody, renderChart(result.chart, { height: 320 }));
    }
    // toolbar
    clear(toolbar);
    if (grouped && result.chart) toolbar.appendChild(toggleSwitch('Chart', showChart, setChart));
    if (result.groups) {
      toolbar.appendChild(toggleSwitch('Detail Rows', showDetails, (v) => { showDetails = v; if (v && !hasRows(result)) run(); else draw(); }));
      toolbar.appendChild(toggleSwitch('Row Counts', showCounts, (v) => { showCounts = v; draw(); }));
      toolbar.appendChild(h('div', { class: 'btn-group' },
        h('button', { class: 'btn btn-sm', onClick: () => table?.expandAll() }, 'Expand All'),
        h('button', { class: 'btn btn-sm', onClick: () => table?.collapseAll() }, 'Collapse All')));
    }
    table = renderReportTable(result, { showDetails, showCounts, maxHeight: 'calc(100vh - 260px)' });
    mount(dataBody, table.el);
  }
  const hasRows = (r) => { let found = false; const walk = (gs) => gs?.forEach((g) => { if (g.rows) found = true; walk(g.children); }); walk(r.groups); return found; };
  const setChart = (v) => { showChart = v; store.set('report:showChart', v); draw(); };

  const refreshBtn = h('button', { class: 'btn btn-icon', title: 'Refresh', 'aria-label': 'Refresh report', onClick: run }, icon('refresh'));
  const moreItems = () => [
    can('ManageDashboards') ? { label: 'Add to Dashboard', icon: 'dashboard', onClick: () => addToDashboardDialog(report, result) } : null,
    can('ManageReports') ? { label: 'Save As', icon: 'copy', onClick: async () => { const s = await saveAsDialog(report); if (s) app.navigate(`/reports/${s.id}`); } } : null,
    can('ExportReports') ? { label: 'Export (CSV)', icon: 'download', onClick: () => exportReport(report) } : null,
    { label: 'Print', icon: 'print', onClick: () => window.print() },
    report.canEdit ? 'sep' : null,
    report.canEdit ? { label: 'Delete', icon: 'trash', danger: true, onClick: async () => {
      if (!(await confirmDialog(`Delete the report "${report.name}"? Dashboards that use it will show an error.`, { title: 'Delete Report', confirmLabel: 'Delete', danger: true }))) return;
      try { await DEL(`/api/reports/${report.id}`); toast(`Report "${report.name}" was deleted.`, 'success'); app.navigate('/reports'); } catch (e) { toast(e.message, 'error'); }
    } } : null,
  ].filter(Boolean);

  const header = h('div', { class: 'page-header an-page-header no-print-actions' },
    h('div', { class: 'title-row' },
      h('div', { class: 'an-hero-icon' }, icon('chart')),
      h('div', { class: 'grow' },
        h('div', { class: 'eyebrow' }, h('a', { href: '#/reports' }, 'Reports'), ' › ', `Report: ${obj?.pluralLabel || report.object}`),
        h('h1', { class: 'truncate' }, report.name),
        h('div', { class: 'row gap-4 mt-8 wrap' }, badge(FORMAT_LABELS[report.format] || report.format, 'brand'), badge(report.folder), badge(report.visibility === 'public' ? 'Public' : 'Private'),
          h('span', { class: 'muted small' }, `Owner: ${report.owner || ''}`), report.updatedAt ? h('span', { class: 'muted small' }, `· Modified ${fmt.relative(report.updatedAt)}`) : null)),
      h('div', { class: 'actions' },
        refreshBtn,
        report.canEdit && can('ManageReports') ? h('a', { class: 'btn', href: `#/reports/${report.id}/edit` }, icon('edit'), 'Edit') : null,
        can('ExportReports') ? h('button', { class: 'btn', onClick: () => exportReport(report) }, icon('download'), 'Export') : null,
        can('ManageDashboards') ? h('button', { class: 'btn', onClick: () => addToDashboardDialog(report, result) }, icon('dashboard'), 'Add to Dashboard') : null,
        h('button', { class: 'btn btn-icon', title: 'More actions', 'aria-label': 'More actions', onClick: (e) => showMenu(e.currentTarget, moreItems(), { align: 'right' }) }, icon('more')))),
    report.description ? h('div', { class: 'muted mt-8' }, report.description) : null,
    h('div', { class: 'mt-8' }, renderFilterSummary(report)));

  mount(root, h('div', { class: 'an-report' },
    header,
    totalsEl,
    chartCard,
    h('div', { class: 'card an-data-card' },
      h('div', { class: 'card-header' }, h('h3', `${obj?.pluralLabel || report.object}`), toolbar, statusEl),
      dataBody)));
  mount(dataBody, spinner());
  await run();
}
