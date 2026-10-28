// Record engine: CRUD with type coercion, defaults, formulas, roll-ups, required/unique checks,
// validation rules & flows (via hooks), field history, cascade delete, sharing-aware queries.
import { all, get, run, tx, nextCounter } from './db.js';
import {
  getObject, requireObject, getFields, getField, getRelationship, objectForId, childRelationships,
  COMPUTED_TYPES, REFERENCE_TYPES, getMeta, listMeta,
} from './metadata.js';
import {
  recordAccess, requireObjectPerm, objectPerm, fieldAccess, accessAtLeast, getUser, publicUser, hasPerm,
} from './security.js';
import { evaluate, SDate, FormulaError, toText } from './formula.js';
import { evalCondition, conditionFields } from './conditions.js';
import { loadRaw, loadAllRaw, childrenOf, clearCache } from './store.js';
import { HttpError, ValidationError, newId, nowIso, prefixOf, PREFIX } from './util.js';

// Automation registers here (flows, validation rules) to avoid an import cycle.
export const hooks = { validate: [], beforeSave: [], afterSave: [], afterDelete: [] };

// Fields exposed for the virtual User object (lookups like Owner.Name, $User.Email).
export const USER_FIELDS = [
  { apiName: 'Id', label: 'User ID', type: 'Id' },
  { apiName: 'Name', label: 'Full Name', type: 'Text' },
  { apiName: 'FirstName', label: 'First Name', type: 'Text' },
  { apiName: 'LastName', label: 'Last Name', type: 'Text' },
  { apiName: 'Email', label: 'Email', type: 'Email' },
  { apiName: 'Username', label: 'Username', type: 'Text' },
  { apiName: 'Alias', label: 'Alias', type: 'Text' },
  { apiName: 'Title', label: 'Title', type: 'Text' },
  { apiName: 'Phone', label: 'Phone', type: 'Phone' },
  { apiName: 'ProfileId', label: 'Profile', type: 'Text' },
  { apiName: 'RoleId', label: 'Role', type: 'Text' },
  { apiName: 'ManagerId', label: 'Manager', type: 'Lookup', referenceTo: 'User', relationshipName: 'Manager' },
  { apiName: 'IsActive', label: 'Active', type: 'Checkbox' },
];
const USER_FIELD_MAP = new Map(USER_FIELDS.map((f) => [f.apiName.toLowerCase(), f]));

function userRecord(ctx, id) {
  const key = 'user:' + id;
  if (ctx.cache?.has(key)) return ctx.cache.get(key);
  const u = publicUser(getUser(id));
  ctx.cache?.set(key, u);
  return u;
}

// ---------- typed values ----------
export function formulaValue(field, v) {
  if (v == null || v === '') return field && ['Number', 'Currency', 'Percent'].includes(field.type) ? null : v ?? null;
  switch (field?.type === 'Formula' || field?.type === 'Rollup' ? field.returnType || 'Number' : field?.type) {
    case 'Date': return SDate.parse(v);
    case 'DateTime': return new Date(v);
    case 'Number': case 'Currency': case 'Percent': return Number(v);
    case 'Checkbox': return v === true || v === 'true' || v === 1;
    default: return v;
  }
}

function storeComputed(field, v) {
  if (v == null) return null;
  const rt = field.returnType || 'Number';
  if (rt === 'Date') return v instanceof SDate ? v.toString() : SDate.parse(v)?.toString() ?? null;
  if (rt === 'DateTime') return v instanceof Date ? v.toISOString() : toText(v);
  if (rt === 'Checkbox') return Boolean(v);
  if (['Number', 'Currency', 'Percent'].includes(rt)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(n)) return null;
    const scale = field.scale ?? 2;
    return Math.round(n * 10 ** scale) / 10 ** scale;
  }
  return toText(v);
}

const GLOBALS = {
  $user: (ctx, f) => {
    const u = ctx.user?.Id ? userRecord(ctx, ctx.user.Id) : ctx.user;
    const def = USER_FIELD_MAP.get(f.toLowerCase());
    return def ? formulaValue(def, u?.[def.apiName]) : null;
  },
  $organization: (ctx, f) => {
    const org = get("SELECT value FROM org WHERE key = 'company'");
    const c = org ? JSON.parse(org.value) : {};
    return c[f] ?? c[f.charAt(0).toLowerCase() + f.slice(1)] ?? null;
  },
  $profile: (ctx, f) => (f.toLowerCase() === 'name' ? getMeta(ctx.user?.ProfileId)?.name ?? null : ctx.user?.ProfileId),
  $userrole: (ctx, f) => (f.toLowerCase() === 'name' ? getMeta(ctx.user?.RoleId)?.name ?? null : ctx.user?.RoleId),
};

const state = new WeakMap(); // rec -> { done:Set, busy:Set }

