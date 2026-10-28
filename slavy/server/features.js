// Application services built on the record engine.
import { all, get, run, tx, audit } from './db.js';
import {
  listObjects, getObject, requireObject, getFields, getField, childRelationships, listMeta, getMeta, objectForId,
  REFERENCE_TYPES, COMPUTED_TYPES,
} from './metadata.js';
import {
  getRecord, createRecord, updateRecord, deleteRecord, visibleRecords, sortRecords, shape, nameOf, enriched, accessFor,
  queryRecords, USER_FIELDS,
} from './records.js';
import {
  objectPerm, fieldAccess, hasPerm, requirePerm, publicUser, getUser, userGroupIds, accessAtLeast, asSystem,
} from './security.js';
import { hasApprovalProcess, pendingApprovals, postFeed, runFlowOnRecord, notify } from './automation.js';
import { evaluate, mergeTemplate } from './formula.js';
import { formulaContext } from './records.js';
import { filtersToCondition } from './conditions.js';
import { loadRaw } from './store.js';
import { HttpError, ValidationError, newId, nowIso, PREFIX, prefixOf, todayStr, addDays, csvEscape } from './util.js';

// ---------- describe for the UI ----------
export function defaultLayout(objApi) {
  const fields = getFields(objApi);
  const main = fields.filter((f) => !f.system || f.apiName === 'Name' || f.apiName === 'OwnerId').map((f) => f.apiName);
  return {
    sections: [
      { label: 'Information', columns: 2, fields: main },
      { label: 'System Information', columns: 2, fields: ['CreatedById', 'LastModifiedById'] },
    ],
    relatedLists: childRelationships(objApi).map((c) => ({ object: c.object, field: c.field, label: c.label, columns: ['Name', 'CreatedDate'] })),
  };
}

export function layoutFor(objApi) {
  const l = listMeta('layout', objApi)[0];
  return l ? { id: l.id, sections: l.sections || [], relatedLists: l.relatedLists || [] } : defaultLayout(objApi);
}

export function describeObject(ctx, objApi) {
  const o = requireObject(objApi);
  const api = o.apiName;
  const perms = {
    read: objectPerm(ctx, api, 'read'), create: objectPerm(ctx, api, 'create'),
    edit: objectPerm(ctx, api, 'edit'), delete: objectPerm(ctx, api, 'delete'),
  };
  const fields = getFields(api).map((f) => ({ ...f, access: fieldAccess(ctx, api, f) })).filter((f) => f.access.read);
  const children = childRelationships(api).filter((c) => objectPerm(ctx, c.object, 'read'))
    .map((c) => ({ ...c, objectLabel: getObject(c.object).label, pluralLabel: getObject(c.object).pluralLabel }));
  const actions = listMeta('action', api).filter((a) => a.active !== false);
  return { ...o, perms, fields, children, layout: layoutFor(api), actions, hasApproval: hasApprovalProcess(api) };
}

export function uiMeta(ctx) {
  const objects = listObjects().filter((o) => objectPerm(ctx, o.apiName, 'read')).map((o) => describeObject(ctx, o.apiName));
  const apps = listMeta('app').filter((a) => a.active !== false && (!a.profiles?.length || a.profiles.includes(ctx.user.ProfileId) || hasPerm(ctx, 'ModifyAllData')))
    .slice().sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.label.localeCompare(b.label));
  return { objects, apps, userFields: USER_FIELDS };
}

// ---------- list views ----------
export function builtinListViews(objApi) {
  const o = requireObject(objApi);
  return [
    { id: 'recent', name: 'Recently Viewed', builtin: true, columns: [], filters: [], scope: 'everything' },
    { id: 'all', name: `All ${o.pluralLabel}`, builtin: true, columns: [], filters: [], scope: 'everything' },
    { id: 'mine', name: `My ${o.pluralLabel}`, builtin: true, columns: [], filters: [], scope: 'mine' },
  ];
}

export function listViewsFor(ctx, objApi) {
  const views = listMeta('listView', requireObject(objApi).apiName)
    .filter((v) => v.visibility !== 'private' || v.ownerId === ctx.user.Id);
  return [...builtinListViews(objApi), ...views];
}

