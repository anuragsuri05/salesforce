// SQLite storage (node:sqlite). Records use a single multi-tenant style table with JSON data,
// the same "universal data dictionary" idea Salesforce uses: metadata describes the shape.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.SLAVY_DB || path.join(root, 'data', 'slavy.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS org (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS objects (api_name TEXT PRIMARY KEY, def TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fields (object TEXT NOT NULL, api_name TEXT NOT NULL, def TEXT NOT NULL, PRIMARY KEY (object, api_name));
CREATE TABLE IF NOT EXISTS meta (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT, object TEXT, def TEXT NOT NULL,
  created_at TEXT, updated_at TEXT, created_by TEXT);
CREATE INDEX IF NOT EXISTS meta_type ON meta(type, object);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, object TEXT NOT NULL, name TEXT, data TEXT NOT NULL,
  owner_id TEXT, created_by TEXT, created_at TEXT, modified_by TEXT, modified_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, deleted_by TEXT, deleted_with TEXT);
CREATE INDEX IF NOT EXISTS records_object ON records(object, is_deleted);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT, first_name TEXT, last_name TEXT,
  alias TEXT, title TEXT, phone TEXT, profile_id TEXT, role_id TEXT, manager_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1, password_hash TEXT, timezone TEXT, created_at TEXT, last_login TEXT);
CREATE TABLE IF NOT EXISTS permset_assignments (user_id TEXT, permset_id TEXT, PRIMARY KEY (user_id, permset_id));
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, expires_at TEXT);
CREATE TABLE IF NOT EXISTS login_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, username TEXT, at TEXT, ip TEXT, status TEXT, user_agent TEXT);
CREATE TABLE IF NOT EXISTS audit_trail (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, user_id TEXT, section TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS field_history (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT, object TEXT, field TEXT, old_value TEXT, new_value TEXT, changed_by TEXT, changed_at TEXT);
CREATE INDEX IF NOT EXISTS field_history_rec ON field_history(record_id);
CREATE TABLE IF NOT EXISTS record_shares (record_id TEXT, grantee_id TEXT, access TEXT, created_by TEXT, created_at TEXT, PRIMARY KEY (record_id, grantee_id));
CREATE TABLE IF NOT EXISTS feed (id TEXT PRIMARY KEY, parent_id TEXT, type TEXT, body TEXT, data TEXT, created_by TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS feed_parent ON feed(parent_id);
CREATE TABLE IF NOT EXISTS feed_comments (id TEXT PRIMARY KEY, feed_id TEXT, body TEXT, created_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS feed_likes (feed_id TEXT, user_id TEXT, PRIMARY KEY (feed_id, user_id));
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, body TEXT, link TEXT, is_read INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, record_id TEXT, object TEXT, process_id TEXT, status TEXT, submitted_by TEXT,
  approver_id TEXT, comments TEXT, created_at TEXT, acted_at TEXT, acted_by TEXT);
CREATE TABLE IF NOT EXISTS email_log (id TEXT PRIMARY KEY, to_addr TEXT, subject TEXT, body TEXT, related_id TEXT, sent_by TEXT, sent_at TEXT, source TEXT);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS recent_items (user_id TEXT, record_id TEXT, viewed_at TEXT, PRIMARY KEY (user_id, record_id));
CREATE TABLE IF NOT EXISTS favorites (user_id TEXT, target TEXT, label TEXT, created_at TEXT, PRIMARY KEY (user_id, target));
CREATE TABLE IF NOT EXISTS ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, user_id TEXT, feature TEXT, provider TEXT, model TEXT, record_id TEXT,
  status TEXT, error TEXT, latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, masked INTEGER, prompt TEXT, response TEXT);
CREATE TABLE IF NOT EXISTS ai_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, user_id TEXT, kind TEXT, payload TEXT, status TEXT, attempts INTEGER DEFAULT 0, result TEXT, finished_at TEXT);
`);

const stmts = new Map();
function stmt(sql) {
  let s = stmts.get(sql);
  if (!s) { s = db.prepare(sql); stmts.set(sql, s); }
  return s;
}

export const all = (sql, ...params) => stmt(sql).all(...params);
export const get = (sql, ...params) => stmt(sql).get(...params);
export const run = (sql, ...params) => stmt(sql).run(...params);

let depth = 0;
// Nested transactions via savepoints. If fn throws, everything since the savepoint is undone.
export function tx(fn) {
  const name = `sp${depth}`;
  db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
  depth++;
  try {
    const result = fn();
    depth--;
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
    return result;
  } catch (e) {
    depth--;
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
    throw e;
  }
}

export function nextCounter(name) {
  run('INSERT INTO counters(name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1', name);
  return get('SELECT value FROM counters WHERE name = ?', name).value;
}

export function orgSetting(key, fallback = null) {
  const row = get('SELECT value FROM org WHERE key = ?', key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setOrgSetting(key, value) {
  run('INSERT INTO org(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

export function audit(userId, section, action, detail = '') {
  run('INSERT INTO audit_trail(at, user_id, section, action, detail) VALUES (?, ?, ?, ?, ?)',
    new Date().toISOString(), userId, section, action, detail);
}
