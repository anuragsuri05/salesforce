// Slavy formula language — a Salesforce-compatible subset.
// Used by formula fields, validation rules, default values, flow conditions/assignments and approval criteria.
//
//   IF(ISPICKVAL(StageName, 'Closed Won'), Amount * 0.1, 0)
//   AND(ISCHANGED(Status), Account.Industry = 'Banking', CloseDate < TODAY() + 30)

export class FormulaError extends Error {}

// Date-only value. valueOf() returns days since epoch so <, >, - work naturally.
export class SDate {
  constructor(days) { this.days = days; }
  static parse(s) {
    if (s instanceof SDate) return s;
    if (s instanceof Date) return new SDate(Math.floor(s.getTime() / 86400000));
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return null;
    return new SDate(Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000));
  }
  static today() { return SDate.parse(new Date().toISOString()); }
  get date() { return new Date(this.days * 86400000); }
  valueOf() { return this.days; }
  toString() { return this.date.toISOString().slice(0, 10); }
  toJSON() { return this.toString(); }
}

// ---------- tokenizer ----------
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new FormulaError('Unterminated comment');
      i = end + 2; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[j + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n; j += 2;
        } else s += src[j++];
      }
      if (j >= src.length) throw new FormulaError('Unterminated string');
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_.$]*/.exec(src.slice(i));
      toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
    }
    const two = src.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '<>', '<=', '>='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>!(),'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new FormulaError(`Unexpected character "${c}"`);
  }
  toks.push({ t: 'eof' });
  return toks;
}

// ---------- parser (precedence climbing) ----------
const BIN = [
  ['||'], ['&&'], ['=', '==', '!=', '<>'], ['<', '>', '<=', '>='], ['+', '-', '&'], ['*', '/'],
];

export function parse(src) {
  if (src == null || String(src).trim() === '') throw new FormulaError('Formula is empty');
  const toks = tokenize(String(src));
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek().t === 'op' && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new FormulaError(`Expected "${v}"`);
    p++;
  };

  function level(n) {
    if (n === BIN.length) return power();
    let left = level(n + 1);
    while (peek().t === 'op' && BIN[n].includes(peek().v)) {
      const op = toks[p++].v;
      left = { t: 'bin', op, l: left, r: level(n + 1) };
    }
    return left;
  }
  function power() {
    const base = unary();
    if (isOp('^')) { p++; return { t: 'bin', op: '^', l: base, r: power() }; }
    return base;
  }
  function unary() {
    if (isOp('-')) { p++; return { t: 'un', op: '-', e: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    if (isOp('!')) { p++; return { t: 'un', op: '!', e: unary() }; }
    return primary();
  }
  function primary() {
    const tok = toks[p];
    if (tok.t === 'num') { p++; return { t: 'lit', v: tok.v }; }
    if (tok.t === 'str') { p++; return { t: 'lit', v: tok.v }; }
    if (tok.t === 'op' && tok.v === '(') {
      p++; const e = level(0); expect(')'); return e;
    }
    if (tok.t === 'id') {
      p++;
      const up = tok.v.toUpperCase();
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) {
          args.push(level(0));
          while (isOp(',')) { p++; args.push(level(0)); }
        }
        expect(')');
        if (!FUNCS[up]) throw new FormulaError(`Unknown function ${tok.v}`);
        return { t: 'call', name: up, args };
      }
      if (up === 'TRUE') return { t: 'lit', v: true };
      if (up === 'FALSE') return { t: 'lit', v: false };
      if (up === 'NULL') return { t: 'lit', v: null };
      return { t: 'ref', path: tok.v };
    }
    if (tok.t === 'eof') throw new FormulaError('Unexpected end of formula');
    throw new FormulaError(`Unexpected "${tok.v}"`);
  }

  const ast = level(0);
  if (peek().t !== 'eof') throw new FormulaError(`Unexpected "${peek().v}" after end of expression`);
  return ast;
}

const astCache = new Map();
export function compile(src) {
  let ast = astCache.get(src);
  if (!ast) {
    ast = parse(src);
    if (astCache.size > 2000) astCache.clear();
    astCache.set(src, ast);
  }
  return ast;
}

// All field references used by a formula (for validation in Setup).
export function references(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.t === 'ref') out.add(ast.path);
  if (ast.t === 'bin') { references(ast.l, out); references(ast.r, out); }
  if (ast.t === 'un') references(ast.e, out);
  if (ast.t === 'call') ast.args.forEach((a) => references(a, out));
  return out;
}

// ---------- evaluation ----------
const isBlank = (v) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
const isDateLike = (v) => v instanceof SDate || v instanceof Date;

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isDateLike(v)) return +v;
  const n = Number(v);
  if (Number.isNaN(n)) throw new FormulaError(`"${v}" is not a number`);
  return n;
}

