// Core app API used by the Slavy web client.
import { get, orgSetting } from '../db.js';
import { login, logout, createSession, sessionCookie } from '../auth.js';
import { publicUser, hasPerm, requirePerm, effectivePermissions, getUser, systemContext, SYSTEM_PERMISSIONS } from '../security.js';
import { getMeta, requireObject, objectForId, getObject } from '../metadata.js';
import {
  getRecord, createRecord, updateRecord, deleteRecord, undeleteRecord, purgeRecord, recycleBin, fieldHistory, queryRecords,
} from '../records.js';
import {
  uiMeta, describeObject, listViewsFor, runListView, touchRecent, recentItems, favorites, toggleFavorite, globalSearch,
  lookupSearch, activitiesFor, relatedList, feedFor, createPost, addComment, toggleLike, deleteFeed, deleteComment,
  listShares, addShare, removeShare, massAction, runAction, convertLead, importRecords, exportCsv, notificationsFor,
  markNotificationsRead, homeData,
} from '../features.js';
import { submitForApproval, actOnApproval, approvalsForRecord, pendingApprovals, logEmail } from '../automation.js';
import { executeSoql } from '../soql.js';
import { compile, references, evaluate, FUNCTION_NAMES, toText } from '../formula.js';
import { formulaContext } from '../records.js';
import { fieldAtPath } from '../records.js';
import { saveMeta, deleteMeta } from '../metadata.js';
import { HttpError, hashPassword, verifyPassword, nowIso } from '../util.js';
import { run } from '../db.js';
import { sendText } from '../http.js';

export const HANDLED = Symbol('handled');

function sessionPayload(ctx) {
  const company = orgSetting('company', { name: 'Slavy' });
  const profile = getMeta(ctx.user.ProfileId);
  const role = getMeta(ctx.user.RoleId);
  return {
    user: { ...ctx.user, ProfileName: profile?.name, RoleName: role?.name },
    perms: { system: Object.fromEntries(SYSTEM_PERMISSIONS.map(([k]) => [k, hasPerm(ctx, k)])) },
    org: company,
  };
}

