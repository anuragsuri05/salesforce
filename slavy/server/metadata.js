// Metadata: object & field definitions plus generic metadata (layouts, flows, profiles, ...).
// Everything is cached in memory and invalidated on write.
import { all, get, run, tx, audit } from './db.js';
import { HttpError, newId, nowIso, PREFIX } from './util.js';

export const FIELD_TYPES = [
  'Text', 'TextArea', 'LongTextArea', 'Email', 'Phone', 'Url', 'Number', 'Currency', 'Percent',
  'Checkbox', 'Date', 'DateTime', 'Picklist', 'MultiPicklist', 'Lookup', 'MasterDetail',
  'Formula', 'Rollup', 'AutoNumber',
];
export const REFERENCE_TYPES = new Set(['Lookup', 'MasterDetail']);
export const COMPUTED_TYPES = new Set(['Formula', 'Rollup', 'AutoNumber']);

// Fields every object has. Stored in record columns, not in the JSON data blob.
function systemFields(obj) {
  const nameType = obj.nameField?.type === 'AutoNumber' ? 'AutoNumber' : 'Text';
  const computedName = nameType === 'AutoNumber' || !!obj.nameField?.formula;
  return [
    { apiName: 'Id', label: `${obj.label} ID`, type: 'Id', system: true, readOnly: true },
    { apiName: 'Name', label: obj.nameField?.label || `${obj.label} Name`, type: nameType, system: true,
      required: !computedName, length: 255, readOnly: computedName, isNameField: true },
    { apiName: 'OwnerId', label: obj.ownerLabel || 'Owner', type: 'Lookup', referenceTo: 'User', system: true,
      relationshipName: 'Owner', ownerField: true },
    { apiName: 'CreatedById', label: 'Created By', type: 'Lookup', referenceTo: 'User', system: true, readOnly: true, relationshipName: 'CreatedBy' },
    { apiName: 'CreatedDate', label: 'Created Date', type: 'DateTime', system: true, readOnly: true },
    { apiName: 'LastModifiedById', label: 'Last Modified By', type: 'Lookup', referenceTo: 'User', system: true, readOnly: true, relationshipName: 'LastModifiedBy' },
    { apiName: 'LastModifiedDate', label: 'Last Modified Date', type: 'DateTime', system: true, readOnly: true },
  ];
}

export function relationshipNameFor(apiName) {
  if (apiName.endsWith('__c')) return apiName.slice(0, -3) + '__r';
  if (apiName.endsWith('Id')) return apiName.slice(0, -2);
  return apiName;
}

let cache = null;

function load() {
  if (cache) return cache;
  const objects = new Map();
  const byPrefix = new Map();
  for (const row of all('SELECT def FROM objects')) {
    const o = JSON.parse(row.def);
    objects.set(o.apiName, o);
    byPrefix.set(o.keyPrefix, o.apiName);
  }
  const fields = new Map();
  for (const o of objects.values()) fields.set(o.apiName, systemFields(o));
  for (const row of all('SELECT object, def FROM fields')) {
    const f = JSON.parse(row.def);
    if (!fields.has(row.object)) continue;
    if (REFERENCE_TYPES.has(f.type) && !f.relationshipName) f.relationshipName = relationshipNameFor(f.apiName);
    fields.get(row.object).push(f);
  }
  const lower = new Map();
  const relIndex = new Map();
  const children = new Map(); // parent object -> [{ object, field }]
  for (const [obj, list] of fields) {
    list.sort((a, b) => (a.system === b.system ? (a.sortOrder ?? 999) - (b.sortOrder ?? 999) : a.system ? -1 : 1));
    const m = new Map();
    const rel = new Map();
    for (const f of list) {
      m.set(f.apiName.toLowerCase(), f);
      if (f.relationshipName) rel.set(f.relationshipName.toLowerCase(), f);
      if (REFERENCE_TYPES.has(f.type) && f.referenceTo && f.referenceTo !== 'User' && !f.system && !f.polymorphic) {
        const refs = Array.isArray(f.referenceTo) ? f.referenceTo : [f.referenceTo];
        for (const parent of refs) {
          if (!children.has(parent)) children.set(parent, []);
          children.get(parent).push({ object: obj, field: f.apiName, label: f.relatedListLabel || objects.get(obj)?.pluralLabel, type: f.type });
        }
      }
    }
    lower.set(obj, m);
    relIndex.set(obj, rel);
  }
  const objLower = new Map([...objects.keys()].map((k) => [k.toLowerCase(), k]));
  cache = { objects, byPrefix, fields, lower, relIndex, children, objLower };
  return cache;
}