function computeLocal(ctx, objApi, rec, f) {
  let st = state.get(rec);
  if (!st) { st = { done: new Set(), busy: new Set() }; state.set(rec, st); }
  if (st.done.has(f.apiName)) return rec[f.apiName];
  if (st.busy.has(f.apiName)) throw new FormulaError(`Circular reference in ${f.apiName}`);
  st.busy.add(f.apiName);
  let v = null;
  try {
    if (f.type === 'Formula') {
      v = storeComputed(f, evaluate(f.formula, formulaContext(ctx, objApi, rec)));
    } else if (f.type === 'Rollup') {
      v = computeRollup(ctx, rec, f);
    }
  } catch (e) {
    v = null;
  } finally {
    st.busy.delete(f.apiName);
  }
  rec[f.apiName] = v;
  st.done.add(f.apiName);
  return v;
}

function computeRollup(ctx, rec, f) {
  const r = f.rollup;
  if (!rec.Id) return r.op === 'COUNT' ? 0 : null;
  let kids = childrenOf(ctx, r.childObject, r.relField, rec.Id);
  const needEnrich = r.filter || (r.field && COMPUTED_TYPES.has(getField(r.childObject, r.field)?.type));
  if (needEnrich) kids = kids.map((k) => enriched(ctx, k));
  if (r.filter) kids = kids.filter((k) => { try { return Boolean(evaluate(r.filter, formulaContext(ctx, r.childObject, k))); } catch { return false; } });
  if (r.op === 'COUNT') return kids.length;
  const vals = kids.map((k) => k[r.field]).filter((v) => v != null && v !== '');
  if (!vals.length) return r.op === 'SUM' ? 0 : null;
  const cf = getField(r.childObject, r.field);
  const isDate = cf && ['Date', 'DateTime'].includes(cf.type);
  if (isDate) {
    const s = vals.map(String).sort();
    return r.op === 'MIN' ? s[0] : s[s.length - 1];
  }
  const nums = vals.map(Number);
  switch (r.op) {
    case 'SUM': return nums.reduce((a, b) => a + b, 0);
    case 'MIN': return Math.min(...nums);
    case 'MAX': return Math.max(...nums);
    case 'AVG': return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
  return null;
}

// Value for a formula reference (typed: SDate, Date, number, boolean, string).
function formulaGet(ctx, objApi, rec, path, depth = 0) {
  if (path.startsWith('$')) {
    const [g, ...rest] = path.split('.');
    const fn = GLOBALS[g.toLowerCase()];
    if (!fn) throw new FormulaError(`Unknown global ${g}`);
    return fn(ctx, rest.join('.'));
  }
  if (depth > 5) throw new FormulaError('Too many relationship levels');
  const dot = path.indexOf('.');
  if (dot < 0) {
    if (objApi === 'User') {
      const def = USER_FIELD_MAP.get(path.toLowerCase());
      if (!def) throw new FormulaError(`Unknown field User.${path}`);
      return formulaValue(def, rec?.[def.apiName]);
    }
    const f = getField(objApi, path);
    if (!f) throw new FormulaError(`Unknown field ${path} on ${objApi}`);
    const v = f.type === 'Formula' || f.type === 'Rollup' ? computeLocal(ctx, objApi, rec, f) : rec?.[f.apiName];
    return formulaValue(f, v);
  }
  const relName = path.slice(0, dot), rest = path.slice(dot + 1);
  const rel = objApi === 'User'
    ? (relName.toLowerCase() === 'manager' ? USER_FIELD_MAP.get('managerid') : null)
    : getRelationship(objApi, relName);
  if (!rel) throw new FormulaError(`Unknown relationship ${relName} on ${objApi}`);
  const id = rec?.[rel.apiName];
  if (!id) return null;
  if (rel.referenceTo === 'User' || prefixOf(id) === PREFIX.User) return formulaGet(ctx, 'User', userRecord(ctx, id), rest, depth + 1);
  if (prefixOf(id) === PREFIX.Group) {
    return rest.toLowerCase() === 'name' ? getMeta(id)?.label ?? getMeta(id)?.name : null;
  }
  const parentObj = objectForId(id);
  if (!parentObj) return null;
  const parent = loadRaw(ctx, id);
  return parent ? formulaGet(ctx, parentObj, parent, rest, depth + 1) : null;
}

export function formulaContext(ctx, objApi, rec, { prior = null, isNew = false } = {}) {
  return {
    isNew,
    get: (path) => formulaGet(ctx, objApi, rec, path),
    prior: (path) => (prior ? formulaGet(ctx, objApi, prior, path) : null),
    isChanged: (path) => {
      if (isNew || !prior) return false;
      const a = formulaGet(ctx, objApi, rec, path), b = formulaGet(ctx, objApi, prior, path);
      return toText(a) !== toText(b);
    },
  };
}

export function evalFormula(ctx, objApi, rec, formula, opts) {
  return evaluate(formula, formulaContext(ctx, objApi, rec, opts));
}

// Raw record + computed fields, cached per request.
export function enriched(ctx, raw) {
  if (!raw) return null;
  const objApi = raw.__object;
  const key = 'enr:' + raw.Id;
  if (ctx.cache?.has(key)) return ctx.cache.get(key);
  const rec = enrichFresh(ctx, objApi, raw);
  ctx.cache?.set(key, rec);
  return rec;
}

function enrichFresh(ctx, objApi, raw) {
  const rec = { ...raw, __object: objApi };
  for (const f of getFields(objApi)) {
    if (f.type === 'Formula' || f.type === 'Rollup') computeLocal(ctx, objApi, rec, f);
  }
  return rec;
}

// Stored-format value at a (possibly dotted) path, with its type. Used by filters, reports, SOQL.
export function pathValue(ctx, objApi, rec, path) {
  const parts = String(path).split('.');
  let curObj = objApi, cur = rec;
  for (let i = 0; i < parts.length - 1; i++) {
    const rel = curObj === 'User' ? (parts[i].toLowerCase() === 'manager' ? USER_FIELD_MAP.get('managerid') : null) : getRelationship(curObj, parts[i]);
    if (!rel) throw new HttpError(400, `Unknown relationship ${parts[i]} on ${curObj}`);
    const id = cur?.[rel.apiName];
    if (!id) {
      return { value: null, type: fieldTypeAt(curObj, parts.slice(i).join('.')), field: null };
    }
    if (prefixOf(id) === PREFIX.User) { curObj = 'User'; cur = userRecord(ctx, id); continue; }
    if (prefixOf(id) === PREFIX.Group) {
      const g = getMeta(id);
      curObj = 'Group'; cur = { Id: id, Name: g?.label || g?.name };
      continue;
    }
    curObj = objectForId(id);
    cur = curObj ? enriched(ctx, loadRaw(ctx, id)) : null;
  }
  const last = parts[parts.length - 1];
  if (curObj === 'User' || curObj === 'Group') {
    const def = USER_FIELD_MAP.get(last.toLowerCase()) || { apiName: last, type: 'Text' };
    return { value: cur?.[def.apiName] ?? null, type: def.type, field: def };
  }
  const f = getField(curObj, last);
  if (!f) throw new HttpError(400, `Unknown field ${last} on ${curObj}`);
  const type = f.type === 'Formula' || f.type === 'Rollup' ? (f.returnType || 'Number') : f.type;
  return { value: cur?.[f.apiName] ?? null, type, field: f };
}

// Describe the field at the end of a path (for labels/types in reports & list views).
export function fieldAtPath(objApi, path) {
  const parts = String(path).split('.');
  let curObj = objApi;
  const labels = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const rel = curObj === 'User' ? (parts[i].toLowerCase() === 'manager' ? USER_FIELD_MAP.get('managerid') : null) : getRelationship(curObj, parts[i]);
    if (!rel) return null;
    labels.push(rel.label.replace(/ ID$/, ''));
    curObj = rel.referenceTo === 'User' ? 'User' : Array.isArray(rel.referenceTo) ? rel.referenceTo[0] : rel.referenceTo;
  }
  const last = parts[parts.length - 1];
  const f = curObj === 'User' ? USER_FIELD_MAP.get(last.toLowerCase()) : getField(curObj, last);
  if (!f) return null;
  return { ...f, path, object: curObj, fullLabel: [...labels, f.label].join(': ') };
}

