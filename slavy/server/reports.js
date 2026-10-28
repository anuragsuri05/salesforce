// Reports (tabular, summary, matrix) and dashboards.
import { requireObject, getMeta, getObject } from './metadata.js';
import { visibleRecords, sortRecords, pathValue, fieldAtPath, nameOf } from './records.js';
import { filtersToCondition } from './conditions.js';
import { buildContext, getUser, fieldAccess, hasPerm } from './security.js';
import { HttpError, prefixOf, PREFIX } from './util.js';

const MAX_ROWS = 2000;
const NUMERIC = new Set(['Number', 'Currency', 'Percent', 'Rollup']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function describeColumn(ctx, objApi, path) {
  const f = fieldAtPath(objApi, path);
  if (!f) throw new HttpError(400, `Unknown report column ${path}`);
  if (f.object !== 'User' && !f.system && !fieldAccess(ctx, f.object, f).read) throw new HttpError(403, `No access to field ${path}`);
  const type = f.type === 'Formula' || f.type === 'Rollup' ? f.returnType || 'Number' : f.type;
  return { path, label: f.fullLabel, type, isReference: f.type === 'Lookup' || f.type === 'MasterDetail' || f.ownerField };
}

function bucketKey(value, type, granularity) {
  if (value == null || value === '') return { key: '', label: '-' };
  if ((type === 'Date' || type === 'DateTime') && granularity && granularity !== 'day') {
    const d = new Date(String(value).length === 10 ? value + 'T00:00:00Z' : value);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (granularity === 'month') return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS[m]} ${y}` };
    if (granularity === 'quarter') return { key: `${y}-Q${Math.floor(m / 3) + 1}`, label: `Q${Math.floor(m / 3) + 1} ${y}` };
    if (granularity === 'year') return { key: String(y), label: String(y) };
    if (granularity === 'week') {
      const start = new Date(d.getTime() - d.getUTCDay() * 86400000).toISOString().slice(0, 10);
      return { key: start, label: `Week of ${start}` };
    }
  }
  if (type === 'Date' || type === 'DateTime') {
    const s = String(value).slice(0, 10);
    return { key: s, label: s };
  }
  if (type === 'Checkbox') return { key: String(!!value), label: value ? 'True' : 'False' };
  return { key: String(value), label: String(value) };
}

function aggKey(a) { return a.op === 'count' ? 'COUNT' : `${a.op.toUpperCase()}:${a.field}`; }

function computeAggs(ctx, objApi, recs, aggs) {
  const out = { COUNT: recs.length };
  for (const a of aggs) {
    if (a.op === 'count') continue;
    const vals = recs.map((r) => pathValue(ctx, objApi, r, a.field).value).filter((v) => v != null && v !== '').map(Number);
    let v = null;
    if (a.op === 'sum') v = vals.reduce((s, x) => s + x, 0);
    else if (a.op === 'avg') v = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    else if (a.op === 'min') v = vals.length ? Math.min(...vals) : null;
    else if (a.op === 'max') v = vals.length ? Math.max(...vals) : null;
    out[aggKey(a)] = v == null ? null : Math.round(v * 100) / 100;
  }
  return out;
}

function groupBy(ctx, objApi, recs, grouping, col) {
  const map = new Map();
  for (const r of recs) {
    const { value } = pathValue(ctx, objApi, r, grouping.field);
    const b = bucketKey(value, col.type, grouping.dateGranularity);
    if (!map.has(b.key)) map.set(b.key, { key: b.key, label: col.isReference && value ? nameOf(ctx, value) || b.label : b.label, recs: [] });
    map.get(b.key).recs.push(r);
  }
  return [...map.values()];
}

function sortGroups(groups, grouping, field) {
  const order = field?.values?.map((v) => v.value);
  groups.sort((a, b) => {
    if (a.key === '' && b.key !== '') return 1;
    if (b.key === '' && a.key !== '') return -1;
    if (order && order.length) {
      const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }
    // Dates sort chronologically by bucket key (e.g. "2026-02"), everything else by label.
    if (field && ['Date', 'DateTime'].includes(field.type === 'Formula' ? field.returnType : field.type)) return String(a.key).localeCompare(String(b.key));
    return String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
  });
  if (grouping.sortDir === 'desc') groups.reverse();
  return groups;
}

export function runReport(ctx, def) {
  if (!hasPerm(ctx, 'RunReports')) throw new HttpError(403, 'You do not have permission to run reports');
  const obj = requireObject(def.object);
  const api = obj.apiName;
  const format = def.format || 'tabular';
  const where = filtersToCondition(def.filters || [], def.filterLogic);
  let items = visibleRecords(ctx, api, { where, scope: def.scope === 'mine' ? 'mine' : undefined });
  items = sortRecords(ctx, api, items, def.sort?.field ? [def.sort] : [{ field: 'Name', dir: 'asc' }]);
  let recs = items.map((i) => i.rec);
  if (def.rowLimit) recs = recs.slice(0, Number(def.rowLimit));

  const columns = (def.columns?.length ? def.columns : ['Name']).map((p) => describeColumn(ctx, api, p));
  const aggs = (def.aggregates || []).filter((a) => a && a.op && (a.op === 'count' || a.field));
  const aggMeta = [{ key: 'COUNT', label: 'Record Count', type: 'Number' }, ...aggs.filter((a) => a.op !== 'count').map((a) => {
    const c = describeColumn(ctx, api, a.field);
    if (!NUMERIC.has(c.type)) throw new HttpError(400, `Cannot ${a.op} non-numeric field ${a.field}`);
    return { key: aggKey(a), label: `${{ sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max' }[a.op]} of ${c.label}`, type: c.type };
  })];

  const toRow = (r) => {
    const row = { _id: r.Id, _labels: {} };
    for (const c of columns) {
      const { value } = pathValue(ctx, api, r, c.path);
      row[c.path] = value;
      if (c.isReference && value) row._labels[c.path] = nameOf(ctx, value);
    }
    return row;
  };

  const result = {
    name: def.name, object: api, objectLabel: obj.pluralLabel, format, columns, aggregates: aggMeta,
    total: recs.length, truncated: recs.length > MAX_ROWS, grandTotals: computeAggs(ctx, api, recs, aggs),
  };

  const rowGroupings = (def.groupings || []).filter((g) => g && g.field).slice(0, 3).map((g) => ({ ...g }));
  const colGroupings = format === "matrix" ? (def.colGroupings || []).filter((g) => g && g.field).slice(0, 1).map((g) => ({ ...g })) : [];
  for (const g of [...rowGroupings, ...colGroupings]) g._col = describeColumn(ctx, api, g.field);

  if (format === 'tabular' || !rowGroupings.length) {
    result.rows = recs.slice(0, MAX_ROWS).map(toRow);
  } else if (format === 'summary' || !colGroupings.length) {
    const build = (list, level) => {
      const g = rowGroupings[level];
      const fieldDef = fieldAtPath(api, g.field);
      return sortGroups(groupBy(ctx, api, list, g, g._col), g, fieldDef).map((grp) => ({
        key: grp.key, label: grp.label, totals: computeAggs(ctx, api, grp.recs, aggs),
        children: level + 1 < rowGroupings.length ? build(grp.recs, level + 1) : null,
        rows: def.showDetails === false || level + 1 < rowGroupings.length ? null : grp.recs.slice(0, MAX_ROWS).map(toRow),
      }));
    };
    result.groupings = rowGroupings.map((g) => ({ field: g.field, label: g._col.label, dateGranularity: g.dateGranularity }));
    result.groups = build(recs, 0);
  } else {
    const rg = rowGroupings[0], cg = colGroupings[0];
    const rows = sortGroups(groupBy(ctx, api, recs, rg, rg._col), rg, fieldAtPath(api, rg.field));
    const cols = sortGroups(groupBy(ctx, api, recs, cg, cg._col), cg, fieldAtPath(api, cg.field));
    const cells = {};
    for (const r of rows) {
      for (const c of cols) {
        const ids = new Set(c.recs.map((x) => x.Id));
        cells[`${r.key}|${c.key}`] = computeAggs(ctx, api, r.recs.filter((x) => ids.has(x.Id)), aggs);
      }
    }
    result.groupings = [{ field: rg.field, label: rg._col.label }];
    result.colGroupings = [{ field: cg.field, label: cg._col.label }];
    result.matrix = {
      rows: rows.map((r) => ({ key: r.key, label: r.label, totals: computeAggs(ctx, api, r.recs, aggs) })),
      cols: cols.map((c) => ({ key: c.key, label: c.label, totals: computeAggs(ctx, api, c.recs, aggs) })),
      cells,
    };
  }

  // Chart data: first grouping x first measure (or count); matrix -> one series per column group.
  const measure = def.chart?.measure || (aggs[0] ? aggKey(aggs[0]) : 'COUNT');
  const measureMeta = aggMeta.find((a) => a.key === measure) || aggMeta[0];
  if (result.groups) {
    result.chart = { type: def.chart?.type || 'column', title: def.chart?.title || '', measure: measureMeta,
      labels: result.groups.map((g) => g.label), series: [{ name: measureMeta.label, values: result.groups.map((g) => g.totals[measureMeta.key] ?? 0) }] };
  } else if (result.matrix) {
    result.chart = { type: def.chart?.type || 'column', stacked: true, title: def.chart?.title || '', measure: measureMeta,
      labels: result.matrix.rows.map((r) => r.label),
      series: result.matrix.cols.map((c) => ({ name: c.label, values: result.matrix.rows.map((r) => result.matrix.cells[`${r.key}|${c.key}`]?.[measureMeta.key] ?? 0) })) };
  }
  if (def.chart?.type === 'none') result.chart = null;
  return result;
}