export function defaultColumns(objApi) {
  const o = getObject(objApi);
  const cols = ['Name', ...(o.listColumns || o.highlightFields || [])];
  if (!o.listColumns) cols.push('OwnerId');
  return [...new Set(cols)].filter((c) => getField(objApi, c) || c.includes('.'));
}

export function runListView(ctx, objApi, viewId, { q, sort, dir, limit = 50, offset = 0, extraFilters } = {}) {
  const obj = requireObject(objApi);
  let view = builtinListViews(obj.apiName).find((v) => v.id === viewId);
  if (!view) {
    view = getMeta(viewId, 'listView');
    if (!view || view.object !== obj.apiName) view = builtinListViews(obj.apiName)[1];
  }
  const filters = [...(view.filters || []), ...(extraFilters || [])];
  const logic = extraFilters?.length && view.filterLogic ? `(${view.filterLogic}) AND ${extraFilters.map((_, i) => (view.filters?.length || 0) + i + 1).join(' AND ')}` : view.filterLogic;
  const where = filtersToCondition(filters, logic);
  const columns = (view.columns?.length ? view.columns : defaultColumns(obj.apiName))
    .filter((c) => { const f = getField(obj.apiName, c); return !f || fieldAccess(ctx, obj.apiName, f).read; });
  if (view.id === 'recent') {
    const recent = all('SELECT record_id FROM recent_items WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 200', ctx.user.Id).map((r) => r.record_id);
    const order = new Map(recent.map((id, i) => [id, i]));
    let items = visibleRecords(ctx, obj.apiName, { search: q }).filter((i) => order.has(i.rec.Id));
    items = sort ? sortRecords(ctx, obj.apiName, items, [{ field: sort, dir }]) : items.sort((a, b) => order.get(a.rec.Id) - order.get(b.rec.Id));
    return { view, columns, total: items.length, records: items.slice(offset, offset + limit).map(({ rec, access }) => shape(ctx, obj.apiName, rec, access)) };
  }
  const sortSpec = sort ? [{ field: sort, dir }] : view.sort?.field ? [view.sort] : [{ field: 'Name', dir: 'asc' }];
  const res = queryRecords(ctx, obj.apiName, { where, search: q, sort: sortSpec, limit, offset, scope: view.scope === 'everything' ? undefined : view.scope });
  return { view, columns, ...res };
}

// ---------- recent items & favorites ----------
export function touchRecent(ctx, id) {
  run('INSERT INTO recent_items(user_id, record_id, viewed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, record_id) DO UPDATE SET viewed_at = excluded.viewed_at',
    ctx.user.Id, id, nowIso());
}

export function recentItems(ctx, limit = 15) {
  const out = [];
  for (const r of all('SELECT record_id, viewed_at FROM recent_items WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 60', ctx.user.Id)) {
    const objApi = objectForId(r.record_id);
    if (!objApi || !objectPerm(ctx, objApi, 'read')) continue;
    const raw = loadRaw(ctx, r.record_id);
    if (!raw || accessFor(ctx, objApi, enriched(ctx, raw)) === 'none') continue;
    const o = getObject(objApi);
    out.push({ Id: r.record_id, Name: raw.Name, object: objApi, objectLabel: o.label, icon: o.icon, color: o.color, viewedAt: r.viewed_at });
    if (out.length >= limit) break;
  }
  return out;
}

export function favorites(ctx) {
  return all('SELECT target, label, created_at FROM favorites WHERE user_id = ? ORDER BY created_at', ctx.user.Id);
}

export function toggleFavorite(ctx, target, label) {
  const ex = get('SELECT 1 FROM favorites WHERE user_id = ? AND target = ?', ctx.user.Id, target);
  if (ex) run('DELETE FROM favorites WHERE user_id = ? AND target = ?', ctx.user.Id, target);
  else run('INSERT INTO favorites(user_id, target, label, created_at) VALUES (?, ?, ?, ?)', ctx.user.Id, target, label || target, nowIso());
  return !ex;
}