function fieldTypeAt(objApi, path) {
  return fieldAtPath(objApi, path)?.type ?? 'Text';
}

// ---------- names / labels ----------
export function nameOf(ctx, id) {
  if (!id) return null;
  const key = 'name:' + id;
  if (ctx.cache?.has(key)) return ctx.cache.get(key);
  let name = null;
  const p = prefixOf(id);
  if (p === PREFIX.User) name = userRecord(ctx, id)?.Name ?? null;
  else if (p === PREFIX.Group) { const g = getMeta(id); name = g?.label || g?.name || null; }
  else {
    const row = get('SELECT name FROM records WHERE id = ?', id);
    name = row?.name ?? null;
  }
  ctx.cache?.set(key, name);
  return name;
}

// Shape a record for API output: readable fields only, plus lookup labels.
export function shape(ctx, objApi, rec, access) {
  const out = { attributes: { type: objApi, url: `/services/data/v1.0/sobjects/${objApi}/${rec.Id}` }, Id: rec.Id };
  const labels = {};
  for (const f of getFields(objApi)) {
    if (f.apiName === 'Id') continue;
    if (!fieldAccess(ctx, objApi, f).read) continue;
    const v = rec[f.apiName];
    out[f.apiName] = v === undefined ? null : v;
    if ((REFERENCE_TYPES.has(f.type) || f.apiName === 'WhatId' || f.apiName === 'WhoId') && v) labels[f.apiName] = nameOf(ctx, v);
  }
  out._labels = labels;
  if (access) out._access = access;
  return out;
}

// ---------- reads ----------
function makeGetValue(ctx, objApi) {
  return (rec, path) => pathValue(ctx, objApi, rec, path);
}