export function invalidate() { cache = null; metaCache.clear(); }

export const listObjects = () => [...load().objects.values()].sort((a, b) => a.label.localeCompare(b.label));
export function getObject(api) {
  const c = load();
  return c.objects.get(api) || c.objects.get(c.objLower.get(String(api).toLowerCase()));
}
export function requireObject(api) {
  const o = getObject(api);
  if (!o) throw new HttpError(404, `Unknown object: ${api}`);
  return o;
}
export const objectForId = (id) => load().byPrefix.get(String(id).slice(0, 3)) || null;
export const getFields = (obj) => load().fields.get(getObject(obj)?.apiName) || [];
export const getField = (obj, api) => load().lower.get(getObject(obj)?.apiName)?.get(String(api).toLowerCase());
export const getRelationship = (obj, rel) => load().relIndex.get(getObject(obj)?.apiName)?.get(String(rel).toLowerCase());
export const childRelationships = (obj) => load().children.get(obj) || [];
export const masterDetailField = (obj) => getFields(obj).find((f) => f.type === 'MasterDetail');

// ---------- object & field writes ----------
const API_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export function saveObject(def, userId, { isNew = false } = {}) {
  if (!API_RE.test(def.apiName || '')) throw new HttpError(400, 'Invalid API name');
  if (!def.label && (isNew || !getObject(def.apiName)?.label)) throw new HttpError(400, 'Label is required');
  const existing = getObject(def.apiName);
  if (isNew && existing) throw new HttpError(400, `Object ${def.apiName} already exists`);
  if (!isNew && !existing) throw new HttpError(404, `Unknown object ${def.apiName}`);
  const merged = { ...(existing || {}), ...def };
  if (!merged.keyPrefix) {
    const used = new Set(listObjects().map((o) => o.keyPrefix));
    for (let i = 0; i < 36 * 36; i++) {
      const p = 'a' + i.toString(36).padStart(2, '0');
      if (!used.has(p)) { merged.keyPrefix = p; break; }
    }
  }
  merged.pluralLabel ||= merged.label + 's';
  merged.sharingModel ||= 'ReadWrite';
  merged.nameField ||= { label: `${merged.label} Name`, type: 'Text' };
  run('INSERT INTO objects(api_name, def) VALUES (?, ?) ON CONFLICT(api_name) DO UPDATE SET def = excluded.def',
    merged.apiName, JSON.stringify(merged));
  invalidate();
  if (userId) audit(userId, 'Customize', isNew ? 'Created custom object' : 'Changed object', merged.apiName);
  return getObject(merged.apiName);
}

export function deleteObject(api, userId) {
  const o = requireObject(api);
  if (!o.isCustom) throw new HttpError(400, 'Standard objects cannot be deleted');
  tx(() => {
    run('DELETE FROM objects WHERE api_name = ?', o.apiName);
    run('DELETE FROM fields WHERE object = ?', o.apiName);
    run('DELETE FROM records WHERE object = ?', o.apiName);
    run("DELETE FROM meta WHERE object = ?", o.apiName);
  });
  invalidate();
  audit(userId, 'Customize', 'Deleted custom object', o.apiName);
}