// ---------- search & lookups ----------
export function globalSearch(ctx, q, { object, limit = 5 } = {}) {
  q = String(q || '').trim();
  if (q.length < 2) return [];
  const objs = object ? [requireObject(object)] : listObjects().filter((o) => o.searchable !== false);
  const groups = [];
  for (const o of objs) {
    if (!objectPerm(ctx, o.apiName, 'read')) continue;
    let items = visibleRecords(ctx, o.apiName, { search: q });
    if (!items.length) continue;
    items = sortRecords(ctx, o.apiName, items, [{ field: 'LastModifiedDate', dir: 'desc' }]);
    const cols = defaultColumns(o.apiName).slice(0, 4);
    groups.push({ object: o.apiName, label: o.pluralLabel, icon: o.icon, color: o.color, total: items.length, columns: cols,
      records: items.slice(0, object ? 200 : limit).map(({ rec, access }) => shape(ctx, o.apiName, rec, access)) });
  }
  return groups.sort((a, b) => b.total - a.total);
}

export function lookupSearch(ctx, objApi, q, { includeQueues = false } = {}) {
  q = String(q || '').trim().toLowerCase();
  if (objApi === 'User') {
    const users = all('SELECT * FROM users WHERE is_active = 1 ORDER BY first_name, last_name').map(publicUser)
      .filter((u) => !q || u.Name.toLowerCase().includes(q) || u.Username.toLowerCase().includes(q))
      .slice(0, 20).map((u) => ({ id: u.Id, name: u.Name, sub: u.Title || u.Email, kind: 'User' }));
    if (!includeQueues) return users;
    const queues = listMeta('group').filter((g) => g.kind === 'queue' && (!q || (g.label || g.name).toLowerCase().includes(q)))
      .map((g) => ({ id: g.id, name: g.label || g.name, sub: 'Queue', kind: 'Queue', objects: g.queueObjects }));
    return [...users, ...queues];
  }
  const o = requireObject(objApi);
  let items = visibleRecords(ctx, o.apiName, { search: q || undefined });
  if (!q) {
    const recent = new Map(all('SELECT record_id, viewed_at FROM recent_items WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 100', ctx.user.Id).map((r, i) => [r.record_id, i]));
    items = items.filter((i) => recent.has(i.rec.Id)).sort((a, b) => recent.get(a.rec.Id) - recent.get(b.rec.Id));
  } else items = sortRecords(ctx, o.apiName, items, [{ field: 'Name', dir: 'asc' }]);
  const subField = (o.highlightFields || [])[0];
  return items.slice(0, 15).map(({ rec }) => {
    let sub = subField ? rec[subField] : '';
    const sf = subField && getField(o.apiName, subField);
    if (sf && REFERENCE_TYPES.has(sf.type) && sub) sub = nameOf(ctx, sub);
    return { id: rec.Id, name: rec.Name, sub: sub ?? '', kind: o.apiName };
  });
}

// ---------- activities ----------
export function activitiesFor(ctx, id) {
  getRecord(ctx, id);
  const out = { upcoming: [], past: [] };
  const today = todayStr();
  for (const objApi of ['Task', 'Event']) {
    if (!getObject(objApi) || !objectPerm(ctx, objApi, 'read')) continue;
    const where = { t: 'or', items: [{ t: 'cmp', field: 'WhatId', op: '=', value: id }, { t: 'cmp', field: 'WhoId', op: '=', value: id }] };
    for (const { rec, access } of visibleRecords(ctx, objApi, { where })) {
      const s = shape(ctx, objApi, rec, access);
      s._type = objApi;
      if (objApi === 'Task') {
        s._date = rec.ActivityDate || rec.CreatedDate?.slice(0, 10);
        (rec.Status === 'Completed' ? out.past : out.upcoming).push(s);
      } else {
        s._date = rec.StartDateTime || rec.CreatedDate;
        (String(rec.StartDateTime || '').slice(0, 10) >= today ? out.upcoming : out.past).push(s);
      }
    }
  }
  out.upcoming.sort((a, b) => String(a._date).localeCompare(String(b._date)));
  out.past.sort((a, b) => String(b._date).localeCompare(String(a._date)));
  return out;
}

