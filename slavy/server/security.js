// Security model: profiles + permission sets (object CRUD, field-level security, system permissions)
// and record-level sharing (org-wide defaults, role hierarchy, queues, sharing rules, manual shares).
import { all, get } from './db.js';
import { getMeta, listMeta, getObject, masterDetailField, objectForId } from './metadata.js';
import { evalCondition, filtersToCondition } from './conditions.js';
import { loadRaw } from './store.js';
import { HttpError, prefixOf, PREFIX } from './util.js';

export const SYSTEM_PERMISSIONS = [
  ['ModifyAllData', 'Modify All Data'],
  ['ViewAllData', 'View All Data'],
  ['ViewSetup', 'View Setup and Configuration'],
  ['CustomizeApplication', 'Customize Application'],
  ['ManageUsers', 'Manage Users'],
  ['ManageFlows', 'Manage Flows'],
  ['RunReports', 'Run Reports'],
  ['ManageReports', 'Create and Customize Reports'],
  ['ManageDashboards', 'Create and Customize Dashboards'],
  ['ExportReports', 'Export Reports'],
  ['ApiEnabled', 'API Enabled'],
  ['ImportData', 'Import Data'],
  ['ManagePublicListViews', 'Manage Public List Views'],
  ['TransferRecords', 'Transfer Record (Change Owner)'],
  ['ConvertLeads', 'Convert Leads'],
  ['RunSoql', 'Use Developer Console (SOQL)'],
  ['UseAI', 'Use AI Features'],
];

export const OBJECT_PERMS = ['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'];
const RANK = { none: 0, read: 1, edit: 2, all: 3 };
export const maxAccess = (a, b) => (RANK[a] >= RANK[b] ? a : b);
export const accessAtLeast = (a, b) => RANK[a] >= RANK[b];

// ---------- users ----------
export function getUser(id) {
  return id ? get('SELECT * FROM users WHERE id = ?', id) || null : null;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    Id: u.id, Username: u.username, Email: u.email, FirstName: u.first_name, LastName: u.last_name,
    Name: [u.first_name, u.last_name].filter(Boolean).join(' '), Alias: u.alias, Title: u.title, Phone: u.phone,
    ProfileId: u.profile_id, RoleId: u.role_id, ManagerId: u.manager_id, IsActive: !!u.is_active,
    TimeZone: u.timezone, CreatedDate: u.created_at, LastLoginDate: u.last_login,
  };
}

// ---------- permissions ----------
function normalizeObjectPerms(p = {}) {
  const o = { ...p };
  if (o.modifyAll) Object.assign(o, { viewAll: true, read: true, create: true, edit: true, delete: true });
  if (o.viewAll) o.read = true;
  if (o.delete) o.edit = true;
  if (o.edit || o.create) o.read = true;
  return o;
}

export function mergePermissions(list) {
  const out = { system: {}, objects: {}, fields: {} };
  for (const p of list) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p.system || {})) if (v) out.system[k] = true;
    for (const [obj, ops] of Object.entries(p.objects || {})) {
      const cur = out.objects[obj] || {};
      for (const k of OBJECT_PERMS) if (ops[k]) cur[k] = true;
      out.objects[obj] = cur;
    }
    for (const [f, fls] of Object.entries(p.fields || {})) {
      const cur = out.fields[f] || { read: false, edit: false };
      cur.read ||= !!fls.read || !!fls.edit;
      cur.edit ||= !!fls.edit;
      out.fields[f] = cur;
    }
  }
  for (const k of Object.keys(out.objects)) out.objects[k] = normalizeObjectPerms(out.objects[k]);
  return out;
}

export function effectivePermissions(user) {
  const profile = getMeta(user.profile_id, 'profile');
  const sets = all('SELECT permset_id FROM permset_assignments WHERE user_id = ?', user.id)
    .map((r) => getMeta(r.permset_id, 'permissionSet')).filter(Boolean);
  // Profile FLS entries are restrictions only when explicitly set; permission sets only grant.
  const perms = mergePermissions([profile?.permissions, ...sets.map((s) => s.permissions)]);
  perms.profileFields = profile?.permissions?.fields || {};
  return perms;
}