export function registerCore(r) {
  // ---------- auth ----------
  r.post('/api/login', ({ body, req, res }) => {
    const s = login(body.username, body.password, { ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', sessionCookie(s.id, s.expires));
    return { ok: true };
  }, { auth: false });
  r.post('/api/logout', ({ ctx, res }) => {
    logout(ctx.sessionId);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { ok: true };
  });
  r.get('/api/session', ({ ctx }) => sessionPayload(ctx));

  r.patch('/api/me', ({ ctx, body }) => {
    const allowed = { FirstName: 'first_name', LastName: 'last_name', Email: 'email', Title: 'title', Phone: 'phone', TimeZone: 'timezone', Alias: 'alias' };
    for (const [k, col] of Object.entries(allowed)) if (k in body) run(`UPDATE users SET ${col} = ? WHERE id = ?`, body[k] ?? null, ctx.user.Id);
    return publicUser(getUser(ctx.user.Id));
  });
  r.post('/api/me/password', ({ ctx, body }) => {
    const u = getUser(ctx.user.Id);
    if (!verifyPassword(String(body.currentPassword || ''), u.password_hash)) throw new HttpError(400, 'Current password is incorrect');
    if (String(body.newPassword || '').length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.newPassword), ctx.user.Id);
    return { ok: true };
  });

  // ---------- metadata ----------
  r.get('/api/meta', ({ ctx }) => uiMeta(ctx));
  r.get('/api/describe/:object', ({ ctx, params }) => describeObject(ctx, params.object));

  // ---------- list views & records ----------
  r.get('/api/listviews/:object', ({ ctx, params }) => listViewsFor(ctx, params.object));
  r.post('/api/listviews/:object', ({ ctx, params, body }) => {
    const obj = requireObject(params.object);
    if (body.visibility === 'public') requirePerm(ctx, 'ManagePublicListViews');
    return saveMeta('listView', { ...sanitizeView(body), object: obj.apiName, ownerId: ctx.user.Id }, ctx.user.Id);
  });
  r.put('/api/listview/:id', ({ ctx, params, body }) => {
    const v = getMeta(params.id, 'listView');
    if (!v) throw new HttpError(404, 'List view not found');
    canEditView(ctx, v);
    if (body.visibility === 'public') requirePerm(ctx, 'ManagePublicListViews');
    return saveMeta('listView', { ...v, ...sanitizeView(body), id: v.id, object: v.object, ownerId: v.ownerId }, ctx.user.Id);
  });
  r.delete('/api/listview/:id', ({ ctx, params }) => {
    const v = getMeta(params.id, 'listView');
    if (!v) throw new HttpError(404, 'List view not found');
    canEditView(ctx, v);
    deleteMeta(v.id);
    return { ok: true };
  });

  r.get('/api/records/:object', ({ ctx, params, query }) => runListView(ctx, params.object, query.view || 'all', {
    q: query.q, sort: query.sort, dir: query.dir, limit: Math.min(Number(query.limit) || 50, 2000), offset: Number(query.offset) || 0,
    extraFilters: query.filters ? JSON.parse(query.filters) : undefined,
  }));
  r.post('/api/records/:object', ({ ctx, params, body }) => {
    const id = createRecord(ctx, params.object, body);
    return getRecord(ctx, id);
  });
  r.post('/api/records/:object/mass', ({ ctx, params, body }) => massAction(ctx, params.object, body));
  r.post('/api/records/:object/import', ({ ctx, params, body }) => importRecords(ctx, params.object, body));
  r.get('/api/records/:object/export', ({ ctx, params, res }) => {
    const csv = exportCsv(ctx, params.object);
    sendText(res, 200, csv, 'text/csv', { 'Content-Disposition': `attachment; filename="${params.object}.csv"` });
    return HANDLED;
  });

  r.get('/api/record/:id', ({ ctx, params }) => {
    const rec = getRecord(ctx, params.id);
    touchRecent(ctx, params.id);
    return rec;
  });
  r.patch('/api/record/:id', ({ ctx, params, body }) => {
    updateRecord(ctx, params.id, body);
    return getRecord(ctx, params.id);
  });
  r.delete('/api/record/:id', ({ ctx, params }) => { deleteRecord(ctx, params.id); return { ok: true }; });
  r.get('/api/record/:id/history', ({ ctx, params }) => fieldHistory(ctx, params.id));
  r.get('/api/record/:id/activities', ({ ctx, params }) => activitiesFor(ctx, params.id));
  r.get('/api/record/:id/related/:object/:field', ({ ctx, params, query }) =>
    relatedList(ctx, params.id, params.object, params.field, { limit: Math.min(Number(query.limit) || 10, 500), sort: query.sort ? { field: query.sort, dir: query.dir } : null }));
  r.get('/api/record/:id/shares', ({ ctx, params }) => listShares(ctx, params.id));
  r.post('/api/record/:id/shares', ({ ctx, params, body }) => addShare(ctx, params.id, body.granteeId, body.access));
  r.delete('/api/record/:id/shares/:grantee', ({ ctx, params }) => removeShare(ctx, params.id, params.grantee));
  r.post('/api/record/:id/actions/:action', ({ ctx, params, body }) => runAction(ctx, params.id, params.action, body));
  r.post('/api/record/:id/convert', ({ ctx, params, body }) => convertLead(ctx, params.id, body));
  r.post('/api/record/:id/email', ({ ctx, params, body }) => {
    const rec = getRecord(ctx, params.id);
    if (!body.to || !body.subject) throw new HttpError(400, 'To and Subject are required');
    logEmail({ to: body.to, subject: body.subject, body: body.body || '', relatedId: rec.Id, sentBy: ctx.user.Id, source: 'User' });
    const whoish = ['Contact', 'Lead'].includes(rec.attributes.type);
    const taskId = createRecord(ctx, 'Task', {
      Name: `Email: ${body.subject}`, Status: 'Completed', Priority: 'Normal', TaskSubtype: 'Email',
      ActivityDate: nowIso().slice(0, 10), Description: `To: ${body.to}\n\n${body.body || ''}`,
      ...(whoish ? { WhoId: rec.Id, ...(rec.AccountId ? { WhatId: rec.AccountId } : {}) } : { WhatId: rec.Id }),
    });
    return { ok: true, taskId };
  });

  // ---------- approvals ----------
  r.get('/api/record/:id/approvals', ({ ctx, params }) => approvalsForRecord(ctx, params.id));
  r.post('/api/record/:id/approvals', ({ ctx, params, body }) => submitForApproval(ctx, params.id, body.comments));
  r.get('/api/approvals', ({ ctx }) => pendingApprovals(ctx));
  r.post('/api/approvals/:id/:action', ({ ctx, params, body }) => actOnApproval(ctx, params.id, params.action, body.comments));

  // ---------- recycle bin ----------
  r.get('/api/recyclebin', ({ ctx, query }) => recycleBin(ctx, { all: query.scope === 'all' }));
  r.post('/api/recyclebin/:id/restore', ({ ctx, params }) => { undeleteRecord(ctx, params.id); return { ok: true }; });
  r.delete('/api/recyclebin/:id', ({ ctx, params }) => { purgeRecord(ctx, params.id); return { ok: true }; });

  // ---------- search, lookups, recent, favorites ----------
  r.get('/api/search', ({ ctx, query }) => globalSearch(ctx, query.q, { object: query.object }));
  r.get('/api/lookup/:object', ({ ctx, params, query }) => lookupSearch(ctx, params.object, query.q, { includeQueues: query.queues === '1' }));
  r.get('/api/recent', ({ ctx }) => recentItems(ctx, 20));
  r.get('/api/favorites', ({ ctx }) => favorites(ctx));
  r.post('/api/favorites', ({ ctx, body }) => ({ favorite: toggleFavorite(ctx, body.target, body.label) }));
  r.get('/api/names', ({ ctx, query }) => {
    const ids = String(query.ids || '').split(',').filter(Boolean).slice(0, 200);
    const out = {};
    for (const id of ids) {
      try { out[id] = getRecord(ctx, id).Name; } catch { const u = getUser(id); if (u) out[id] = publicUser(u).Name; }
    }
    return out;
  });

  // ---------- feed & notifications ----------
  r.get('/api/feed', ({ ctx, query }) => feedFor(ctx, query.parent || null));
  r.post('/api/feed', ({ ctx, body }) => createPost(ctx, body.parentId, body.body));
  r.post('/api/feed/:id/comments', ({ ctx, params, body }) => addComment(ctx, params.id, body.body));
  r.post('/api/feed/:id/like', ({ ctx, params }) => toggleLike(ctx, params.id));
  r.delete('/api/feed/:id', ({ ctx, params }) => { deleteFeed(ctx, params.id); return { ok: true }; });
  r.delete('/api/comments/:id', ({ ctx, params }) => { deleteComment(ctx, params.id); return { ok: true }; });
  r.get('/api/notifications', ({ ctx }) => notificationsFor(ctx));
  r.post('/api/notifications/read', ({ ctx, body }) => { markNotificationsRead(ctx, body.ids); return { ok: true }; });

  r.get('/api/home', ({ ctx }) => homeData(ctx));

  // ---------- developer tools ----------
  r.post('/api/soql', ({ ctx, body }) => {
    requirePerm(ctx, 'RunSoql', 'ApiEnabled');
    const started = Date.now();
    const result = executeSoql(ctx, body.q);
    return { ...result, ms: Date.now() - started };
  });
  r.post('/api/formula/check', ({ ctx, body }) => {
    const obj = requireObject(body.object);
    try {
      const ast = compile(String(body.formula || ''));
      const unknown = [...references(ast)].filter((p) => !p.startsWith('$') && !fieldAtPath(obj.apiName, p));
      if (unknown.length) return { ok: false, error: `Unknown field: ${unknown.join(', ')}` };
      let sample = null;
      if (body.recordId) {
        const rec = getRecord(ctx, body.recordId);
        sample = toText(evaluate(ast, formulaContext(ctx, obj.apiName, rec)));
      }
      return { ok: true, sample };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  r.get('/api/formula/functions', () => FUNCTION_NAMES);

  // ---------- Web-to-Lead / Web-to-Case (public) ----------
  const webTo = (kind) => ({ body, res }) => {
    const cfg = orgSetting(kind === 'lead' ? 'webToLead' : 'webToCase', {});
    if (!cfg.enabled) throw new HttpError(403, `Web-to-${kind === 'lead' ? 'Lead' : 'Case'} is not enabled`);
    const owner = getUser(cfg.defaultOwnerId);
    if (!owner) throw new HttpError(500, 'Default owner is not configured');
    const sys = systemContext(owner);
    const objApi = kind === 'lead' ? 'Lead' : 'Case';
    const { retURL, ...fields } = body;
    const allowed = Object.fromEntries(Object.entries(fields).filter(([k]) => (cfg.fields || []).includes(k)));
    createRecord(sys, objApi, { ...allowed, [kind === 'lead' ? 'LeadSource' : 'Origin']: 'Web' });
    if (retURL && /^https?:\/\//.test(retURL)) { res.writeHead(303, { Location: retURL }); res.end(); return HANDLED; }
    return { ok: true, message: 'Thank you! Your submission has been received.' };
  };
  r.post('/web-to-lead', webTo('lead'), { auth: false });
  r.post('/web-to-case', webTo('case'), { auth: false });
}

function sanitizeView(b) {
  return {
    name: String(b.name || 'New View').slice(0, 80),
    filters: Array.isArray(b.filters) ? b.filters.filter((f) => f && f.field).map((f) => ({ field: f.field, op: f.op || 'equals', value: f.value ?? '' })) : [],
    filterLogic: b.filterLogic || '',
    columns: Array.isArray(b.columns) ? b.columns.slice(0, 15) : [],
    sort: b.sort || null,
    scope: ['mine', 'everything', 'queue'].includes(b.scope) ? b.scope : 'everything',
    visibility: b.visibility === 'public' ? 'public' : 'private',
    kanbanField: b.kanbanField || null,
    kanbanSummary: b.kanbanSummary || null,
  };
}

function canEditView(ctx, v) {
  if (v.ownerId === ctx.user.Id) return;
  if (v.visibility === 'public' && hasPerm(ctx, 'ManagePublicListViews')) return;
  throw new HttpError(403, 'You can only edit your own list views');
}