export function accessFor(ctx, objApi, rec) {
  const obj = getObject(objApi);
  const gv = makeGetValue(ctx, objApi);
  return recordAccess(ctx, obj, rec, (r, p) => gv(enriched(ctx, r) || r, p));
}

export function getRecord(ctx, id, { requireAccess = 'read' } = {}) {
  const objApi = objectForId(id);
  if (!objApi) throw new HttpError(404, `Record ${id} not found`);
  requireObjectPerm(ctx, objApi, 'read');
  const raw = loadRaw(ctx, id);
  if (!raw) throw new HttpError(404, `Record ${id} not found or deleted`);
  const rec = enriched(ctx, raw);
  const access = accessFor(ctx, objApi, rec);
  if (!accessAtLeast(access, requireAccess)) {
    throw new HttpError(access === 'none' ? 404 : 403, access === 'none' ? `Record ${id} not found or you don't have access` : 'Insufficient access to this record');
  }
  return shape(ctx, objApi, rec, access);
}

const SEARCHABLE = new Set(['Text', 'Email', 'Phone', 'Url', 'Picklist', 'AutoNumber', 'TextArea']);

// Visible, enriched records of an object (before paging).
export function visibleRecords(ctx, objApi, { where, search, scope } = {}) {
  const obj = requireObject(objApi);
  requireObjectPerm(ctx, obj.apiName, 'read');
  if (where && !ctx.isSystem) {
    for (const path of conditionFields(where)) {
      const f = fieldAtPath(obj.apiName, path);
      if (!f) throw new HttpError(400, `Unknown field ${path}`);
      if (f.object && f.object !== 'User' && !f.system && !fieldAccess(ctx, f.object, f).read) throw new HttpError(403, `No access to field ${path}`);
    }
  }
  const gv = makeGetValue(ctx, obj.apiName);
  const out = [];
  const q = search ? String(search).toLowerCase().trim() : '';
  const searchFields = q ? getFields(obj.apiName).filter((f) => SEARCHABLE.has(f.type) && fieldAccess(ctx, obj.apiName, f).read) : [];
  for (const raw of loadAllRaw(ctx, obj.apiName)) {
    const rec = enriched(ctx, raw);
    if (scope === 'mine' && rec.OwnerId !== ctx.user.Id) continue;
    if (scope === 'queue' && prefixOf(rec.OwnerId) !== PREFIX.Group) continue;
    const access = recordAccess(ctx, obj, rec, gv);
    if (access === 'none') continue;
    if (where && !evalCondition(where, (p) => gv(rec, p))) continue;
    if (q && !searchFields.some((f) => rec[f.apiName] != null && String(rec[f.apiName]).toLowerCase().includes(q))) continue;
    out.push({ rec, access });
  }
  return out;
}

export function sortRecords(ctx, objApi, items, sort = []) {
  const gv = makeGetValue(ctx, objApi);
  const specs = sort.filter((s) => s && s.field);
  if (!specs.length) return items;
  const keyed = items.map((it) => ({ it, keys: specs.map((s) => gv(it.rec ?? it, s.field)) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < specs.length; i++) {
      const dir = String(specs[i].dir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      const x = a.keys[i].value, y = b.keys[i].value;
      const xn = x == null || x === '', yn = y == null || y === '';
      if (xn && yn) continue;
      if (xn) return specs[i].nulls === 'first' ? -1 : 1;
      if (yn) return specs[i].nulls === 'first' ? 1 : -1;
      let c;
      if (typeof x === 'number' && typeof y === 'number') c = x - y;
      else if (typeof x === 'boolean') c = (x === y ? 0 : x ? 1 : -1);
      else c = String(x).localeCompare(String(y), undefined, { sensitivity: 'base', numeric: true });
      if (c) return c * dir;
    }
    return 0;
  });
  return keyed.map((k) => k.it);
}

export function queryRecords(ctx, objApi, { where, search, sort, limit = 50, offset = 0, scope } = {}) {
  const obj = requireObject(objApi);
  let items = visibleRecords(ctx, obj.apiName, { where, search, scope });
  items = sortRecords(ctx, obj.apiName, items, sort?.length ? sort : [{ field: 'Name', dir: 'asc' }]);
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  return { total, records: page.map(({ rec, access }) => shape(ctx, obj.apiName, rec, access)) };
}

// ---------- writes ----------
const blank = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function coerce(field, value, errors) {
  if (blank(value)) return field.type === 'Checkbox' ? false : null;
  const err = (m) => { errors.push({ field: field.apiName, message: m }); return null; };
  switch (field.type) {
    case 'Text': case 'Phone': case 'Url': case 'TextArea': case 'LongTextArea': {
      const s = String(value);
      const max = field.length || (field.type === 'LongTextArea' ? 131072 : field.type === 'TextArea' ? 255 : 255);
      if (s.length > max) return err(`exceeds the maximum length of ${max}`);
      return field.type === 'Text' || field.type === 'Phone' || field.type === 'Url' ? s.trim() : s;
    }
    case 'Email': {
      const s = String(value).trim();
      return EMAIL_RE.test(s) ? s : err('invalid email address');
    }
    case 'Number': case 'Currency': case 'Percent': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[,$%\s]/g, ''));
      if (!Number.isFinite(n)) return err(`"${value}" is not a valid number`);
      const scale = field.scale ?? (field.type === 'Currency' ? 2 : 0);
      return Math.round(n * 10 ** scale) / 10 ** scale;
    }
    case 'Checkbox': return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
    case 'Date': {
      const d = SDate.parse(value);
      return d && !Number.isNaN(d.days) ? d.toString() : err(`"${value}" is not a valid date (YYYY-MM-DD)`);
    }
    case 'DateTime': {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? err(`"${value}" is not a valid date/time`) : d.toISOString();
    }
    case 'Picklist': {
      const s = String(value);
      const vals = (field.values || []).filter((v) => v.isActive !== false);
      const hit = vals.find((v) => v.value === s) || vals.find((v) => v.value.toLowerCase() === s.toLowerCase());
      if (!hit && field.restricted !== false && vals.length) return err(`bad value for restricted picklist: "${s}"`);
      return hit ? hit.value : s;
    }
    case 'MultiPicklist': {
      const parts = (Array.isArray(value) ? value : String(value).split(';')).map((x) => String(x).trim()).filter(Boolean);
      const allowed = new Map((field.values || []).map((v) => [v.value.toLowerCase(), v.value]));
      const outv = [];
      for (const p of parts) {
        const hit = allowed.get(p.toLowerCase());
        if (!hit && allowed.size && field.restricted !== false) return err(`bad value for restricted picklist: "${p}"`);
        outv.push(hit || p);
      }
      return [...new Set(outv)].join(';');
    }
    case 'Lookup': case 'MasterDetail': return String(value).trim();
    default: return value;
  }
}