export function relatedList(ctx, parentId, childObject, field, { limit = 10, sort } = {}) {
  getRecord(ctx, parentId);
  const where = { t: 'cmp', field, op: '=', value: parentId };
  return queryRecords(ctx, childObject, { where, limit, sort: sort ? [sort] : [{ field: 'CreatedDate', dir: 'desc' }] });
}

// ---------- feed ----------
function shapeFeed(ctx, f) {
  const comments = all('SELECT * FROM feed_comments WHERE feed_id = ? ORDER BY created_at', f.id).map((c) => ({
    id: c.id, body: c.body, createdBy: nameOf(ctx, c.created_by) || 'Automated Process', createdById: c.created_by, createdAt: c.created_at,
    canDelete: c.created_by === ctx.user.Id || hasPerm(ctx, 'ModifyAllData'),
  }));
  const likes = all('SELECT user_id FROM feed_likes WHERE feed_id = ?', f.id).map((l) => l.user_id);
  return {
    id: f.id, parentId: f.parent_id, parentName: nameOf(ctx, f.parent_id), parentObject: objectForId(f.parent_id),
    type: f.type, body: f.body, data: f.data ? JSON.parse(f.data) : null,
    createdBy: nameOf(ctx, f.created_by) || 'Automated Process', createdById: f.created_by, createdAt: f.created_at,
    comments, likes: likes.length, liked: likes.includes(ctx.user.Id), canDelete: f.created_by === ctx.user.Id || hasPerm(ctx, 'ModifyAllData'),
  };
}

function canSeeParent(ctx, parentId) {
  if (prefixOf(parentId) === PREFIX.User) return true;
  const objApi = objectForId(parentId);
  if (!objApi || !objectPerm(ctx, objApi, 'read')) return false;
  const raw = loadRaw(ctx, parentId);
  return !!raw && accessFor(ctx, objApi, enriched(ctx, raw)) !== 'none';
}

export function feedFor(ctx, parentId, { limit = 50 } = {}) {
  if (parentId) {
    if (!canSeeParent(ctx, parentId)) throw new HttpError(404, 'Record not found');
    return all('SELECT * FROM feed WHERE parent_id = ? ORDER BY created_at DESC LIMIT ?', parentId, limit).map((f) => shapeFeed(ctx, f));
  }
  const out = [];
  for (const f of all('SELECT * FROM feed ORDER BY created_at DESC LIMIT 400')) {
    if (canSeeParent(ctx, f.parent_id)) out.push(shapeFeed(ctx, f));
    if (out.length >= limit) break;
  }
  return out;
}

export function createPost(ctx, parentId, body) {
  if (!String(body || '').trim()) throw new HttpError(400, 'Post cannot be empty');
  if (!canSeeParent(ctx, parentId)) throw new HttpError(404, 'Record not found');
  const id = postFeed(parentId, ctx.user.Id, String(body).slice(0, 10000));
  // @mentions: @First Last notifies that user
  for (const m of String(body).matchAll(/@([A-Z][\w'-]+ [A-Z][\w'-]+)/g)) {
    const u = all('SELECT * FROM users WHERE is_active = 1').map(publicUser).find((x) => x.Name === m[1]);
    if (u && u.Id !== ctx.user.Id) notify(u.Id, `${ctx.user.Name} mentioned you`, String(body).slice(0, 140), `#/r/${parentId}`);
  }
  return shapeFeed(ctx, get('SELECT * FROM feed WHERE id = ?', id));
}

export function addComment(ctx, feedId, body) {
  const f = get('SELECT * FROM feed WHERE id = ?', feedId);
  if (!f || !canSeeParent(ctx, f.parent_id)) throw new HttpError(404, 'Post not found');
  if (!String(body || '').trim()) throw new HttpError(400, 'Comment cannot be empty');
  run('INSERT INTO feed_comments(id, feed_id, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)', newId(PREFIX.Comment), feedId, String(body).slice(0, 10000), ctx.user.Id, nowIso());
  if (f.created_by && f.created_by !== ctx.user.Id) notify(f.created_by, `${ctx.user.Name} commented on your post`, String(body).slice(0, 140), `#/r/${f.parent_id}`);
  return shapeFeed(ctx, f);
}

