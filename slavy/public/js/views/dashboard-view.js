// Dashboard viewer: header (running user, refreshed time, actions) and a responsive grid of components.
// componentCard() is shared with the dashboard builder's live preview.
import { h, icon, mount, fmt, confirmDialog, promptDialog, toast, spinner, emptyState, badge } from '../lib.js';
import { GET, POST, DEL, can, me } from '../api.js';
import { renderChart, renderMetric, renderGauge, formatValue, CHART_TYPES } from '../charts.js';
import { rememberRecent } from './report-view.js';

export const COMPONENT_TYPES = [
  { id: 'metric', label: 'Metric', icon: 'target', needsGroups: false },
  { id: 'gauge', label: 'Gauge', icon: 'activity', needsGroups: false },
  { id: 'table', label: 'Table', icon: 'table', needsGroups: false },
  ...CHART_TYPES.map((t) => ({ ...t, needsGroups: true })),
];
export const DEF_KEYS = ['id', 'reportId', 'type', 'title', 'subtitle', 'size', 'measure', 'gauge', 'footer'];
export const pickDef = (c) => Object.fromEntries(DEF_KEYS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));

// ---------- chronological ordering for date-grouped labels ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateKey(label) {
  const s = String(label);
  let m;
  if ((m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(s)) && MONTHS.includes(m[1])) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}`;
  if ((m = /^Q([1-4]) (\d{4})$/.exec(s))) return `${m[2]}-Q${m[1]}`;
  if ((m = /^Week of (\d{4}-\d{2}-\d{2})$/.exec(s))) return m[1];
  if (/^\d{4}(-\d{2}-\d{2})?$/.test(s)) return s;
  return null;
}
export function sortDateLabels(comp) {
  const chart = comp.chart;
  if (!chart?.labels || chart.labels.length < 2) return comp;
  const keys = chart.labels.map((l) => (l === '-' ? '~' : dateKey(l)));
  if (keys.some((k) => k == null)) return comp;
  const order = keys.map((k, i) => [k, i]).sort((a, b) => a[0].localeCompare(b[0])).map((x) => x[1]);
  const next = { ...comp, chart: { ...chart, labels: order.map((i) => chart.labels[i]), series: chart.series.map((se) => ({ ...se, values: order.map((i) => se.values[i]) })) } };
  if (Array.isArray(comp.table) && comp.table.every((r) => r.label === '-' || dateKey(r.label))) {
    next.table = [...comp.table].sort((a, b) => (a.label === '-' ? '~' : dateKey(a.label)).localeCompare(b.label === '-' ? '~' : dateKey(b.label)));
  }
  return next;
}

// ---------- component rendering ----------
function tableBody(c) {
  const rows = c.table || [];
  if (!rows.length) return emptyState('No data', '', { iconName: 'table' });
  const nums = rows.every((r) => r.value == null || typeof r.value === 'number');
  const max = nums ? Math.max(1, ...rows.map((r) => Math.abs(Number(r.value) || 0))) : 1;
  return h('div', { class: 'an-comp-table' }, h('table', { class: 'table compact' },
    h('tbody', rows.map((r, i) => h('tr',
      h('td', { class: 'truncate', title: String(r.label ?? '') }, h('span', { class: 'an-swatch', style: { background: `var(--chart-${(i % 10) + 1})` } }), ' ', r.label ?? '—'),
      h('td', { class: 'num' }, nums ? h('div', { class: 'an-bar-cell' }, h('span', { class: 'an-bar-fill', style: { width: `${Math.round((Math.abs(Number(r.value) || 0) / max) * 100)}%` } }), h('span', { class: 'an-bar-val' }, formatValue(r.value, c.measure))) : String(r.value ?? '')))))));
}

export function componentBody(c) {
  if (c.error) return h('div', { class: 'an-comp-error' }, icon('alert'), h('div', h('div', { class: 'strong' }, "This component couldn't be displayed."), h('div', { class: 'small' }, c.error)));
  if (c.type === 'metric') return renderMetric(c.value, c.measure, { sub: c.total != null && c.measure?.key !== 'COUNT' ? `${fmt.number(c.total)} records` : null });
  if (c.type === 'gauge') return renderGauge(c.value, { ...(c.gauge || {}), measure: c.measure });
  if (c.type === 'table') return tableBody(c);
  if (!c.chart) return emptyState('No chart data', 'The source report has no groupings. Show it as a metric, gauge or table, or add a grouping to the report.', { iconName: 'chart' });
  return renderChart(c.chart, { type: c.type, emptyText: 'No data for this component' });
}

export function componentCard(c, { toolbar, preview = false } = {}) {
  const comp = c.error ? c : sortDateLabels(c);
  const title = c.title || c.reportName || 'Untitled component';
  return h('article', { class: ['card an-comp', `size-${c.size || 'medium'}`, `type-${c.type}`, preview && 'preview'], 'aria-label': title },
    h('header', { class: 'an-comp-header' },
      h('div', { class: 'grow' }, h('h3', { class: 'truncate', title }, title), c.subtitle ? h('div', { class: 'an-comp-sub truncate' }, c.subtitle) : null),
      toolbar || (c.reportId ? h('a', { class: 'btn btn-ghost btn-sm btn-icon', href: `#/reports/${c.reportId}`, title: `View report${c.reportName ? `: ${c.reportName}` : ''}`, 'aria-label': `View source report for ${title}` }, icon('external', { size: 14 })) : null)),
    h('div', { class: 'an-comp-body' }, componentBody(comp)),
    h('footer', { class: 'an-comp-footer' },
      h('span', { class: 'grow truncate' }, c.footer || ''),
      c.reportId && !toolbar ? h('a', { href: `#/reports/${c.reportId}`, class: 'small' }, 'View Report') : c.reportName ? h('span', { class: 'muted small truncate' }, c.reportName) : null));
}

