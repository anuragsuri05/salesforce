// Filter conditions shared by list views, reports, sharing rules and SOQL WHERE clauses.
//
// Condition AST:
//   { t: 'and'|'or', items: [...] } | { t: 'not', item } | { t: 'cmp', field, op, value }
//   value: literal | { dateLiteral: 'LAST_N_DAYS', n: 30 } | array (for in/notin/includes/excludes)
// ops: = != < > <= >= like in notin includes excludes contains notcontains startswith

import { HttpError } from './util.js';

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));

export const DATE_LITERALS = [
  'TODAY', 'YESTERDAY', 'TOMORROW', 'THIS_WEEK', 'LAST_WEEK', 'NEXT_WEEK', 'THIS_MONTH', 'LAST_MONTH',
  'NEXT_MONTH', 'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER', 'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR',
  'LAST_90_DAYS', 'NEXT_90_DAYS', 'LAST_N_DAYS', 'NEXT_N_DAYS', 'N_DAYS_AGO', 'LAST_N_MONTHS', 'NEXT_N_MONTHS',
  'LAST_N_YEARS', 'NEXT_N_YEARS',
];

// Returns [startISODate, endISODate] inclusive, or null if not a date literal.
export function dateLiteralRange(name, n = 0, now = new Date()) {
  const t = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const shift = (days) => new Date(t.getTime() + days * DAY);
  const weekStart = shift(-t.getUTCDay()); // Sunday-start weeks
  const q = Math.floor(m / 3);
  const range = (a, b) => [iso(a), iso(b)];
  switch (String(name).toUpperCase()) {
    case 'TODAY': return range(t, t);
    case 'YESTERDAY': return range(shift(-1), shift(-1));
    case 'TOMORROW': return range(shift(1), shift(1));
    case 'THIS_WEEK': return range(weekStart, new Date(weekStart.getTime() + 6 * DAY));
    case 'LAST_WEEK': return range(new Date(weekStart.getTime() - 7 * DAY), new Date(weekStart.getTime() - DAY));
    case 'NEXT_WEEK': return range(new Date(weekStart.getTime() + 7 * DAY), new Date(weekStart.getTime() + 13 * DAY));
    case 'THIS_MONTH': return range(utc(y, m, 1), utc(y, m + 1, 0));
    case 'LAST_MONTH': return range(utc(y, m - 1, 1), utc(y, m, 0));
    case 'NEXT_MONTH': return range(utc(y, m + 1, 1), utc(y, m + 2, 0));
    case 'THIS_QUARTER': return range(utc(y, q * 3, 1), utc(y, q * 3 + 3, 0));
    case 'LAST_QUARTER': return range(utc(y, q * 3 - 3, 1), utc(y, q * 3, 0));
    case 'NEXT_QUARTER': return range(utc(y, q * 3 + 3, 1), utc(y, q * 3 + 6, 0));
    case 'THIS_YEAR': return range(utc(y, 0, 1), utc(y, 11, 31));
    case 'LAST_YEAR': return range(utc(y - 1, 0, 1), utc(y - 1, 11, 31));
    case 'NEXT_YEAR': return range(utc(y + 1, 0, 1), utc(y + 1, 11, 31));
    case 'LAST_90_DAYS': return range(shift(-90), t);
    case 'NEXT_90_DAYS': return range(t, shift(90));
    case 'LAST_N_DAYS': return range(shift(-n), t);
    case 'NEXT_N_DAYS': return range(t, shift(n));
    case 'N_DAYS_AGO': return range(shift(-n), shift(-n));
    case 'LAST_N_MONTHS': return range(utc(y, m - n, 1), utc(y, m, 0));
    case 'NEXT_N_MONTHS': return range(utc(y, m + 1, 1), utc(y, m + n + 1, 0));
    case 'LAST_N_YEARS': return range(utc(y - n, 0, 1), utc(y - 1, 11, 31));
    case 'NEXT_N_YEARS': return range(utc(y + 1, 0, 1), utc(y + n, 11, 31));
    default: return null;
  }
}

// "LAST_N_DAYS:30" -> { dateLiteral, n }
export function parseDateLiteral(s) {
  if (typeof s !== 'string') return null;
  const m = /^([A-Z_0-9]+)(?::(\d+))?$/i.exec(s.trim());
  if (!m || !DATE_LITERALS.includes(m[1].toUpperCase())) return null;
  return { dateLiteral: m[1].toUpperCase(), n: m[2] ? +m[2] : 0 };
}

const NUMERIC = new Set(['Number', 'Currency', 'Percent', 'AutoNumberNum', 'Rollup']);
const DATEISH = new Set(['Date', 'DateTime']);

function likeToRegex(p) {
  let re = '';
  for (const ch of String(p)) {
    if (ch === '%') re += '.*';
    else if (ch === '_') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'is');
}

const blank = (v) => v == null || v === '';

function coerce(lit, type) {
  if (lit == null) return null;
  if (NUMERIC.has(type)) { const n = Number(lit); return Number.isNaN(n) ? lit : n; }
  if (type === 'Checkbox') return lit === true || String(lit).toLowerCase() === 'true';
  return lit;
}

