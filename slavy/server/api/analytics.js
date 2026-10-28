// Reports & dashboards API.
import { listMeta, getMeta, saveMeta, deleteMeta, requireObject } from '../metadata.js';
import { runReport, reportToCsv, runDashboard } from '../reports.js';
import { hasPerm, requirePerm } from '../security.js';
import { nameOf } from '../records.js';
import { HttpError } from '../util.js';
import { sendText } from '../http.js';
import { HANDLED } from './core.js';
import { audit } from '../db.js';

const canSee = (ctx, item) => item.visibility === 'public' || item.ownerId === ctx.user.Id || hasPerm(ctx, 'ModifyAllData');
const canEdit = (ctx, item, perm) => item.ownerId === ctx.user.Id || hasPerm(ctx, 'ModifyAllData') || (item.visibility === 'public' && hasPerm(ctx, perm));

function summary(ctx, item, type) {
  return {
    id: item.id, name: item.name, description: item.description || '', folder: item.folder || (item.visibility === 'public' ? 'Public' : 'Private'),
    visibility: item.visibility || 'private', object: item.object, format: item.format, owner: nameOf(ctx, item.ownerId), ownerId: item.ownerId,
    createdAt: item.createdAt, updatedAt: item.updatedAt, canEdit: canEdit(ctx, item, type === 'report' ? 'ManageReports' : 'ManageDashboards'),
  };
}

function cleanReport(b) {
  requireObject(b.object);
  return {
    name: String(b.name || 'Untitled Report').slice(0, 120), description: b.description || '', folder: b.folder || '',
    visibility: b.visibility === 'public' ? 'public' : 'private', object: b.object,
    format: ['tabular', 'summary', 'matrix'].includes(b.format) ? b.format : 'tabular',
    columns: Array.isArray(b.columns) ? b.columns.slice(0, 50) : [], filters: Array.isArray(b.filters) ? b.filters : [],
    filterLogic: b.filterLogic || '', scope: b.scope === 'mine' ? 'mine' : 'all',
    groupings: Array.isArray(b.groupings) ? b.groupings.slice(0, 3) : [], colGroupings: Array.isArray(b.colGroupings) ? b.colGroupings.slice(0, 1) : [],
    aggregates: Array.isArray(b.aggregates) ? b.aggregates.slice(0, 10) : [], sort: b.sort || null, rowLimit: b.rowLimit || null,
    chart: b.chart || null, showDetails: b.showDetails !== false,
  };
}

function cleanDashboard(b) {
  return {
    name: String(b.name || 'Untitled Dashboard').slice(0, 120), description: b.description || '', folder: b.folder || '',
    visibility: b.visibility === 'public' ? 'public' : 'private', runningUser: b.runningUser || 'viewer',
    columns: [2, 3, 4].includes(Number(b.columns)) ? Number(b.columns) : 3,
    components: (Array.isArray(b.components) ? b.components : []).slice(0, 20).map((c, i) => ({
      id: c.id || `c${i + 1}`, reportId: c.reportId, type: c.type || 'column', title: c.title || '', subtitle: c.subtitle || '',
      size: ['small', 'medium', 'large'].includes(c.size) ? c.size : 'medium', measure: c.measure || null,
      gauge: c.gauge || null, footer: c.footer || '',
    })),
  };
}

