// Raw record storage access with per-request caching. "Raw" records hold stored values only
// (no formulas, no security applied). Higher layers (records.js) add computed fields and security.
import { all, get } from './db.js';

export function rowToRaw(row) {
  const data = JSON.parse(row.data);
  return {
    ...data,
    Id: row.id,
    Name: row.name,
    OwnerId: row.owner_id,
    CreatedById: row.created_by,
    CreatedDate: row.created_at,
    LastModifiedById: row.modified_by,
    LastModifiedDate: row.modified_at,
    __object: row.object,
  };
}

const cacheOf = (ctx) => (ctx?.cache instanceof Map ? ctx.cache : null);

export function loadRaw(ctx, id, { includeDeleted = false } = {}) {
  if (!id) return null;
  const c = cacheOf(ctx);
  const key = 'rec:' + id;
  if (c && c.has(key) && !includeDeleted) return c.get(key);
  const row = get('SELECT * FROM records WHERE id = ?', id);
  const raw = row && (includeDeleted || !row.is_deleted) ? rowToRaw(row) : null;
  if (c && !includeDeleted) c.set(key, raw);
  return raw;
}

export function loadAllRaw(ctx, object) {
  const c = cacheOf(ctx);
  const key = 'obj:' + object;
  if (c && c.has(key)) return c.get(key);
  const list = all('SELECT * FROM records WHERE object = ? AND is_deleted = 0 ORDER BY created_at', object).map(rowToRaw);
  if (c) {
    c.set(key, list);
    for (const r of list) c.set('rec:' + r.Id, r);
  }
  return list;
}

// Children of a parent by lookup field, indexed once per request.
export function childrenOf(ctx, object, field, parentId) {
  const c = cacheOf(ctx);
  const key = `idx:${object}:${field}`;
  let idx = c?.get(key);
  if (!idx) {
    idx = new Map();
    for (const r of loadAllRaw(ctx, object)) {
      const p = r[field];
      if (!p) continue;
      if (!idx.has(p)) idx.set(p, []);
      idx.get(p).push(r);
    }
    if (c) c.set(key, idx);
  }
  return idx.get(parentId) || [];
}

export function clearCache(ctx) {
  cacheOf(ctx)?.clear();
}