export function reportToCsv(result) {
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const cols = result.columns;
  const lines = [cols.map((c) => esc(c.label)).join(',')];
  const pushRows = (rows) => rows?.forEach((r) => lines.push(cols.map((c) => esc(r._labels?.[c.path] ?? r[c.path])).join(',')));
  if (result.rows) pushRows(result.rows);
  const walk = (groups) => groups?.forEach((g) => { pushRows(g.rows); walk(g.children); });
  walk(result.groups);
  if (result.matrix) {
    lines.length = 0;
    const m = result.matrix;
    const key = result.aggregates[1]?.key || 'COUNT';
    lines.push([esc(result.groupings[0].label), ...m.cols.map((c) => esc(c.label)), 'Total'].join(','));
    for (const r of m.rows) lines.push([esc(r.label), ...m.cols.map((c) => esc(m.cells[`${r.key}|${c.key}`]?.[key] ?? 0)), esc(r.totals[key])].join(','));
  }
  return lines.join('\n');
}

// ---------- dashboards ----------
// Re-plot a report's chart using the dashboard component's chosen measure.
function chartForMeasure(res, m) {
  if (res.groups) return { measure: m, series: [{ name: m.label, values: res.groups.map((g) => g.totals[m.key] ?? 0) }] };
  if (res.matrix) {
    const mx = res.matrix;
    return { measure: m, series: mx.cols.map((c) => ({ name: c.label, values: mx.rows.map((r) => mx.cells[`${r.key}|${c.key}`]?.[m.key] ?? 0) })) };
  }
  return {};
}

