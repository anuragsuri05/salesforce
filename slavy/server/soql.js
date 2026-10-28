// SOQL: SELECT fields, Parent.Field, (SELECT ... FROM ChildRelationship), COUNT()/SUM()/AVG()/MIN()/MAX()
// FROM Object [WHERE ...] [GROUP BY ...] [ORDER BY ... ASC|DESC NULLS FIRST|LAST] [LIMIT n] [OFFSET n]
// Enforces object, field and record security for the running user.
import { requireObject, getFields, getObject, childRelationships, getField } from './metadata.js';
import { visibleRecords, sortRecords, pathValue, fieldAtPath, shape } from './records.js';
import { fieldAccess } from './security.js';
import { parseDateLiteral } from './conditions.js';
import { HttpError } from './util.js';

const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'INCLUDES', 'EXCLUDES',
  'ORDER', 'BY', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'LIMIT', 'OFFSET', 'GROUP', 'TRUE', 'FALSE', 'NULL', 'WITH']);
const AGG = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COUNT_DISTINCT']);

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== "'") {
        if (src[j] === '\\') { s += src[j + 1]; j += 2; } else s += src[j++];
      }
      if (j >= src.length) throw new HttpError(400, 'SOQL: unterminated string');
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    const dt = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/.exec(src.slice(i));
    if (dt) { toks.push({ t: 'date', v: dt[0] }); i += dt[0].length; continue; }
    const n = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (n && (c !== '-' || /[\s(,=<>]/.test(src[i - 1] ?? ' '))) { toks.push({ t: 'num', v: Number(n[0]) }); i += n[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (id) {
      const up = id[0].toUpperCase();
      toks.push(KEYWORDS.has(up) ? { t: 'kw', v: up } : { t: 'id', v: id[0] });
      i += id[0].length; continue;
    }
    const two = src.slice(i, i + 2);
    if (['!=', '<>', '<=', '>='].includes(two)) { toks.push({ t: 'op', v: two === '<>' ? '!=' : two }); i += 2; continue; }
    if ('=<>(),:'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new HttpError(400, `SOQL: unexpected character "${c}"`);
  }
  toks.push({ t: 'eof' });
  return toks;
}

export function parseSoql(src) {
  const toks = tokenize(String(src || '').trim());
  let p = 0;
  const peek = (o = 0) => toks[p + o];
  const isKw = (v) => peek().t === 'kw' && peek().v === v;
  const isOp = (v) => peek().t === 'op' && peek().v === v;
  const fail = (m) => { throw new HttpError(400, `SOQL: ${m}${peek().v !== undefined ? ` near "${peek().v}"` : ''}`); };
  const kw = (v) => { if (!isKw(v)) fail(`expected ${v}`); p++; };
  const op = (v) => { if (!isOp(v)) fail(`expected "${v}"`); p++; };
  const ident = () => { if (peek().t !== 'id') fail('expected a field or object name'); return toks[p++].v; };

  function query() {
    kw('SELECT');
    const fields = [];
    do {
      if (isOp('(')) { p++; fields.push({ sub: query() }); op(')'); continue; }
      const name = ident();
      if (isOp('(')) {
        const fn = name.toUpperCase();
        p++;
        if (fn === 'FIELDS') { const which = ident().toUpperCase(); op(')'); fields.push({ fieldsFn: which }); continue; }
        if (!AGG.has(fn)) fail(`unknown function ${name}`);
        const arg = isOp(')') ? null : ident();
        op(')');
        const alias = peek().t === 'id' ? toks[p++].v : null;
        fields.push({ agg: fn, field: arg, alias });
      } else fields.push({ path: name });
    } while (isOp(',') && ++p);
    kw('FROM');
    const from = ident();
    let where = null, groupBy = [], orderBy = [], limit = null, offset = 0;
    if (isKw('WHERE')) { p++; where = orExpr(); }
    if (isKw('WITH')) { p++; ident(); }
    if (isKw('GROUP')) { p++; kw('BY'); do groupBy.push(ident()); while (isOp(',') && ++p); }
    if (isKw('ORDER')) {
      p++; kw('BY');
      do {
        let field = ident();
        if (isOp('(')) { p++; const a = isOp(')') ? null : ident(); op(')'); field = `${field.toUpperCase()}(${a ?? ''})`; }
        let dir = 'asc', nulls = null;
        if (isKw('ASC')) p++; else if (isKw('DESC')) { p++; dir = 'desc'; }
        if (isKw('NULLS')) { p++; if (isKw('FIRST')) { p++; nulls = 'first'; } else { kw('LAST'); nulls = 'last'; } }
        orderBy.push({ field, dir, nulls });
      } while (isOp(',') && ++p);
    }
    if (isKw('LIMIT')) { p++; if (peek().t !== 'num') fail('LIMIT needs a number'); limit = toks[p++].v; }
    if (isKw('OFFSET')) { p++; if (peek().t !== 'num') fail('OFFSET needs a number'); offset = toks[p++].v; }
    return { fields, from, where, groupBy, orderBy, limit, offset };
  }

  function orExpr() {
    const items = [andExpr()];
    while (isKw('OR')) { p++; items.push(andExpr()); }
    return items.length > 1 ? { t: 'or', items } : items[0];
  }
  function andExpr() {
    const items = [notExpr()];
    while (isKw('AND')) { p++; items.push(notExpr()); }
    return items.length > 1 ? { t: 'and', items } : items[0];
  }
  function notExpr() {
    if (isKw('NOT')) { p++; return { t: 'not', item: notExpr() }; }
    if (isOp('(')) { p++; const e = orExpr(); op(')'); return e; }
    return comparison();
  }
  function value() {
    const tok = peek();
    if (tok.t === 'str' || tok.t === 'num') { p++; return tok.v; }
    if (tok.t === 'date') { p++; return tok.v.length === 10 ? tok.v : new Date(tok.v).toISOString(); }
    if (tok.t === 'kw' && (tok.v === 'TRUE' || tok.v === 'FALSE')) { p++; return tok.v === 'TRUE'; }
    if (tok.t === 'kw' && tok.v === 'NULL') { p++; return null; }
    if (tok.t === 'id') {
      p++;
      let lit = tok.v;
      if (isOp(':')) { p++; if (peek().t !== 'num') fail('date literal needs a number'); lit += ':' + toks[p++].v; }
      const dl = parseDateLiteral(lit);
      if (!dl) fail(`unknown value ${lit}`);
      return dl;
    }
    fail('expected a value');
  }
  function list() {
    op('(');
    const vals = [value()];
    while (isOp(',')) { p++; vals.push(value()); }
    op(')');
    return vals;
  }
  function comparison() {
    const field = ident();
    if (isKw('NOT')) { p++; kw('IN'); return { t: 'cmp', field, op: 'notin', value: list() }; }
    if (isKw('IN')) { p++; return { t: 'cmp', field, op: 'in', value: list() }; }
    if (isKw('LIKE')) { p++; return { t: 'cmp', field, op: 'like', value: value() }; }
    if (isKw('INCLUDES')) { p++; return { t: 'cmp', field, op: 'includes', value: list() }; }
    if (isKw('EXCLUDES')) { p++; return { t: 'cmp', field, op: 'excludes', value: list() }; }
    if (peek().t !== 'op' || !['=', '!=', '<', '>', '<=', '>='].includes(peek().v)) fail('expected a comparison operator');
    const o = toks[p++].v;
    return { t: 'cmp', field, op: o, value: value() };
  }

  const q = query();
  if (peek().t !== 'eof') fail('unexpected input');
  return q;
}

function checkReadable(ctx, objApi, path) {
  const f = fieldAtPath(objApi, path);
  if (!f) throw new HttpError(400, `SOQL: no such column '${path}' on entity '${objApi}'`);
  if (f.object !== 'User' && !f.system && !ctx.isSystem && !fieldAccess(ctx, f.object, f).read) {
    throw new HttpError(403, `SOQL: no access to field ${path}`);
  }
  return f;
}

function setPath(out, path, value) {
  const parts = path.split('.');
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    if (cur[parts[i]] === null) return;
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function expandFieldsFn(ctx, objApi, which) {
  return getFields(objApi)
    .filter((f) => which === 'ALL' || (which === 'STANDARD' ? !f.isCustom : f.isCustom))
    .filter((f) => ctx.isSystem || fieldAccess(ctx, objApi, f).read)
    .map((f) => f.apiName);
}

export function executeSoql(ctx, src, { maxRows = 2000 } = {}) {
  const q = typeof src === 'string' ? parseSoql(src) : src;
  return runQuery(ctx, q, null, maxRows);
}

function runQuery(ctx, q, parentFilter, maxRows) {
  const obj = requireObject(q.from);
  const api = obj.apiName;
  const where = parentFilter ? (q.where ? { t: 'and', items: [parentFilter, q.where] } : parentFilter) : q.where;
  let items = visibleRecords(ctx, api, { where });

  const aggs = q.fields.filter((f) => f.agg);
  if (aggs.length || q.groupBy.length) return aggregate(ctx, api, q, items, aggs);

  let paths = [];
  const subs = [];
  for (const f of q.fields) {
    if (f.sub) subs.push(f.sub);
    else if (f.fieldsFn) paths.push(...expandFieldsFn(ctx, api, f.fieldsFn));
    else paths.push(f.path);
  }
  paths = [...new Set(paths)];
  const canonical = paths.map((p) => {
    const f = checkReadable(ctx, api, p);
    const parts = p.split('.');
    parts[parts.length - 1] = f.apiName;
    return parts.join('.');
  });
  for (const o of q.orderBy) checkReadable(ctx, api, o.field);

  items = sortRecords(ctx, api, items, q.orderBy);
  const totalSize = items.length;
  const limit = Math.min(q.limit ?? maxRows, maxRows);
  items = items.slice(q.offset || 0, (q.offset || 0) + limit);

  const records = items.map(({ rec }) => {
    const out = { attributes: { type: api, url: `/services/data/v1.0/sobjects/${api}/${rec.Id}` } };
    canonical.forEach((path) => {
      const { value } = pathValue(ctx, api, rec, path);
      if (!path.includes('.')) { out[path] = value; return; }
      // Null parent → whole relationship is null, like Salesforce.
      const rel = path.split('.')[0];
      const relField = getObject(api) && pathValue(ctx, api, rec, path.split('.').slice(0, -1).join('.') + '.Id');
      if (!relField.value && !(rel in out)) out[rel] = null;
      else if (relField.value) setPath(out, path, value);
    });
    for (const sub of subs) {
      const rel = childRelationships(api).find((c) => (getField(c.object, c.field)?.relatedListName || getObject(c.object).pluralLabel.replace(/\s/g, '')).toLowerCase() === sub.from.toLowerCase()
        || c.object.toLowerCase() === sub.from.toLowerCase());
      if (!rel) throw new HttpError(400, `SOQL: didn't understand relationship '${sub.from}' in FROM part of query`);
      const child = runQuery(ctx, { ...sub, from: rel.object }, { t: 'cmp', field: rel.field, op: '=', value: rec.Id }, maxRows);
      out[sub.from] = child.totalSize ? child : null;
    }
    return out;
  });
  return { totalSize, done: true, records };
}

function aggregate(ctx, api, q, items, aggs) {
  for (const g of q.groupBy) checkReadable(ctx, api, g);
  const groups = new Map();
  for (const it of items) {
    const key = q.groupBy.map((g) => pathValue(ctx, api, it.rec, g).value);
    const k = JSON.stringify(key);
    if (!groups.has(k)) groups.set(k, { key, recs: [] });
    groups.get(k).recs.push(it.rec);
  }
  if (!q.groupBy.length && !groups.size) groups.set('[]', { key: [], recs: [] });
  let rows = [...groups.values()].map(({ key, recs }) => {
    const out = { attributes: { type: 'AggregateResult' } };
    q.groupBy.forEach((g, i) => { out[g.split('.').pop()] = key[i]; });
    aggs.forEach((a, i) => {
      const alias = a.alias || `expr${i}`;
      if (a.field) checkReadable(ctx, api, a.field);
      const vals = a.field ? recs.map((r) => pathValue(ctx, api, r, a.field).value).filter((v) => v != null && v !== '') : recs;
      let v;
      switch (a.agg) {
        case 'COUNT': v = vals.length; break;
        case 'COUNT_DISTINCT': v = new Set(vals.map(String)).size; break;
        case 'SUM': v = vals.reduce((s, x) => s + Number(x), 0); break;
        case 'AVG': v = vals.length ? vals.reduce((s, x) => s + Number(x), 0) / vals.length : null; break;
        case 'MIN': v = vals.length ? vals.reduce((m, x) => (x < m ? x : m)) : null; break;
        case 'MAX': v = vals.length ? vals.reduce((m, x) => (x > m ? x : m)) : null; break;
      }
      out[alias] = v;
    });
    return out;
  });
  if (q.fields.length === 1 && aggs.length === 1 && aggs[0].agg === 'COUNT' && !aggs[0].field && !q.groupBy.length) {
    return { totalSize: items.length, done: true, records: [] };
  }
  if (q.orderBy.length) {
    rows.sort((a, b) => {
      for (const o of q.orderBy) {
        const k = o.field.includes('(') ? Object.keys(a).find((x) => x.startsWith('expr')) : o.field.split('.').pop();
        const x = a[k], y = b[k];
        const c = x == null ? 1 : y == null ? -1 : typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
        if (c) return o.dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  if (q.limit != null) rows = rows.slice(q.offset || 0, (q.offset || 0) + q.limit);
  return { totalSize: rows.length, done: true, records: rows };
}

export { shape };
