// Salesforce-style REST API: /services/data/v1.0/... and /services/oauth2/token
import { listObjects, requireObject, getFields, childRelationships, getObject, getField } from '../metadata.js';
import { getRecord, createRecord, updateRecord, deleteRecord, visibleRecords } from '../records.js';
import { objectPerm, fieldAccess, requirePerm } from '../security.js';
import { executeSoql } from '../soql.js';
import { globalSearch } from '../features.js';
import { login } from '../auth.js';
import { get } from '../db.js';
import { HttpError } from '../util.js';

export const API_VERSION = '1.0';
const BASE = `/services/data/v${API_VERSION}`;

const SF_TYPE = {
  Id: 'id', Text: 'string', TextArea: 'textarea', LongTextArea: 'textarea', Email: 'email', Phone: 'phone', Url: 'url',
  Number: 'double', Currency: 'currency', Percent: 'percent', Checkbox: 'boolean', Date: 'date', DateTime: 'datetime',
  Picklist: 'picklist', MultiPicklist: 'multipicklist', Lookup: 'reference', MasterDetail: 'reference', AutoNumber: 'string',
};

function describeField(ctx, objApi, f) {
  const fa = fieldAccess(ctx, objApi, f);
  const computed = f.type === 'Formula' || f.type === 'Rollup' || f.type === 'AutoNumber' || f.readOnly;
  return {
    name: f.apiName, label: f.label, type: f.type === 'Formula' || f.type === 'Rollup' ? SF_TYPE[f.returnType] || 'string' : SF_TYPE[f.type] || 'string',
    length: f.length || 0, precision: f.precision || 0, scale: f.scale || 0, nillable: !f.required, unique: !!f.unique, externalId: !!f.externalId,
    custom: !!f.isCustom, calculated: f.type === 'Formula', calculatedFormula: f.formula || null, autoNumber: f.type === 'AutoNumber',
    createable: fa.edit && !computed, updateable: fa.edit && !computed && f.apiName !== 'Id', filterable: true, sortable: true, nameField: !!f.isNameField,
    referenceTo: f.referenceTo ? [].concat(f.referenceTo) : [], relationshipName: f.relationshipName || null,
    picklistValues: (f.values || []).map((v) => ({ value: v.value, label: v.label || v.value, active: v.isActive !== false, defaultValue: !!v.isDefault })),
    inlineHelpText: f.helpText || null, defaultValueFormula: f.defaultValue || null,
  };
}

function objSummary(ctx, o) {
  return {
    name: o.apiName, label: o.label, labelPlural: o.pluralLabel, keyPrefix: o.keyPrefix, custom: !!o.isCustom,
    createable: objectPerm(ctx, o.apiName, 'create'), updateable: objectPerm(ctx, o.apiName, 'edit'), deletable: objectPerm(ctx, o.apiName, 'delete'),
    queryable: objectPerm(ctx, o.apiName, 'read'), searchable: o.searchable !== false,
    urls: { sobject: `${BASE}/sobjects/${o.apiName}`, describe: `${BASE}/sobjects/${o.apiName}/describe`, rowTemplate: `${BASE}/sobjects/${o.apiName}/{ID}` },
  };
}

function pick(rec, fields) {
  if (!fields) return rec;
  const want = new Set(String(fields).split(',').map((s) => s.trim().toLowerCase()));
  return Object.fromEntries(Object.entries(rec).filter(([k]) => k === 'attributes' || want.has(k.toLowerCase())));
}

function strip(rec) {
  const { _labels, _access, ...rest } = rec;
  return rest;
}