function cmpValues(a, b, type) {
  if (NUMERIC.has(type) || (typeof a === 'number' && typeof b === 'number')) return Number(a) - Number(b);
  if (DATEISH.has(type)) return String(a).localeCompare(String(b));
  const x = String(a).toLowerCase(), y = String(b).toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function testCmp(fieldValue, type, op, value) {
  // Date literal ranges
  if (value && typeof value === 'object' && !Array.isArray(value) && value.dateLiteral) {
    if (blank(fieldValue)) return op === '!=';
    const [s, e] = dateLiteralRange(value.dateLiteral, value.n);
    const v = String(fieldValue).slice(0, 10);
    switch (op) {
      case '=': return v >= s && v <= e;
      case '!=': return v < s || v > e;
      case '<': return v < s;
      case '>': return v > e;
      case '<=': return v <= e;
      case '>=': return v >= s;
      default: return false;
    }
  }
  if (type === 'Date' || type === 'DateTime') {
    // Compare datetimes against plain dates by date part.
    if (typeof value === 'string' && value.length === 10 && fieldValue) fieldValue = String(fieldValue).slice(0, 10);
  }
  switch (op) {
    case '=':
      if (value == null || value === '') return blank(fieldValue);
      if (blank(fieldValue)) return false;
      if (type === 'MultiPicklist') return String(fieldValue).toLowerCase() === String(value).toLowerCase();
      return cmpValues(fieldValue, coerce(value, type), type) === 0;
    case '!=':
      if (value == null || value === '') return !blank(fieldValue);
      if (blank(fieldValue)) return true;
      return cmpValues(fieldValue, coerce(value, type), type) !== 0;
    case '<': case '>': case '<=': case '>=': {
      if (blank(fieldValue) || blank(value)) return false;
      const c = cmpValues(fieldValue, coerce(value, type), type);
      return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
    }
    case 'like': return !blank(fieldValue) && likeToRegex(value).test(String(fieldValue));
    case 'contains': return !blank(fieldValue) && String(fieldValue).toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'notcontains': return blank(fieldValue) || !String(fieldValue).toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'startswith': return !blank(fieldValue) && String(fieldValue).toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case 'in': return (value || []).some((x) => testCmp(fieldValue, type, '=', x));
    case 'notin': return !(value || []).some((x) => testCmp(fieldValue, type, '=', x));
    case 'includes': case 'excludes': {
      const have = new Set(String(fieldValue ?? '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean));
      const hit = (value || []).some((x) => String(x).split(';').every((p) => have.has(p.trim().toLowerCase())));
      return op === 'includes' ? hit : !hit;
    }
  }
  throw new HttpError(400, `Unsupported operator ${op}`);
}

// getValue(path) -> { value, type }
export function evalCondition(cond, getValue) {
  if (!cond) return true;
  switch (cond.t) {
    case 'and': return cond.items.every((c) => evalCondition(c, getValue));
    case 'or': return cond.items.some((c) => evalCondition(c, getValue));
    case 'not': return !evalCondition(cond.item, getValue);
    case 'cmp': {
      const { value, type } = getValue(cond.field);
      return testCmp(value, type, cond.op, cond.value);
    }
  }
  throw new HttpError(400, 'Bad condition');
}

// ---------- UI-style filters ----------
// Filter: { field, op, value }  op: equals notEqual lessThan greaterThan lessOrEqual greaterOrEqual
//                                    contains notContain startsWith includes excludes
const UI_OPS = {
  equals: '=', notEqual: '!=', lessThan: '<', greaterThan: '>', lessOrEqual: '<=', greaterOrEqual: '>=',
  contains: 'contains', notContain: 'notcontains', startsWith: 'startswith', includes: 'includes', excludes: 'excludes',
};
export const FILTER_OPERATORS = Object.keys(UI_OPS);

export function filterToCmp(f) {
  const op = UI_OPS[f.op] || f.op;
  let value = f.value;
  if (typeof value === 'string') {
    const dl = parseDateLiteral(value);
    if (dl) value = dl;
  }
  if ((op === '=' || op === '!=') && typeof value === 'string' && value.includes(',')) {
    return { t: 'cmp', field: f.field, op: op === '=' ? 'in' : 'notin', value: value.split(',').map((s) => s.trim()) };
  }
  if (op === 'includes' || op === 'excludes') {
    value = Array.isArray(value) ? value : String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return { t: 'cmp', field: f.field, op, value };
}

// Filter logic such as "1 AND (2 OR 3)". Empty logic = AND of all filters.
export function filtersToCondition(filters = [], logic = '') {
  const cmps = filters.filter((f) => f && f.field).map(filterToCmp);
  if (!cmps.length) return null;
  if (!logic || !String(logic).trim()) return { t: 'and', items: cmps };
  const toks = String(logic).toUpperCase().match(/\d+|AND|OR|NOT|\(|\)/g) || [];
  let p = 0;
  const used = new Set();
  function orE() {
    const items = [andE()];
    while (toks[p] === 'OR') { p++; items.push(andE()); }
    return items.length > 1 ? { t: 'or', items } : items[0];
  }
  function andE() {
    const items = [notE()];
    while (toks[p] === 'AND') { p++; items.push(notE()); }
    return items.length > 1 ? { t: 'and', items } : items[0];
  }
  function notE() {
    if (toks[p] === 'NOT') { p++; return { t: 'not', item: notE() }; }
    if (toks[p] === '(') { p++; const e = orE(); if (toks[p++] !== ')') throw new HttpError(400, 'Filter logic: missing ")"'); return e; }
    const n = Number(toks[p++]);
    if (!n || !cmps[n - 1]) throw new HttpError(400, `Filter logic references unknown filter ${toks[p - 1] ?? ''}`.trim());
    used.add(n);
    return cmps[n - 1];
  }
  const cond = orE();
  if (p < toks.length) throw new HttpError(400, 'Filter logic: unexpected ' + toks[p]);
  if (used.size !== cmps.length) throw new HttpError(400, 'Filter logic must reference every filter');
  return cond;
}

export function conditionFields(cond, out = new Set()) {
  if (!cond) return out;
  if (cond.t === 'cmp') out.add(cond.field);
  else if (cond.t === 'not') conditionFields(cond.item, out);
  else cond.items.forEach((c) => conditionFields(c, out));
  return out;
}