export function runDashboard(ctx, dash) {
  let runCtx = ctx;
  if (dash.runningUser && dash.runningUser !== 'viewer') {
    const u = getUser(dash.runningUser);
    if (u && u.is_active) runCtx = buildContext(u);
  }
  const components = (dash.components || []).map((c) => {
    const report = getMeta(c.reportId, 'report');
    if (!report) return { ...c, error: 'Source report not found' };
    try {
      const res = runReport(runCtx, report);
      const measure = c.measure || res.chart?.measure?.key || res.aggregates[1]?.key || 'COUNT';
      const mMeta = res.aggregates.find((a) => a.key === measure) || res.aggregates[0];
      return {
        ...c, reportName: report.name, objectLabel: res.objectLabel,
        value: res.grandTotals[mMeta.key], measure: mMeta,
        chart: res.chart ? { ...res.chart, ...chartForMeasure(res, mMeta), type: ['metric', 'gauge', 'table'].includes(c.type) ? res.chart.type : c.type || res.chart.type } : null,
        table: res.groups ? res.groups.slice(0, 10).map((g) => ({ label: g.label, value: g.totals[mMeta.key] })) : (res.rows || []).slice(0, 10).map((r) => ({ label: r._labels?.[res.columns[0].path] ?? r[res.columns[0].path], value: res.columns[1] ? (r._labels?.[res.columns[1].path] ?? r[res.columns[1].path]) : '' })),
        total: res.total,
      };
    } catch (e) {
      return { ...c, reportName: report.name, error: e.message };
    }
  });
  return { ...dash, runningUserName: dash.runningUser && dash.runningUser !== 'viewer' ? nameOf(ctx, dash.runningUser) : ctx.user.Name, components, refreshedAt: new Date().toISOString() };
}