export function toText(v) {
  if (v == null) return '';
  if (v instanceof SDate) return v.toString();
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(10));
  return String(v);
}

function equals(a, b) {
  if (isBlank(a) && isBlank(b)) return true;
  if (isBlank(a) || isBlank(b)) return false;
  if (isDateLike(a) || isDateLike(b)) return +a === +b;
  if (typeof a === 'number' || typeof b === 'number') return num(a) === num(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}

function compare(a, b) {
  if (isBlank(a) || isBlank(b)) return null;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  const x = num(a), y = num(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function arith(op, a, b) {
  if (op === '&') return toText(a) + toText(b);
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return toText(a) + toText(b);
  if (isBlank(a) && isBlank(b)) return null;
  if (op === '+') {
    if (a instanceof SDate && !isDateLike(b)) return new SDate(a.days + Math.trunc(num(b)));
    if (b instanceof SDate && !isDateLike(a)) return new SDate(b.days + Math.trunc(num(a)));
    if (a instanceof Date && !isDateLike(b)) return new Date(a.getTime() + num(b) * 86400000);
    return num(a) + num(b);
  }
  if (op === '-') {
    if (a instanceof SDate && b instanceof SDate) return a.days - b.days;
    if (a instanceof Date && b instanceof Date) return (a - b) / 86400000;
    if (a instanceof SDate) return new SDate(a.days - Math.trunc(num(b)));
    if (a instanceof Date) return new Date(a.getTime() - num(b) * 86400000);
    return num(a) - num(b);
  }
  if (op === '*') return num(a) * num(b);
  if (op === '/') {
    const d = num(b);
    if (d === 0) throw new FormulaError('Division by zero');
    return num(a) / d;
  }
  if (op === '^') return Math.pow(num(a), num(b));
  throw new FormulaError(`Unknown operator ${op}`);
}

function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof SDate) return v;
  if (v instanceof Date) return SDate.parse(v);
  const d = SDate.parse(v);
  if (!d) throw new FormulaError(`"${v}" is not a date`);
  return d;
}

function toDateTime(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  if (v instanceof SDate) return v.date;
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) throw new FormulaError(`"${v}" is not a date/time`);
  return d;
}

const ymd = (d) => { const x = toDate(d).date; return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; };

function round(n, digits = 0) {
  const f = Math.pow(10, digits);
  return Math.sign(n) * Math.round(Math.abs(n) * f) / f;
}

// Lazy functions receive (args ASTs, ev, ctx); eager functions receive evaluated values.
const LAZY = new Set(['IF', 'AND', 'OR', 'CASE', 'BLANKVALUE', 'NULLVALUE', 'ISCHANGED', 'PRIORVALUE', 'ISNEW']);