export function registerAnalytics(r) {
  // ---------- reports ----------
  r.get('/api/reports', ({ ctx }) => {
    requirePerm(ctx, 'RunReports');
    return listMeta('report').filter((x) => canSee(ctx, x)).map((x) => summary(ctx, x, 'report'));
  });
  r.get('/api/reports/:id', ({ ctx, params }) => {
    const rep = getMeta(params.id, 'report');
    if (!rep || !canSee(ctx, rep)) throw new HttpError(404, 'Report not found');
    return { ...rep, ...summary(ctx, rep, 'report') };
  });
  r.post('/api/reports', ({ ctx, body }) => {
    requirePerm(ctx, 'ManageReports');
    const saved = saveMeta('report', { ...cleanReport(body), ownerId: ctx.user.Id }, ctx.user.Id);
    return { ...saved, ...summary(ctx, saved, 'report') };
  });
  r.put('/api/reports/:id', ({ ctx, params, body }) => {
    const rep = getMeta(params.id, 'report');
    if (!rep || !canSee(ctx, rep)) throw new HttpError(404, 'Report not found');
    if (!canEdit(ctx, rep, 'ManageReports')) throw new HttpError(403, 'You cannot edit this report');
    const saved = saveMeta('report', { ...cleanReport(body), id: rep.id, ownerId: rep.ownerId }, ctx.user.Id);
    return { ...saved, ...summary(ctx, saved, 'report') };
  });
  r.delete('/api/reports/:id', ({ ctx, params }) => {
    const rep = getMeta(params.id, 'report');
    if (!rep) throw new HttpError(404, 'Report not found');
    if (!canEdit(ctx, rep, 'ManageReports')) throw new HttpError(403, 'You cannot delete this report');
    deleteMeta(rep.id);
    return { ok: true };
  });
  r.post('/api/reports/run', ({ ctx, body }) => runReport(ctx, cleanReport(body)));
  r.get('/api/reports/:id/run', ({ ctx, params }) => {
    const rep = getMeta(params.id, 'report');
    if (!rep || !canSee(ctx, rep)) throw new HttpError(404, 'Report not found');
    return runReport(ctx, rep);
  });
  r.get('/api/reports/:id/export', ({ ctx, params, res }) => {
    requirePerm(ctx, 'ExportReports');
    const rep = getMeta(params.id, 'report');
    if (!rep || !canSee(ctx, rep)) throw new HttpError(404, 'Report not found');
    const csv = reportToCsv(runReport(ctx, rep));
    audit(ctx.user.Id, 'Reports', 'Export', rep.name);
    sendText(res, 200, csv, 'text/csv', { 'Content-Disposition': `attachment; filename="${rep.name.replace(/[^\w -]/g, '')}.csv"` });
    return HANDLED;
  });

  // ---------- dashboards ----------
  r.get('/api/dashboards', ({ ctx }) => {
    requirePerm(ctx, 'RunReports');
    return listMeta('dashboard').filter((x) => canSee(ctx, x)).map((x) => summary(ctx, x, 'dashboard'));
  });
  r.get('/api/dashboards/:id', ({ ctx, params }) => {
    const d = getMeta(params.id, 'dashboard');
    if (!d || !canSee(ctx, d)) throw new HttpError(404, 'Dashboard not found');
    return { ...d, ...summary(ctx, d, 'dashboard') };
  });
  r.get('/api/dashboards/:id/run', ({ ctx, params }) => {
    const d = getMeta(params.id, 'dashboard');
    if (!d || !canSee(ctx, d)) throw new HttpError(404, 'Dashboard not found');
    return { ...runDashboard(ctx, d), ...summary(ctx, d, 'dashboard') };
  });
  r.post('/api/dashboards', ({ ctx, body }) => {
    requirePerm(ctx, 'ManageDashboards');
    if (body.runningUser && !['viewer', ctx.user.Id].includes(body.runningUser) && !hasPerm(ctx, 'ModifyAllData')) {
      throw new HttpError(403, 'Only administrators can set another user as the running user');
    }
    const saved = saveMeta('dashboard', { ...cleanDashboard(body), ownerId: ctx.user.Id }, ctx.user.Id);
    return { ...saved, ...summary(ctx, saved, 'dashboard') };
  });
  r.put('/api/dashboards/:id', ({ ctx, params, body }) => {
    const d = getMeta(params.id, 'dashboard');
    if (!d || !canSee(ctx, d)) throw new HttpError(404, 'Dashboard not found');
    if (!canEdit(ctx, d, 'ManageDashboards')) throw new HttpError(403, 'You cannot edit this dashboard');
    if (body.runningUser && body.runningUser !== 'viewer' && body.runningUser !== d.runningUser && !hasPerm(ctx, 'ModifyAllData') && body.runningUser !== ctx.user.Id) {
      throw new HttpError(403, 'Only administrators can set another user as the running user');
    }
    const saved = saveMeta('dashboard', { ...cleanDashboard(body), id: d.id, ownerId: d.ownerId }, ctx.user.Id);
    return { ...saved, ...summary(ctx, saved, 'dashboard') };
  });
  r.delete('/api/dashboards/:id', ({ ctx, params }) => {
    const d = getMeta(params.id, 'dashboard');
    if (!d) throw new HttpError(404, 'Dashboard not found');
    if (!canEdit(ctx, d, 'ManageDashboards')) throw new HttpError(403, 'You cannot delete this dashboard');
    deleteMeta(d.id);
    return { ok: true };
  });
}