export function dashboardGrid(components, columns, opts = {}) {
  return h('div', { class: `an-dash-grid cols-${columns || 3}` }, components.map((c, i) => (opts.wrap ? opts.wrap(c, i) : componentCard(c, opts))));
}

// ---------- view ----------
export default async function dashboardView(root, { params, app }) {
  app.setTitle('Dashboard');
  if (!can('RunReports')) {
    mount(root, h('div', { class: 'card' }, emptyState('Insufficient privileges', 'You need the Run Reports permission to view dashboards.', { iconName: 'lock' })));
    return;
  }
  mount(root, spinner());
  let dash = await GET(`/api/dashboards/${encodeURIComponent(params.id)}/run`);
  rememberRecent('dashboards', dash.id);
  app.setTitle(dash.name);
  let fullscreen = false;

  const meta = h('div', { class: 'an-dash-meta' });
  const gridHost = h('div');
  const refreshBtn = h('button', { class: 'btn', onClick: () => refresh() }, icon('refresh'), 'Refresh');
  const fsLabel = h('span', 'Full Screen');
  const fsBtn = h('button', { class: 'btn', title: 'Full screen', 'aria-pressed': 'false', onClick: () => setFullscreen(!fullscreen) }, icon('external'), fsLabel);

  const setFullscreen = (on) => {
    fullscreen = on;
    document.body.classList.toggle('an-fullscreen', on);
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.classList.toggle('active', on);
    fsBtn.title = on ? 'Exit full screen (Esc)' : 'Full screen';
    fsLabel.textContent = on ? 'Exit Full Screen' : 'Full Screen';
  };
  const onKey = (e) => { if (e.key === 'Escape' && fullscreen && !document.querySelector('.modal-backdrop')) setFullscreen(false); };
  document.addEventListener('keydown', onKey);

  function draw() {
    mount(meta,
      h('span', { class: 'row gap-4' }, icon('user', { size: 14 }), 'As viewed by ', h('strong', dash.runningUserName || me()?.Name || '')),
      h('span', { class: 'row gap-4' }, icon('clock', { size: 14 }), `As of ${fmt.datetime(dash.refreshedAt)}`),
      badge(dash.folder), badge(dash.visibility === 'public' ? 'Public' : 'Private'));
    const comps = dash.components || [];
    mount(gridHost, comps.length
      ? dashboardGrid(comps, dash.columns)
      : h('div', { class: 'card' }, emptyState('This dashboard is empty', dash.canEdit ? 'Edit the dashboard to add components from your reports.' : 'No components have been added yet.', {
        iconName: 'dashboard', action: dash.canEdit && can('ManageDashboards') ? h('a', { class: 'btn btn-brand', href: `#/dashboards/${dash.id}/edit` }, icon('plus'), 'Add Component') : null,
      })));
  }

  async function refresh() {
    refreshBtn.disabled = true;
    gridHost.classList.add('an-busy');
    try {
      dash = await GET(`/api/dashboards/${encodeURIComponent(dash.id)}/run`);
      draw();
      toast('Dashboard refreshed.', 'success', { timeout: 2000 });
    } catch (e) { toast(e.message, 'error'); }
    refreshBtn.disabled = false;
    gridHost.classList.remove('an-busy');
  }

  async function cloneDash() {
    const name = await promptDialog('Dashboard Name', { title: 'Clone Dashboard', value: `Copy of ${dash.name}`, confirmLabel: 'Clone' });
    if (name == null) return;
    try {
      const def = await GET(`/api/dashboards/${dash.id}`);
      const ru = def.runningUser || 'viewer';
      const saved = await POST('/api/dashboards', {
        ...def, id: undefined, name: name.trim() || `Copy of ${dash.name}`,
        runningUser: ru === 'viewer' || ru === me()?.Id || can('ModifyAllData') ? ru : 'viewer',
        components: (def.components || []).map(pickDef),
      });
      toast(`Dashboard "${saved.name}" was created.`, 'success');
      app.navigate(`/dashboards/${saved.id}`);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteDash() {
    if (!(await confirmDialog(`Delete the dashboard "${dash.name}"? This can't be undone.`, { title: 'Delete Dashboard', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/dashboards/${dash.id}`); toast(`Dashboard "${dash.name}" was deleted.`, 'success'); app.navigate('/dashboards'); } catch (e) { toast(e.message, 'error'); }
  }

  mount(root, h('div', { class: 'an-dashboard' },
    h('div', { class: 'page-header an-page-header' },
      h('div', { class: 'title-row' },
        h('div', { class: 'an-hero-icon dash' }, icon('dashboard')),
        h('div', { class: 'grow' },
          h('div', { class: 'eyebrow' }, h('a', { href: '#/dashboards' }, 'Dashboards'), ' › Dashboard'),
          h('h1', { class: 'truncate' }, dash.name),
          dash.description ? h('div', { class: 'muted small' }, dash.description) : null),
        h('div', { class: 'actions' },
          refreshBtn,
          dash.canEdit && can('ManageDashboards') ? h('a', { class: 'btn', href: `#/dashboards/${dash.id}/edit` }, icon('edit'), 'Edit') : null,
          can('ManageDashboards') ? h('button', { class: 'btn', onClick: cloneDash }, icon('copy'), 'Clone') : null,
          dash.canEdit ? h('button', { class: 'btn', onClick: deleteDash }, icon('trash'), 'Delete') : null,
          fsBtn)),
      meta),
    gridHost));
  draw();

  return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('an-fullscreen'); };
}
