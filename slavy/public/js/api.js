// API client + client-side metadata cache.
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.errors = data?.errors || [];
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'slavy' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') onUnauthorized();
    throw new ApiError(res.status, (data && data.error) || res.statusText || 'Request failed', data);
  }
  return data;
}

export const GET = (p) => api('GET', p);
export const POST = (p, b) => api('POST', p, b ?? {});
export const PUT = (p, b) => api('PUT', p, b);
export const PATCH = (p, b) => api('PATCH', p, b);
export const DEL = (p) => api('DELETE', p);

export function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') s.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  const str = s.toString();
  return str ? '?' + str : '';
}

// ---------- session & metadata ----------
export const state = {
  session: null,     // { user, perms: { system }, org }
  objects: new Map(), // apiName -> describe (fields, perms, layout, actions, children)
  byPrefix: new Map(),
  apps: [],
  userFields: [],
};

export async function loadSession() {
  state.session = await GET('/api/session');
  return state.session;
}

export async function loadMeta() {
  const meta = await GET('/api/meta');
  state.objects = new Map(meta.objects.map((o) => [o.apiName, o]));
  state.byPrefix = new Map(meta.objects.map((o) => [o.keyPrefix, o.apiName]));
  state.apps = meta.apps;
  state.userFields = meta.userFields;
  for (const o of meta.objects) o.fieldMap = new Map(o.fields.map((f) => [f.apiName, f]));
  return meta;
}

export const can = (perm) => !!state.session?.perms?.system?.[perm];
export const me = () => state.session?.user;
export const getObj = (api) => state.objects.get(api) || [...state.objects.values()].find((o) => o.apiName.toLowerCase() === String(api).toLowerCase());
export const objForId = (id) => (id ? getObj(state.byPrefix.get(String(id).slice(0, 3))) : null);
export const getField = (objApi, f) => getObj(objApi)?.fieldMap.get(f);

// Resolve a dotted path like "Account.Industry" to its field definition (client-side).
export function fieldAtPath(objApi, path) {
  const parts = String(path).split('.');
  let obj = getObj(objApi);
  const labels = [];
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj) return null;
    const rel = obj.fields.find((f) => f.relationshipName && f.relationshipName.toLowerCase() === parts[i].toLowerCase());
    if (!rel) return null;
    labels.push(rel.label.replace(/ ID$/, ''));
    const ref = Array.isArray(rel.referenceTo) ? rel.referenceTo[0] : rel.referenceTo;
    if (ref === 'User') {
      const uf = state.userFields.find((f) => f.apiName.toLowerCase() === parts[parts.length - 1].toLowerCase());
      return uf && i === parts.length - 2 ? { ...uf, fullLabel: [...labels, uf.label].join(': '), path } : null;
    }
    obj = getObj(ref);
  }
  const f = obj?.fieldMap.get(parts[parts.length - 1]) || obj?.fields.find((x) => x.apiName.toLowerCase() === parts[parts.length - 1].toLowerCase());
  return f ? { ...f, fullLabel: [...labels, f.label].join(': '), path } : null;
}

// Fields reachable for reports/list views: own fields + one level of parent lookups.
export function pathOptions(objApi, { depth = 1 } = {}) {
  const obj = getObj(objApi);
  if (!obj) return [];
  const out = obj.fields.filter((f) => f.type !== 'Id').map((f) => ({ path: f.apiName, label: f.label, group: obj.label, field: f }));
  if (depth > 0) {
    for (const rel of obj.fields.filter((f) => f.relationshipName && !f.polymorphic)) {
      const ref = Array.isArray(rel.referenceTo) ? rel.referenceTo[0] : rel.referenceTo;
      const group = rel.label.replace(/ ID$/, '');
      if (ref === 'User') {
        for (const uf of state.userFields.filter((f) => ['Name', 'Email', 'Title', 'Alias'].includes(f.apiName))) out.push({ path: `${rel.relationshipName}.${uf.apiName}`, label: `${group}: ${uf.label}`, group, field: uf });
        continue;
      }
      const p = getObj(ref);
      if (!p) continue;
      for (const pf of p.fields.filter((f) => f.type !== 'Id')) out.push({ path: `${rel.relationshipName}.${pf.apiName}`, label: `${group}: ${pf.label}`, group, field: pf });
    }
  }
  return out;
}