// ---------- contexts ----------
export function buildContext(user, extra = {}) {
  return {
    user: publicUser(user),
    perms: effectivePermissions(user),
    isSystem: false,
    cache: new Map(),
    depth: 0,
    ...extra,
  };
}

export function systemContext(user) {
  return {
    user: user ? (user.Id ? user : publicUser(user)) : { Id: null, Name: 'Automated Process' },
    perms: { system: {}, objects: {}, fields: {} },
    isSystem: true,
    cache: new Map(),
    depth: 0,
  };
}

// Run fn in system mode but keep the acting user (flows, approvals).
export function asSystem(ctx) {
  return { ...ctx, isSystem: true, cache: ctx.cache };
}

export const hasPerm = (ctx, perm) => ctx.isSystem || !!ctx.perms.system.ModifyAllData || !!ctx.perms.system[perm];

export function requirePerm(ctx, ...perms) {
  if (!perms.some((p) => hasPerm(ctx, p))) throw new HttpError(403, `Insufficient privileges (requires ${perms.join(' or ')})`);
}

export function objectPerm(ctx, objApi, op) {
  if (ctx.isSystem || ctx.perms.system.ModifyAllData) return true;
  if ((op === 'read' || op === 'viewAll') && ctx.perms.system.ViewAllData) return true;
  return !!ctx.perms.objects[objApi]?.[op];
}

export function requireObjectPerm(ctx, objApi, op) {
  if (!objectPerm(ctx, objApi, op)) {
    const obj = getObject(objApi);
    throw new HttpError(403, `You don't have permission to ${op} ${obj?.pluralLabel || objApi}`);
  }
}

export function fieldAccess(ctx, objApi, field) {
  if (field.system) {
    return { read: true, edit: !field.readOnly };
  }
  if (ctx.isSystem || ctx.perms.system.ModifyAllData) return { read: true, edit: true };
  const key = `${objApi}.${field.apiName}`;
  const restricted = ctx.perms.profileFields?.[key];
  const granted = ctx.perms.fields[key];
  let read = restricted ? !!(restricted.read || restricted.edit) : true;
  let edit = restricted ? !!restricted.edit : true;
  if (granted?.read) read = true;
  if (granted?.edit) edit = true;
  if (ctx.perms.system.ViewAllData) read = true;
  return { read, edit: edit && read };
}

// ---------- roles, groups ----------
function roles() { return listMeta('role'); }

export function subordinateRoleIds(roleId) {
  const out = new Set();
  if (!roleId) return out;
  const byParent = new Map();
  for (const r of roles()) {
    if (!byParent.has(r.parentId)) byParent.set(r.parentId, []);
    byParent.get(r.parentId).push(r.id);
  }
  const stack = [...(byParent.get(roleId) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(byParent.get(id) || []));
  }
  return out;
}

export function ancestorRoleIds(roleId) {
  const byId = new Map(roles().map((r) => [r.id, r]));
  const out = [];
  let cur = byId.get(roleId);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur.id);
    cur = byId.get(cur.parentId);
  }
  return out;
}

// Does a user (id + roleId) belong to a group or queue?
export function userInGroup(userId, roleId, group) {
  const ancestors = ancestorRoleIds(roleId);
  return (group.members || []).some((m) => m === userId || m === roleId || (m.startsWith('sub:') && ancestors.includes(m.slice(4))));
}

function memo(ctx, key, fn) {
  if (!ctx.cache) return fn();
  if (!ctx.cache.has(key)) ctx.cache.set(key, fn());
  return ctx.cache.get(key);
}

export function userGroupIds(ctx) {
  return memo(ctx, 'sec:groups', () => new Set(listMeta('group')
    .filter((g) => userInGroup(ctx.user.Id, ctx.user.RoleId, g)).map((g) => g.id)));
}

function subordinateUserIds(ctx) {
  return memo(ctx, 'sec:subUsers', () => {
    const subRoles = subordinateRoleIds(ctx.user.RoleId);
    if (!subRoles.size) return new Set();
    return new Set(all('SELECT id, role_id FROM users').filter((u) => subRoles.has(u.role_id)).map((u) => u.id));
  });
}

function userRoleMap(ctx) {
  return memo(ctx, 'sec:userRoles', () => new Map(all('SELECT id, role_id FROM users').map((u) => [u.id, u.role_id])));
}