export function toggleLike(ctx, feedId) {
  const f = get('SELECT * FROM feed WHERE id = ?', feedId);
  if (!f || !canSeeParent(ctx, f.parent_id)) throw new HttpError(404, 'Post not found');
  if (get('SELECT 1 FROM feed_likes WHERE feed_id = ? AND user_id = ?', feedId, ctx.user.Id)) run('DELETE FROM feed_likes WHERE feed_id = ? AND user_id = ?', feedId, ctx.user.Id);
  else run('INSERT INTO feed_likes(feed_id, user_id) VALUES (?, ?)', feedId, ctx.user.Id);
  return shapeFeed(ctx, f);
}

export function deleteFeed(ctx, feedId) {
  const f = get('SELECT * FROM feed WHERE id = ?', feedId);
  if (!f) throw new HttpError(404, 'Post not found');
  if (f.created_by !== ctx.user.Id && !hasPerm(ctx, 'ModifyAllData')) throw new HttpError(403, 'You can only delete your own posts');
  run('DELETE FROM feed WHERE id = ?', feedId);
  run('DELETE FROM feed_comments WHERE feed_id = ?', feedId);
  run('DELETE FROM feed_likes WHERE feed_id = ?', feedId);
}

export function deleteComment(ctx, commentId) {
  const c = get('SELECT * FROM feed_comments WHERE id = ?', commentId);
  if (!c) throw new HttpError(404, 'Comment not found');
  if (c.created_by !== ctx.user.Id && !hasPerm(ctx, 'ModifyAllData')) throw new HttpError(403, 'You can only delete your own comments');
  run('DELETE FROM feed_comments WHERE id = ?', commentId);
}

// ---------- manual sharing ----------
function granteeName(ctx, id) {
  const p = prefixOf(id);
  if (p === PREFIX.User) return { name: nameOf(ctx, id), kind: 'User' };
  const m = getMeta(id);
  return { name: m?.label || m?.name || id, kind: m?.type === 'role' ? 'Role' : m?.kind === 'queue' ? 'Queue' : 'Public Group' };
}

export function listShares(ctx, recordId) {
  const rec = getRecord(ctx, recordId);
  const out = [{ granteeId: rec.OwnerId, ...granteeName(ctx, rec.OwnerId), access: 'Full Access', reason: 'Owner', canDelete: false }];
  for (const s of all('SELECT * FROM record_shares WHERE record_id = ?', recordId)) {
    out.push({ granteeId: s.grantee_id, ...granteeName(ctx, s.grantee_id), access: s.access === 'edit' ? 'Read/Write' : 'Read Only', reason: 'Manual Sharing',
      createdAt: s.created_at, canDelete: rec._access === 'all' });
  }
  return { canShare: rec._access === 'all', shares: out };
}

export function addShare(ctx, recordId, granteeId, access) {
  const rec = getRecord(ctx, recordId);
  if (rec._access !== 'all') throw new HttpError(403, 'Only the owner, users above them in the role hierarchy, or administrators can share this record');
  const p = prefixOf(granteeId);
  if (p === PREFIX.User ? !getUser(granteeId) : !getMeta(granteeId)) throw new HttpError(400, 'Unknown user, role or group');
  run(`INSERT INTO record_shares(record_id, grantee_id, access, created_by, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(record_id, grantee_id) DO UPDATE SET access = excluded.access`, recordId, granteeId, access === 'edit' ? 'edit' : 'read', ctx.user.Id, nowIso());
  if (p === PREFIX.User) notify(granteeId, `${ctx.user.Name} shared a record with you`, rec.Name, `#/r/${recordId}`);
  return listShares(ctx, recordId);
}

export function removeShare(ctx, recordId, granteeId) {
  const rec = getRecord(ctx, recordId);
  if (rec._access !== 'all') throw new HttpError(403, 'Insufficient access');
  run('DELETE FROM record_shares WHERE record_id = ? AND grantee_id = ?', recordId, granteeId);
  return listShares(ctx, recordId);
}