export function saveField(objApi, def, userId, { isNew = false } = {}) {
  const o = requireObject(objApi);
  if (!def.apiName || !API_RE.test(def.apiName)) throw new HttpError(400, 'Invalid field API name');
  if (!FIELD_TYPES.includes(def.type)) throw new HttpError(400, `Invalid field type ${def.type}`);
  if (!def.label) throw new HttpError(400, 'Field label is required');
  const existing = getField(o.apiName, def.apiName);
  if (existing?.system) throw new HttpError(400, 'System fields cannot be changed');
  if (isNew && existing) throw new HttpError(400, `Field ${def.apiName} already exists`);
  if (!isNew && !existing) throw new HttpError(404, `Unknown field ${def.apiName}`);
  if (existing && existing.type !== def.type && (COMPUTED_TYPES.has(def.type) || REFERENCE_TYPES.has(existing.type))) {
    throw new HttpError(400, `Cannot change field type from ${existing.type} to ${def.type}`);
  }
  if (REFERENCE_TYPES.has(def.type)) {
    const refs = Array.isArray(def.referenceTo) ? def.referenceTo : [def.referenceTo];
    if (!def.referenceTo || refs.some((r) => r !== 'User' && r !== '*' && !getObject(r))) throw new HttpError(400, 'Related object is required');
    if (def.type === 'MasterDetail') {
      const other = masterDetailField(o.apiName);
      if (other && other.apiName !== def.apiName && getFields(o.apiName).filter((f) => f.type === 'MasterDetail').length >= 2)
        throw new HttpError(400, 'An object can have at most 2 master-detail relationships');
      def.required = true;
    }
    def.relationshipName ||= relationshipNameFor(def.apiName);
  }
  if ((def.type === 'Picklist' || def.type === 'MultiPicklist') && !Array.isArray(def.values)) def.values = [];
  if (def.type === 'Formula' && !def.formula) throw new HttpError(400, 'Formula is required');
  if (def.type === 'Rollup') {
    const r = def.rollup || {};
    if (!getObject(r.childObject) || !r.relField || !['COUNT', 'SUM', 'MIN', 'MAX', 'AVG'].includes(r.op))
      throw new HttpError(400, 'Roll-up needs a child object, relationship field and operation');
  }
  const merged = { ...(existing || {}), ...def, isCustom: existing ? existing.isCustom : def.isCustom ?? true };
  if (merged.sortOrder == null) merged.sortOrder = getFields(o.apiName).filter((f) => !f.system).length + 1;
  run('INSERT INTO fields(object, api_name, def) VALUES (?, ?, ?) ON CONFLICT(object, api_name) DO UPDATE SET def = excluded.def',
    o.apiName, merged.apiName, JSON.stringify(merged));
  invalidate();
  if (userId) audit(userId, 'Customize', isNew ? 'Created field' : 'Changed field', `${o.apiName}.${merged.apiName} (${merged.type})`);
  return getField(o.apiName, merged.apiName);
}

export function deleteField(objApi, fieldApi, userId) {
  const f = getField(objApi, fieldApi);
  if (!f) throw new HttpError(404, 'Unknown field');
  if (f.system || !f.isCustom) throw new HttpError(400, 'Standard fields cannot be deleted');
  run('DELETE FROM fields WHERE object = ? AND api_name = ?', getObject(objApi).apiName, f.apiName);
  invalidate();
  audit(userId, 'Customize', 'Deleted field', `${objApi}.${f.apiName}`);
}

// ---------- generic metadata ----------
export const META_TYPES = {
  layout: PREFIX.Layout, listView: PREFIX.ListView, validationRule: PREFIX.ValidationRule, flow: PREFIX.Flow,
  approvalProcess: PREFIX.ApprovalProcess, app: PREFIX.App, action: PREFIX.Action, sharingRule: PREFIX.SharingRule,
  profile: PREFIX.Profile, permissionSet: PREFIX.PermissionSet, role: PREFIX.Role, group: PREFIX.Group,
  report: PREFIX.Report, dashboard: PREFIX.Dashboard, promptTemplate: '0hf',
};

const metaCache = new Map();

function rowToMeta(row) {
  return { ...JSON.parse(row.def), id: row.id, type: row.type, name: row.name, object: row.object,
    createdAt: row.created_at, updatedAt: row.updated_at, createdBy: row.created_by };
}

export function listMeta(type, object) {
  const key = type + '|' + (object || '');
  if (!metaCache.has(key)) {
    const rows = object
      ? all('SELECT * FROM meta WHERE type = ? AND object = ? ORDER BY name', type, object)
      : all('SELECT * FROM meta WHERE type = ? ORDER BY name', type);
    metaCache.set(key, rows.map(rowToMeta));
  }
  return metaCache.get(key);
}

export function getMeta(id, type) {
  const row = get('SELECT * FROM meta WHERE id = ?', id);
  if (!row || (type && row.type !== type)) return null;
  return rowToMeta(row);
}

export function saveMeta(type, def, userId) {
  if (!META_TYPES[type]) throw new HttpError(400, `Unknown metadata type ${type}`);
  const now = nowIso();
  const { id: givenId, type: _t, createdAt, updatedAt, createdBy, ...body } = def;
  const name = body.name ?? body.label ?? '';
  const object = body.object ?? null;
  let id = givenId;
  if (id && get('SELECT id FROM meta WHERE id = ?', id)) {
    run('UPDATE meta SET name = ?, object = ?, def = ?, updated_at = ? WHERE id = ?', name, object, JSON.stringify(body), now, id);
  } else {
    id ||= newId(META_TYPES[type]);
    run('INSERT INTO meta(id, type, name, object, def, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, type, name, object, JSON.stringify(body), now, now, userId || null);
  }
  metaCache.clear();
  return getMeta(id);
}

export function deleteMeta(id) {
  run('DELETE FROM meta WHERE id = ?', id);
  metaCache.clear();
}