function checkReference(ctx, objApi, field, id, errors) {
  if (!id) return;
  const p = prefixOf(id);
  if (field.ownerField) {
    if (p === PREFIX.User) {
      const u = getUser(id);
      if (!u || !u.is_active) errors.push({ field: field.apiName, message: 'owner must be an active user' });
      return;
    }
    if (p === PREFIX.Group) {
      const g = getMeta(id, 'group');
      if (!g || g.kind !== 'queue' || !(g.queueObjects || []).includes(objApi))
        errors.push({ field: field.apiName, message: `queue does not support ${objApi}` });
      return;
    }
    errors.push({ field: field.apiName, message: 'owner must be a user or queue' });
    return;
  }
  if (field.referenceTo === 'User') {
    if (p !== PREFIX.User || !getUser(id)) errors.push({ field: field.apiName, message: 'invalid user' });
    return;
  }
  const refs = Array.isArray(field.referenceTo) ? field.referenceTo : [field.referenceTo];
  const target = objectForId(id);
  if (!target || (!refs.includes('*') && !refs.includes(target))) {
    errors.push({ field: field.apiName, message: `id ${id} is not a valid ${refs.join('/')}` });
    return;
  }
  if (!loadRaw(ctx, id)) errors.push({ field: field.apiName, message: `related record ${id} does not exist` });
}

function autoNumber(objApi, field, format) {
  const n = nextCounter(`auto:${objApi}.${field}`);
  const fmt = format || '{0000}';
  // "{00001000}" = 8 digits starting at 1000; "{0000}" = 4 digits starting at 1.
  return fmt.replace(/\{(\d+)\}/, (_, z) => String(Number(z) > 0 ? Number(z) + n - 1 : n).padStart(z.length, '0')).replace(/\{YYYY\}/g, String(new Date().getUTCFullYear()));
}