// ---------- mass actions ----------
export function massAction(ctx, objApi, { ids = [], action, values = {}, ownerId }) {
  requireObject(objApi);
  const results = [];
  for (const id of ids.slice(0, 500)) {
    try {
      if (action === 'delete') deleteRecord(ctx, id);
      else if (action === 'changeOwner') updateRecord(ctx, id, { OwnerId: ownerId });
      else if (action === 'update') updateRecord(ctx, id, values);
      else throw new HttpError(400, 'Unknown mass action');
      results.push({ id, success: true });
    } catch (e) {
      results.push({ id, success: false, message: e.message });
    }
  }
  return { results, succeeded: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length };
}

// ---------- custom actions ----------
export function runAction(ctx, recordId, actionId, input = {}) {
  const action = getMeta(actionId, 'action');
  if (!action) throw new HttpError(404, 'Action not found');
  const rec = getRecord(ctx, recordId);
  if (rec.attributes.type !== action.object) throw new HttpError(400, 'Action does not belong to this object');
  const sysView = enriched(asSystem(ctx), loadRaw(ctx, recordId));
  const fctx = formulaContext(asSystem(ctx), action.object, sysView);
  const valuesFrom = (assignments) => Object.fromEntries((assignments || []).map((a) => [a.field, a.isFormula ? evaluate(String(a.value), fctx)?.toString?.() ?? null : a.value]));
  switch (action.actionType) {
    case 'update':
      updateRecord(ctx, recordId, { ...valuesFrom(action.assignments), ...input });
      return { message: action.successMessage || `${action.label} complete`, recordId };
    case 'create': {
      const vals = { ...valuesFrom(action.assignments), ...input };
      if (action.lookupField) vals[action.lookupField] = recordId;
      const id = createRecord(ctx, action.childObject, vals);
      return { message: action.successMessage || `${getObject(action.childObject).label} created`, recordId: id };
    }
    case 'flow': {
      const log = runFlowOnRecord(ctx, action.flowId, recordId);
      return { message: action.successMessage || `${action.label} complete`, log, recordId };
    }
    case 'url':
      return { url: mergeTemplate(action.url, fctx) };
  }
  throw new HttpError(400, 'Unknown action type');
}

// ---------- lead conversion ----------
const LEAD_TO_ACCOUNT = { Company: 'Name', Industry: 'Industry', Phone: 'Phone', Website: 'Website', AnnualRevenue: 'AnnualRevenue', NumberOfEmployees: 'NumberOfEmployees', Street: 'BillingStreet', City: 'BillingCity', State: 'BillingState', PostalCode: 'BillingPostalCode', Country: 'BillingCountry', Rating: 'Rating' };
const LEAD_TO_CONTACT = { FirstName: 'FirstName', LastName: 'LastName', Email: 'Email', Phone: 'Phone', MobilePhone: 'MobilePhone', Title: 'Title', LeadSource: 'LeadSource', Street: 'MailingStreet', City: 'MailingCity', State: 'MailingState', PostalCode: 'MailingPostalCode', Country: 'MailingCountry' };

function mapFields(lead, mapping, target) {
  const out = {};
  for (const [from, to] of Object.entries(mapping)) if (lead[from] != null && lead[from] !== '' && getField(target, to)) out[to] = lead[from];
  for (const f of getFields('Lead')) {
    if (!f.isCustom || COMPUTED_TYPES.has(f.type) || lead[f.apiName] == null) continue;
    if (getField(target, f.apiName) && !COMPUTED_TYPES.has(getField(target, f.apiName).type)) out[f.apiName] = lead[f.apiName];
  }
  return out;
}

