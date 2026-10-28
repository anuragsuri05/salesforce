// Shared helpers: ids, errors, dates.
import crypto from 'node:crypto';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Key prefixes for platform (non-sObject) entities. sObject prefixes live on the object definition.
export const PREFIX = {
  User: '005', Profile: '00e', Role: '00E', PermissionSet: '0PS', Group: '00G',
  Report: '00O', Dashboard: '01Z', Flow: '301', ListView: '00B', Layout: '00h',
  ValidationRule: '03d', ApprovalProcess: '04a', App: '02u', Action: '0QA',
  SharingRule: '02c', Feed: '0D5', Comment: '0D7', Notification: '0Nt',
  Approval: '04i', Share: '0Sh', Email: '02s', Session: '0Sx',
};

// 15-character id: 3-char key prefix + 2-char "pod" + 10 random base62 chars.
export function newId(prefix) {
  const bytes = crypto.randomBytes(10);
  let s = '';
  for (const b of bytes) s += B62[b % 62];
  return prefix + '7S' + s;
}

export const prefixOf = (id) => (typeof id === 'string' ? id.slice(0, 3) : '');

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Field-level save errors: [{ field, message }]
export class ValidationError extends HttpError {
  constructor(errors) {
    super(400, errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join('; '), { errors });
    this.errors = errors;
  }
}

export const nowIso = () => new Date().toISOString();

export function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return todayStr(d);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

export const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}