function writeRow(objApi, rec, isNew) {
  const data = {};
  for (const f of getFields(objApi)) {
    if (f.system || f.type === 'Formula' || f.type === 'Rollup') continue;
    if (rec[f.apiName] !== undefined) data[f.apiName] = rec[f.apiName];
  }
  if (isNew) {
    run(`INSERT INTO records(id, object, name, data, owner_id, created_by, created_at, modified_by, modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, rec.Id, objApi, rec.Name ?? null, JSON.stringify(data), rec.OwnerId,
      rec.CreatedById, rec.CreatedDate, rec.LastModifiedById, rec.LastModifiedDate);
  } else {
    run('UPDATE records SET name = ?, data = ?, owner_id = ?, modified_by = ?, modified_at = ? WHERE id = ?',
      rec.Name ?? null, JSON.stringify(data), rec.OwnerId, rec.LastModifiedById, rec.LastModifiedDate, rec.Id);
  }
}

export function isLocked(id) {
  return !!get("SELECT 1 FROM approvals WHERE record_id = ? AND status = 'Pending'", id);
}

function applyInput(ctx, objApi, rec, input, errors, { isNew, trusted }) {
  for (const [key, value] of Object.entries(input || {})) {
    if (key === 'attributes' || key.startsWith('_')) continue;
    const f = getField(objApi, key);
    if (!f) { errors.push({ message: `No such field ${key} on ${objApi}` }); continue; }
    if (f.apiName === 'Id') continue;
    if (!trusted) {
      if (f.readOnly || COMPUTED_TYPES.has(f.type)) { errors.push({ field: f.apiName, message: 'field is not writeable' }); continue; }
      const fa = fieldAccess(ctx, objApi, f);
      if (!fa.edit) { errors.push({ field: f.apiName, message: 'you do not have permission to edit this field' }); continue; }
      if (f.type === 'MasterDetail' && !isNew && f.reparentable !== true && value !== rec[f.apiName]) {
        errors.push({ field: f.apiName, message: 'master-detail relationship cannot be reparented' }); continue;
      }
    } else if (f.type === 'Formula' || f.type === 'Rollup') continue;
    rec[f.apiName] = coerce(f, value, errors);
  }
}

// Apply values with coercion in trusted (automation) mode, e.g. before-save flow field updates.
export function applyTrusted(ctx, objApi, rec, values) {
  const errors = [];
  applyInput(ctx, objApi, rec, values, errors, { isNew: false, trusted: true });
  if (errors.length) throw new ValidationError(errors);
}

// Create or update. `trusted` = called from automation (system mode, may set read-only fields).
export function saveRecord(ctx, objApi, id, input, { trusted = false } = {}) {
  const obj = requireObject(objApi);
  const api = obj.apiName;
  const isNew = !id;
  if (ctx.depth > 8) throw new HttpError(500, 'Maximum automation depth exceeded (possible recursive flow)');
  requireObjectPerm(ctx, api, isNew ? 'create' : 'edit');

  let old = null;
  if (!isNew) {
    const raw = loadRaw(ctx, id);
    if (!raw || raw.__object !== api) throw new HttpError(404, `Record ${id} not found`);
    old = enriched(ctx, raw);
    const access = accessFor(ctx, api, old);
    if (!accessAtLeast(access, 'edit')) throw new HttpError(403, 'Insufficient access to edit this record');
    if (!ctx.isSystem && isLocked(id) && !hasPerm(ctx, 'ModifyAllData')) {
      const pending = get("SELECT approver_id FROM approvals WHERE record_id = ? AND status = 'Pending'", id);
      if (pending?.approver_id !== ctx.user.Id) throw new HttpError(403, 'This record is locked while it is pending approval');
    }
    if (input && 'OwnerId' in input && input.OwnerId !== old.OwnerId && !ctx.isSystem
      && access !== 'all' && !hasPerm(ctx, 'TransferRecords')) {
      throw new HttpError(403, 'Only the owner, someone above them in the role hierarchy, or an administrator can change the owner');
    }
  }

  const errors = [];
  const now = nowIso();
  const rec = isNew ? { Id: newId(obj.keyPrefix), __object: api } : stripComputed(api, old);
  if (isNew) {
    // defaults
    for (const f of getFields(api)) {
      if (f.system || COMPUTED_TYPES.has(f.type)) continue;
      if (f.type === 'Checkbox') rec[f.apiName] = false;
      if ((f.type === 'Picklist' || f.type === 'MultiPicklist') && f.values) {
        const d = f.values.filter((v) => v.isDefault && v.isActive !== false).map((v) => v.value);
        if (d.length) rec[f.apiName] = f.type === 'Picklist' ? d[0] : d.join(';');
      }
      if (f.defaultValue != null && f.defaultValue !== '') {
        try {
          const v = evaluate(String(f.defaultValue), formulaContext(ctx, api, rec, { isNew: true }));
          rec[f.apiName] = coerce(f, v instanceof SDate || v instanceof Date ? toText(v instanceof Date ? v.toISOString() : v) : v, []);
        } catch { /* invalid default: ignore */ }
      }
    }
    rec.OwnerId = ctx.user?.Id || null;
    rec.CreatedById = ctx.user?.Id || null;
    rec.CreatedDate = now;
  }
  applyInput(ctx, api, rec, input, errors, { isNew, trusted: trusted || ctx.isSystem });
  if (isNew && obj.nameField?.type === 'AutoNumber') rec.Name = null;
  rec.LastModifiedById = ctx.user?.Id || rec.LastModifiedById || null;
  rec.LastModifiedDate = now;
  if (errors.length) throw new ValidationError(errors);

  return tx(() => {
    // before-save automation (may mutate rec)
    for (const h of hooks.beforeSave) h(ctx, obj, rec, old, isNew);
    finalizeAndValidate(ctx, obj, rec, old, isNew);

    writeRow(api, rec, isNew);
    if (!isNew) trackHistory(ctx, obj, old, rec);
    else if (obj.trackHistory) run('INSERT INTO field_history(record_id, object, field, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)', rec.Id, api, 'created', null, null, ctx.user?.Id, now);
    clearCache(ctx);

    const saved = enriched(ctx, loadRaw(ctx, rec.Id));
    for (const h of hooks.afterSave) h({ ...ctx, depth: ctx.depth + 1 }, obj, saved, old, isNew);
    clearCache(ctx);
    return rec.Id;
  });
}

function stripComputed(api, rec) {
  const out = { ...rec };
  for (const f of getFields(api)) if (f.type === 'Formula' || f.type === 'Rollup') delete out[f.apiName];
  return out;
}

function finalizeAndValidate(ctx, obj, rec, old, isNew) {
  const api = obj.apiName;
  const errors = [];
  // Computed record names (e.g. Contact: FirstName + LastName)
  if (obj.nameField?.formula) {
    try { rec.Name = toText(evaluate(obj.nameField.formula, formulaContext(ctx, api, rec))).trim() || null; } catch { /* keep */ }
  }
  // Auto numbers on create
  if (isNew) {
    if (obj.nameField?.type === 'AutoNumber') rec.Name = autoNumber(api, 'Name', obj.nameField.format);
    for (const f of getFields(api)) if (f.type === 'AutoNumber' && !f.system) rec[f.apiName] = autoNumber(api, f.apiName, f.format);
  }
  for (const f of getFields(api)) {
    if (COMPUTED_TYPES.has(f.type) && f.type !== 'AutoNumber') continue;
    const v = rec[f.apiName];
    if (f.apiName === 'Name' && (obj.nameField?.type === 'AutoNumber' || obj.nameField?.formula)) {
      if (obj.nameField?.formula && blank(v)) errors.push({ field: 'Name', message: 'Required field missing' });
      continue;
    }
    if ((f.required || f.type === 'MasterDetail') && f.type !== 'Checkbox' && blank(v) && !f.readOnly) {
      errors.push({ field: f.apiName, message: 'Required field missing' });
      continue;
    }
    if (REFERENCE_TYPES.has(f.type) && v && (isNew || v !== old?.[f.apiName])) checkReference(ctx, api, f, v, errors);
    if (f.unique && !blank(v)) {
      const lower = String(v).toLowerCase();
      const dup = all('SELECT id, data, name FROM records WHERE object = ? AND is_deleted = 0 AND id != ?', api, rec.Id)
        .find((r) => String(f.apiName === 'Name' ? r.name : JSON.parse(r.data)[f.apiName] ?? '').toLowerCase() === lower);
      if (dup) errors.push({ field: f.apiName, message: `duplicate value found: ${f.label} must be unique (duplicates ${dup.id})` });
    }
  }
  if (errors.length) throw new ValidationError(errors);
  const enr = enrichFresh(ctx, api, rec);
  const priorEnr = old || null;
  for (const v of hooks.validate) {
    const errs = v(ctx, obj, enr, priorEnr, isNew);
    if (errs?.length) errors.push(...errs);
  }
  if (errors.length) throw new ValidationError(errors);
}

function histValue(v) {
  return v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function trackHistory(ctx, obj, old, rec) {
  if (!obj.trackHistory) return;
  const now = nowIso();
  for (const f of getFields(obj.apiName)) {
    if (!(f.trackHistory || f.apiName === 'OwnerId') || COMPUTED_TYPES.has(f.type)) continue;
    const a = histValue(old[f.apiName]), b = histValue(rec[f.apiName]);
    if (a === b) continue;
    run('INSERT INTO field_history(record_id, object, field, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      rec.Id, obj.apiName, f.apiName, a, b, ctx.user?.Id, now);
  }
}

export function createRecord(ctx, objApi, input, opts) {
  return saveRecord(ctx, objApi, null, input, opts);
}

export function updateRecord(ctx, id, input, opts) {
  const objApi = objectForId(id);
  if (!objApi) throw new HttpError(404, `Record ${id} not found`);
  return saveRecord(ctx, objApi, id, input, opts);
}

// ---------- delete / undelete ----------
export function deleteRecord(ctx, id) {
  const objApi = objectForId(id);
  if (!objApi) throw new HttpError(404, `Record ${id} not found`);
  const obj = getObject(objApi);
  requireObjectPerm(ctx, objApi, 'delete');
  const raw = loadRaw(ctx, id);
  if (!raw) throw new HttpError(404, `Record ${id} not found`);
  const rec = enriched(ctx, raw);
  const access = accessFor(ctx, objApi, rec);
  if (!ctx.isSystem && access !== 'all' && !(obj.sharingModel === 'ControlledByParent' && accessAtLeast(access, 'edit'))) {
    throw new HttpError(403, 'Insufficient access to delete this record');
  }
  if (!ctx.isSystem && isLocked(id) && !hasPerm(ctx, 'ModifyAllData')) throw new HttpError(403, 'This record is locked while it is pending approval');
  const now = nowIso();
  tx(() => {
    cascadeDelete(ctx, objApi, id, id, now, 0);
    run('UPDATE records SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deleted_with = NULL WHERE id = ?', now, ctx.user?.Id, id);
    run("UPDATE approvals SET status = 'Removed' WHERE record_id = ? AND status = 'Pending'", id);
  });
  clearCache(ctx);
  for (const h of hooks.afterDelete) h({ ...ctx, depth: ctx.depth + 1 }, obj, rec);
}

function cascadeDelete(ctx, objApi, parentId, rootId, now, depth) {
  if (depth > 5) return;
  for (const child of childRelationships(objApi)) {
    const f = getField(child.object, child.field);
    const kids = all('SELECT id, data FROM records WHERE object = ? AND is_deleted = 0', child.object)
      .filter((r) => JSON.parse(r.data)[child.field] === parentId);
    if (!kids.length) continue;
    if (f.type === 'MasterDetail' || f.deleteConstraint === 'cascade') {
      for (const k of kids) {
        cascadeDelete(ctx, child.object, k.id, rootId, now, depth + 1);
        run('UPDATE records SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deleted_with = ? WHERE id = ?', now, ctx.user?.Id, rootId, k.id);
      }
    } else if (f.deleteConstraint === 'restrict') {
      throw new HttpError(400, `Cannot delete: ${kids.length} ${getObject(child.object).pluralLabel} reference this record via ${f.label}`);
    } else {
      for (const k of kids) {
        const d = JSON.parse(k.data);
        d[child.field] = null;
        run('UPDATE records SET data = ? WHERE id = ?', JSON.stringify(d), k.id);
      }
    }
  }
  // Activities related to the record go with it.
  for (const act of ['Task', 'Event']) {
    if (!getObject(act)) continue;
    for (const r of all('SELECT id, data FROM records WHERE object = ? AND is_deleted = 0', act)) {
      const d = JSON.parse(r.data);
      if (d.WhatId === parentId || d.WhoId === parentId) {
        run('UPDATE records SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deleted_with = ? WHERE id = ?', now, ctx.user?.Id, rootId, r.id);
      }
    }
  }
}

export function undeleteRecord(ctx, id) {
  const row = get('SELECT * FROM records WHERE id = ? AND is_deleted = 1', id);
  if (!row) throw new HttpError(404, 'Record is not in the Recycle Bin');
  if (row.deleted_with) throw new HttpError(400, 'Restore the parent record instead; this record was deleted with it');
  if (!ctx.isSystem && row.deleted_by !== ctx.user.Id && !hasPerm(ctx, 'ModifyAllData')) throw new HttpError(403, 'Only the user who deleted this record or an administrator can restore it');
  tx(() => {
    run('UPDATE records SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL WHERE id = ?', id);
    run('UPDATE records SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, deleted_with = NULL WHERE deleted_with = ?', id);
  });
  clearCache(ctx);
}

export function purgeRecord(ctx, id) {
  const row = get('SELECT * FROM records WHERE id = ? AND is_deleted = 1', id);
  if (!row) throw new HttpError(404, 'Record is not in the Recycle Bin');
  if (!ctx.isSystem && row.deleted_by !== ctx.user.Id && !hasPerm(ctx, 'ModifyAllData')) throw new HttpError(403, 'Insufficient privileges');
  tx(() => {
    for (const r of all('SELECT id FROM records WHERE deleted_with = ?', id)) purgeRow(r.id);
    purgeRow(id);
  });
}

function purgeRow(id) {
  run('DELETE FROM records WHERE id = ?', id);
  run('DELETE FROM field_history WHERE record_id = ?', id);
  run('DELETE FROM record_shares WHERE record_id = ?', id);
  run('DELETE FROM feed WHERE parent_id = ?', id);
}

export function recycleBin(ctx, { all: everyone = false } = {}) {
  const rows = everyone && hasPerm(ctx, 'ModifyAllData')
    ? all('SELECT id, object, name, deleted_at, deleted_by FROM records WHERE is_deleted = 1 AND deleted_with IS NULL ORDER BY deleted_at DESC')
    : all('SELECT id, object, name, deleted_at, deleted_by FROM records WHERE is_deleted = 1 AND deleted_with IS NULL AND deleted_by = ? ORDER BY deleted_at DESC', ctx.user.Id);
  return rows.map((r) => ({ Id: r.id, Name: r.name, object: r.object, objectLabel: getObject(r.object)?.label, deletedAt: r.deleted_at, deletedBy: nameOf(ctx, r.deleted_by) }));
}

export function fieldHistory(ctx, id) {
  getRecord(ctx, id);
  const objApi = objectForId(id);
  return all('SELECT * FROM field_history WHERE record_id = ? ORDER BY id DESC', id)
    .filter((h) => h.field === 'created' || (getField(objApi, h.field) && fieldAccess(ctx, objApi, getField(objApi, h.field)).read))
    .map((h) => {
      const f = getField(objApi, h.field);
      const label = (v) => (v && f && REFERENCE_TYPES.has(f.type) ? nameOf(ctx, v) || v : v);
      return { id: h.id, field: h.field, fieldLabel: h.field === 'created' ? 'Created.' : f?.label, oldValue: label(h.old_value), newValue: label(h.new_value), changedBy: nameOf(ctx, h.changed_by), changedById: h.changed_by, changedAt: h.changed_at };
    });
}

export { objectPerm, listMeta };