export function convertLead(ctx, leadId, opts = {}) {
  requirePerm(ctx, 'ConvertLeads');
  const lead = getRecord(ctx, leadId, { requireAccess: 'edit' });
  if (lead.attributes.type !== 'Lead') throw new HttpError(400, 'Not a lead');
  if (lead.IsConverted) throw new HttpError(400, 'This lead was already converted');
  const ownerId = opts.ownerId || ctx.user.Id;
  const statuses = getField('Lead', 'Status')?.values || [];
  const convertedStatus = opts.convertedStatus || statuses.find((s) => s.converted)?.value || 'Closed - Converted';
  return tx(() => {
    let accountId = opts.accountId;
    if (accountId) getRecord(ctx, accountId);
    else accountId = createRecord(ctx, 'Account', { ...mapFields(lead, LEAD_TO_ACCOUNT, 'Account'), Name: opts.accountName || lead.Company || `${lead.Name}`, OwnerId: ownerId });
    let contactId = opts.contactId;
    if (contactId) getRecord(ctx, contactId);
    else contactId = createRecord(ctx, 'Contact', { ...mapFields(lead, LEAD_TO_CONTACT, 'Contact'), AccountId: accountId, OwnerId: ownerId });
    let opportunityId = null;
    if (!opts.doNotCreateOpportunity) {
      const stage = getField('Opportunity', 'StageName')?.values?.find((v) => v.isActive !== false)?.value;
      opportunityId = createRecord(ctx, 'Opportunity', {
        Name: opts.opportunityName || `${lead.Company || lead.Name}-`, AccountId: accountId, StageName: stage,
        CloseDate: addDays(todayStr(), 30), LeadSource: lead.LeadSource, OwnerId: ownerId,
      });
    }
    const sys = asSystem(ctx);
    updateRecord(sys, leadId, {
      Status: convertedStatus, IsConverted: true, ConvertedDate: todayStr(), ConvertedAccountId: accountId,
      ConvertedContactId: contactId, ConvertedOpportunityId: opportunityId,
    }, { trusted: true });
    // Move the lead's activities to the new contact (and account).
    for (const objApi of ['Task', 'Event']) {
      for (const { rec } of visibleRecords(sys, objApi, { where: { t: 'cmp', field: 'WhoId', op: '=', value: leadId } })) {
        updateRecord(sys, rec.Id, { WhoId: contactId, WhatId: rec.WhatId || accountId }, { trusted: true });
      }
    }
    run('UPDATE feed SET parent_id = ? WHERE parent_id = ?', contactId, leadId);
    return { accountId, contactId, opportunityId };
  });
}

// ---------- import / export ----------
export function importRecords(ctx, objApi, { rows = [], mode = 'insert', matchField = 'Id' }) {
  requirePerm(ctx, 'ImportData', 'ModifyAllData');
  const obj = requireObject(objApi);
  if (rows.length > 5000) throw new HttpError(400, 'Import is limited to 5,000 rows at a time');
  const result = { created: 0, updated: 0, errors: [] };
  let index = null;
  if (mode !== 'insert' && matchField !== 'Id') {
    const f = getField(obj.apiName, matchField);
    if (!f || !(f.externalId || f.unique || f.apiName === 'Name')) throw new HttpError(400, 'Match field must be an External ID, unique field, or Name');
    index = new Map(visibleRecords(ctx, obj.apiName).map(({ rec }) => [String(rec[f.apiName] ?? '').toLowerCase(), rec.Id]));
  }
  rows.forEach((row, i) => {
    try {
      const values = Object.fromEntries(Object.entries(row).filter(([k, v]) => k !== 'Id' && v !== undefined));
      let id = null;
      if (mode !== 'insert') id = matchField === 'Id' ? row.Id : index.get(String(row[matchField] ?? '').toLowerCase());
      if (mode === 'update' && !id) throw new HttpError(400, 'No matching record found');
      if (id) { updateRecord(ctx, id, values); result.updated++; }
      else { const nid = createRecord(ctx, obj.apiName, values); result.created++; if (index && row[matchField]) index.set(String(row[matchField]).toLowerCase(), nid); }
    } catch (e) {
      result.errors.push({ row: i + 1, message: e instanceof ValidationError ? e.errors.map((x) => (x.field ? `${x.field}: ` : '') + x.message).join('; ') : e.message });
    }
  });
  audit(ctx.user.Id, 'Data Management', 'Import', `${obj.apiName}: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`);
  return result;
}