const FUNCS = {
  // logical
  IF: (a, ev) => (ev(a[0]) ? ev(a[1]) : a.length > 2 ? ev(a[2]) : null),
  AND: (a, ev) => a.every((x) => Boolean(ev(x))),
  OR: (a, ev) => a.some((x) => Boolean(ev(x))),
  NOT: ([v]) => !v,
  CASE: (a, ev) => {
    const v = ev(a[0]);
    for (let i = 1; i + 1 < a.length; i += 2) if (equals(v, ev(a[i]))) return ev(a[i + 1]);
    return a.length % 2 === 0 ? ev(a[a.length - 1]) : null;
  },
  ISBLANK: ([v]) => isBlank(v),
  ISNULL: ([v]) => isBlank(v),
  BLANKVALUE: (a, ev) => { const v = ev(a[0]); return isBlank(v) ? ev(a[1]) : v; },
  NULLVALUE: (a, ev) => { const v = ev(a[0]); return isBlank(v) ? ev(a[1]) : v; },
  ISPICKVAL: ([v, x]) => equals(v ?? '', x ?? ''),
  ISNUMBER: ([v]) => v != null && v !== '' && !Number.isNaN(Number(v)),
  INCLUDES: ([v, x]) => String(v ?? '').split(';').includes(String(x)),
  ISNEW: (a, ev, ctx) => Boolean(ctx.isNew),
  ISCHANGED: (a, ev, ctx) => {
    if (a[0]?.t !== 'ref') throw new FormulaError('ISCHANGED requires a field');
    return Boolean(ctx.isChanged && ctx.isChanged(a[0].path));
  },
  PRIORVALUE: (a, ev, ctx) => {
    if (a[0]?.t !== 'ref') throw new FormulaError('PRIORVALUE requires a field');
    return ctx.prior ? ctx.prior(a[0].path) : null;
  },
  // text
  LEN: ([v]) => toText(v).length,
  LEFT: ([v, n]) => toText(v).slice(0, Math.max(0, num(n))),
  RIGHT: ([v, n]) => { const s = toText(v); return num(n) <= 0 ? '' : s.slice(-num(n)); },
  MID: ([v, start, n]) => toText(v).substr(Math.max(0, num(start) - 1), num(n)),
  UPPER: ([v]) => toText(v).toUpperCase(),
  LOWER: ([v]) => toText(v).toLowerCase(),
  TRIM: ([v]) => toText(v).trim(),
  CONTAINS: ([v, x]) => toText(v).includes(toText(x)),
  BEGINS: ([v, x]) => toText(v).startsWith(toText(x)),
  FIND: ([x, v, start]) => { const i = toText(v).indexOf(toText(x), start ? num(start) - 1 : 0); return i + 1; },
  SUBSTITUTE: ([v, a, b]) => toText(v).split(toText(a)).join(toText(b)),
  TEXT: ([v]) => toText(v),
  VALUE: ([v]) => { const n = Number(toText(v).replace(/,/g, '')); if (Number.isNaN(n)) throw new FormulaError(`VALUE: "${v}" is not a number`); return n; },
  LPAD: ([v, n, pad = ' ']) => toText(v).padStart(num(n), toText(pad)).slice(0, num(n)),
  RPAD: ([v, n, pad = ' ']) => toText(v).padEnd(num(n), toText(pad)).slice(0, num(n)),
  BR: () => '\n',
  HYPERLINK: ([url, label]) => toText(label ?? url),
  REGEX: ([v, re]) => new RegExp('^(?:' + toText(re) + ')$').test(toText(v)),
  // math
  ABS: ([v]) => Math.abs(num(v)),
  ROUND: ([v, d = 0]) => round(num(v), num(d)),
  CEILING: ([v]) => Math.ceil(num(v)),
  FLOOR: ([v]) => Math.floor(num(v)),
  MCEILING: ([v]) => Math.ceil(num(v)),
  MFLOOR: ([v]) => Math.floor(num(v)),
  MAX: (vals) => Math.max(...vals.map(num)),
  MIN: (vals) => Math.min(...vals.map(num)),
  MOD: ([a, b]) => num(a) % num(b),
  SQRT: ([v]) => Math.sqrt(num(v)),
  POWER: ([a, b]) => Math.pow(num(a), num(b)),
  EXP: ([v]) => Math.exp(num(v)),
  LN: ([v]) => Math.log(num(v)),
  LOG: ([v]) => Math.log10(num(v)),
  // dates
  TODAY: () => SDate.today(),
  NOW: () => new Date(),
  DATE: ([y, m, d]) => new SDate(Math.floor(Date.UTC(num(y), num(m) - 1, num(d)) / 86400000)),
  DATEVALUE: ([v]) => toDate(v),
  DATETIMEVALUE: ([v]) => toDateTime(v),
  YEAR: ([v]) => (v == null ? null : ymd(v)[0]),
  MONTH: ([v]) => (v == null ? null : ymd(v)[1]),
  DAY: ([v]) => (v == null ? null : ymd(v)[2]),
  WEEKDAY: ([v]) => (v == null ? null : toDate(v).date.getUTCDay() + 1),
  ADDMONTHS: ([v, n]) => {
    if (v == null) return null;
    const d = toDate(v).date;
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + num(n), 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d.getUTCDate(), last));
    return SDate.parse(target);
  },
};

export const FUNCTION_NAMES = Object.keys(FUNCS).sort();

// ctx: { get(path), prior(path), isChanged(path), isNew }
export function evaluate(src, ctx) {
  const ast = typeof src === 'string' ? compile(src) : src;
  const ev = (n) => {
    switch (n.t) {
      case 'lit': return n.v;
      case 'ref': return ctx.get(n.path);
      case 'un': {
        const v = ev(n.e);
        return n.op === '-' ? (isBlank(v) ? null : -num(v)) : !v;
      }
      case 'bin': {
        const { op } = n;
        if (op === '&&') return Boolean(ev(n.l)) && Boolean(ev(n.r));
        if (op === '||') return Boolean(ev(n.l)) || Boolean(ev(n.r));
        const a = ev(n.l), b = ev(n.r);
        if (op === '=' || op === '==') return equals(a, b);
        if (op === '!=' || op === '<>') return !equals(a, b);
        if (op === '<' || op === '>' || op === '<=' || op === '>=') {
          const c = compare(a, b);
          if (c === null) return false;
          return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
        }
        return arith(op, a, b);
      }
      case 'call': {
        const fn = FUNCS[n.name];
        if (LAZY.has(n.name)) return fn(n.args, ev, ctx);
        return fn(n.args.map(ev), ev, ctx);
      }
    }
    throw new FormulaError('Bad expression');
  };
  return ev(ast);
}

// Replace {!expression} merge fields in a text template.
export function mergeTemplate(template, ctx) {
  return String(template ?? '').replace(/\{!([^}]+)\}/g, (_, expr) => {
    try { return toText(evaluate(expr.trim(), ctx)); } catch { return ''; }
  });
}