export function registerRest(r) {
  const api = (fn) => (args) => { requirePerm(args.ctx, 'ApiEnabled'); return fn(args); };

  r.post('/services/oauth2/token', ({ body, req }) => {
    if (body.grant_type !== 'password') throw new HttpError(400, 'unsupported_grant_type: only grant_type=password is supported');
    const s = login(body.username, body.password, { ip: req.socket.remoteAddress, userAgent: 'oauth2/password' });
    const host = `http://${req.headers.host}`;
    const user = get('SELECT user_id FROM sessions WHERE id = ?', s.id);
    return { access_token: s.id, instance_url: host, token_type: 'Bearer', issued_at: String(Date.now()), id: `${host}/id/${user.user_id}` };
  }, { auth: false, rest: true });

  r.get('/services/data', () => [{ version: API_VERSION, label: 'Slavy v1', url: BASE }], { auth: false, rest: true });
  r.get(BASE, api(() => ({ sobjects: `${BASE}/sobjects`, query: `${BASE}/query`, search: `${BASE}/search`, limits: `${BASE}/limits` })), { rest: true });
  r.get(`${BASE}/limits`, api(() => ({
    DailyApiRequests: { Max: 100000, Remaining: 100000 }, DataStorageMB: { Max: 1024, Remaining: 1024 - Math.ceil(get('SELECT COUNT(*) AS n FROM records').n * 2 / 1024) },
  })), { rest: true });

  r.get(`${BASE}/sobjects`, api(({ ctx }) => ({ encoding: 'UTF-8', maxBatchSize: 200, sobjects: listObjects().filter((o) => objectPerm(ctx, o.apiName, 'read')).map((o) => objSummary(ctx, o)) })), { rest: true });
  r.get(`${BASE}/sobjects/:object/describe`, api(({ ctx, params }) => {
    const o = requireObject(params.object);
    if (!objectPerm(ctx, o.apiName, 'read')) throw new HttpError(403, 'Insufficient access');
    return {
      ...objSummary(ctx, o),
      fields: getFields(o.apiName).filter((f) => fieldAccess(ctx, o.apiName, f).read).map((f) => describeField(ctx, o.apiName, f)),
      childRelationships: childRelationships(o.apiName).map((c) => ({ childSObject: c.object, field: c.field, relationshipName: getObject(c.object).pluralLabel.replace(/\s/g, ''), cascadeDelete: c.type === 'MasterDetail' })),
    };
  }), { rest: true });
  r.get(`${BASE}/sobjects/:object`, api(({ ctx, params }) => {
    const o = requireObject(params.object);
    const recent = visibleRecords(ctx, o.apiName).slice(-10).reverse().map(({ rec }) => ({ attributes: { type: o.apiName, url: `${BASE}/sobjects/${o.apiName}/${rec.Id}` }, Id: rec.Id, Name: rec.Name }));
    return { objectDescribe: objSummary(ctx, o), recentItems: recent };
  }), { rest: true });
  r.post(`${BASE}/sobjects/:object`, api(({ ctx, params, body, res }) => {
    const id = createRecord(ctx, params.object, body);
    res.statusCode = 201;
    return { id, success: true, errors: [] };
  }), { rest: true });
  r.get(`${BASE}/sobjects/:object/:id`, api(({ ctx, params, query }) => {
    const rec = getRecord(ctx, params.id);
    if (rec.attributes.type !== requireObject(params.object).apiName) throw new HttpError(404, 'Record not found');
    return pick(strip(rec), query.fields);
  }), { rest: true });
  r.patch(`${BASE}/sobjects/:object/:id`, api(({ ctx, params, body, res }) => {
    getRecord(ctx, params.id);
    updateRecord(ctx, params.id, body);
    res.statusCode = 204;
    return null;
  }), { rest: true });
  r.delete(`${BASE}/sobjects/:object/:id`, api(({ ctx, params, res }) => {
    deleteRecord(ctx, params.id);
    res.statusCode = 204;
    return null;
  }), { rest: true });
  // Upsert by external id: PATCH /sobjects/Account/External_Id__c/ABC-1
  r.patch(`${BASE}/sobjects/:object/:field/:value`, api(({ ctx, params, body, res }) => {
    const o = requireObject(params.object);
    const f = getField(o.apiName, params.field);
    if (!f || !(f.externalId || f.apiName === 'Id')) throw new HttpError(400, `${params.field} is not an External ID field`);
    const matches = visibleRecords(ctx, o.apiName).filter(({ rec }) => String(rec[f.apiName] ?? '').toLowerCase() === params.value.toLowerCase());
    if (matches.length > 1) throw new HttpError(300, 'Multiple records match the external id');
    if (matches.length) { updateRecord(ctx, matches[0].rec.Id, body); res.statusCode = 200; return { id: matches[0].rec.Id, success: true, created: false, errors: [] }; }
    const id = createRecord(ctx, o.apiName, { ...body, [f.apiName]: params.value });
    res.statusCode = 201;
    return { id, success: true, created: true, errors: [] };
  }), { rest: true });

  r.get(`${BASE}/query`, api(({ ctx, query }) => {
    if (!query.q) throw new HttpError(400, 'Missing q parameter');
    return executeSoql(ctx, query.q);
  }), { rest: true });
  r.get(`${BASE}/search`, api(({ ctx, query }) => {
    const m = /FIND\s*\{([^}]*)\}/i.exec(query.q || '');
    if (!m) throw new HttpError(400, 'Use: FIND {term}');
    const groups = globalSearch(ctx, m[1], { limit: 50 });
    return { searchRecords: groups.flatMap((g) => g.records.map((rec) => ({ attributes: rec.attributes, Id: rec.Id, Name: rec.Name }))) };
  }), { rest: true });
}