export function exportCsv(ctx, objApi) {
  requirePerm(ctx, 'ExportReports', 'ModifyAllData');
  const obj = requireObject(objApi);
  const fields = getFields(obj.apiName).filter((f) => fieldAccess(ctx, obj.apiName, f).read);
  const lines = [fields.map((f) => f.apiName).join(',')];
  for (const { rec } of visibleRecords(ctx, obj.apiName)) lines.push(fields.map((f) => csvEscape(rec[f.apiName])).join(','));
  audit(ctx.user.Id, 'Data Management', 'Export', obj.apiName);
  return lines.join('\n');
}

// ---------- notifications ----------
export function notificationsFor(ctx) {
  const items = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', ctx.user.Id);
  return { unread: items.filter((n) => !n.is_read).length, items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: !!n.is_read, createdAt: n.created_at })) };
}

export function markNotificationsRead(ctx, ids) {
  if (ids?.length) for (const id of ids) run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', id, ctx.user.Id);
  else run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', ctx.user.Id);
}

// ---------- home ----------
export function homeData(ctx) {
  const today = todayStr();
  const out = { tasks: [], events: [], approvals: pendingApprovals(ctx).slice(0, 10), recent: recentItems(ctx, 8), pipeline: null, stats: [] };
  if (getObject('Task') && objectPerm(ctx, 'Task', 'read')) {
    const where = { t: 'and', items: [{ t: 'cmp', field: 'Status', op: '!=', value: 'Completed' }] };
    out.tasks = queryRecords(ctx, 'Task', { where, scope: 'mine', sort: [{ field: 'ActivityDate', dir: 'asc' }], limit: 8 }).records;
  }
  if (getObject('Event') && objectPerm(ctx, 'Event', 'read')) {
    const where = { t: 'cmp', field: 'StartDateTime', op: '>=', value: today };
    out.events = queryRecords(ctx, 'Event', { where, scope: 'mine', sort: [{ field: 'StartDateTime', dir: 'asc' }], limit: 6 }).records;
  }
  if (getObject('Opportunity') && objectPerm(ctx, 'Opportunity', 'read')) {
    const stages = (getField('Opportunity', 'StageName')?.values || []).filter((v) => v.isActive !== false);
    const items = visibleRecords(ctx, 'Opportunity', { scope: 'mine' });
    const by = new Map(stages.map((s) => [s.value, { stage: s.value, amount: 0, count: 0, closed: !!s.closed, won: !!s.won }]));
    let open = 0, won = 0, wonCount = 0, closedQuarter = 0;
    const q = Math.floor(new Date().getUTCMonth() / 3), y = new Date().getUTCFullYear();
    for (const { rec } of items) {
      const b = by.get(rec.StageName);
      if (b) { b.amount += Number(rec.Amount || 0); b.count++; }
      if (!b?.closed) open += Number(rec.Amount || 0);
      const cd = rec.CloseDate ? new Date(rec.CloseDate) : null;
      if (b?.won && cd && cd.getUTCFullYear() === y && Math.floor(cd.getUTCMonth() / 3) === q) { won += Number(rec.Amount || 0); wonCount++; }
      if (b?.closed && cd && cd.getUTCFullYear() === y && Math.floor(cd.getUTCMonth() / 3) === q) closedQuarter++;
    }
    out.pipeline = [...by.values()].filter((b) => !b.closed);
    out.stats.push({ label: 'Open pipeline', value: open, type: 'Currency' }, { label: 'Closed won this quarter', value: won, type: 'Currency' },
      { label: 'Win rate this quarter', value: closedQuarter ? Math.round((wonCount / closedQuarter) * 100) : 0, type: 'Percent' });
  }
  if (getObject('Case') && objectPerm(ctx, 'Case', 'read')) {
    const openCases = visibleRecords(ctx, 'Case', { scope: 'mine', where: { t: 'cmp', field: 'Status', op: '!=', value: 'Closed' } }).length;
    out.stats.push({ label: 'My open cases', value: openCases, type: 'Number' });
  }
  return out;
}

export { userGroupIds, accessAtLeast };