function principalMatches(ctx, principal, userId, roleId) {
  if (!principal) return false;
  switch (principal.kind) {
    case 'allUsers': return true;
    case 'role': return roleId === principal.id;
    case 'roleSub': return roleId === principal.id || ancestorRoleIds(roleId).includes(principal.id);
    case 'group': {
      const g = getMeta(principal.id, 'group');
      return !!g && (userId === ctx.user.Id ? userGroupIds(ctx).has(g.id) : userInGroup(userId, roleId, g));
    }
    case 'user': return userId === principal.id;
  }
  return false;
}

function manualShares(ctx, recordId) {
  const map = memo(ctx, 'sec:shares', () => {
    const m = new Map();
    for (const s of all('SELECT * FROM record_shares')) {
      if (!m.has(s.record_id)) m.set(s.record_id, []);
      m.get(s.record_id).push(s);
    }
    return m;
  });
  return map.get(recordId) || [];
}

// ---------- record access ----------
// Returns 'none' | 'read' | 'edit' | 'all' ("all" = owner-level: delete, share, transfer).
export function recordAccess(ctx, objDef, raw, getValue, depth = 0) {
  if (!raw) return 'none';
  if (ctx.isSystem) return 'all';
  const api = objDef.apiName;
  if (!objectPerm(ctx, api, 'read')) return 'none';
  if (ctx.perms.system.ModifyAllData || ctx.perms.objects[api]?.modifyAll) return 'all';
  let level = 'none';
  if (ctx.perms.system.ViewAllData || ctx.perms.objects[api]?.viewAll) level = 'read';

  const uid = ctx.user.Id;
  const owner = raw.OwnerId;

  if (objDef.sharingModel === 'ControlledByParent' && depth < 4) {
    if (objDef.isActivity) {
      if (owner === uid || subordinateUserIds(ctx).has(owner)) return 'all';
      for (const ref of [raw.WhatId, raw.WhoId]) {
        const parentObj = ref && getObject(objectForId(ref));
        if (!parentObj) continue;
        const parent = loadRaw(ctx, ref);
        const a = recordAccess(ctx, parentObj, parent, getValue, depth + 1);
        level = maxAccess(level, a === 'all' ? 'edit' : a);
      }
      return level;
    }
    const md = masterDetailField(api);
    if (md) {
      const parentObj = getObject(md.referenceTo);
      const parent = loadRaw(ctx, raw[md.apiName]);
      const a = recordAccess(ctx, parentObj, parent, getValue, depth + 1);
      return maxAccess(level, a);
    }
  }

  if (owner === uid) return 'all';
  if (owner && subordinateUserIds(ctx).has(owner)) return 'all';
  if (prefixOf(owner) === PREFIX.Group && userGroupIds(ctx).has(owner)) return 'all';

  if (objDef.sharingModel === 'ReadWrite' || objDef.sharingModel === 'Public') level = maxAccess(level, 'edit');
  else if (objDef.sharingModel === 'Read') level = maxAccess(level, 'read');
  if (level === 'edit') return level;

  // Sharing rules
  const ownerRole = userRoleMap(ctx).get(owner);
  for (const rule of listMeta('sharingRule', api)) {
    if (rule.active === false) continue;
    if (!principalMatches(ctx, rule.sharedWith, uid, ctx.user.RoleId)) continue;
    let applies = false;
    if (rule.ruleType === 'criteria') {
      const cond = memo(ctx, 'sec:rule:' + rule.id, () => filtersToCondition(rule.filters || [], rule.filterLogic));
      applies = !!cond && evalCondition(cond, (path) => getValue(raw, path));
    } else {
      applies = principalMatches(ctx, rule.ownedBy, owner, ownerRole);
    }
    if (applies) level = maxAccess(level, rule.access === 'edit' ? 'edit' : 'read');
  }

  // Manual shares (to user, role or group)
  const groups = userGroupIds(ctx);
  for (const s of manualShares(ctx, raw.Id)) {
    if (s.grantee_id === uid || s.grantee_id === ctx.user.RoleId || groups.has(s.grantee_id)) {
      level = maxAccess(level, s.access === 'edit' ? 'edit' : 'read');
    }
  }
  return level;
}

