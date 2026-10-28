// Sessions & login.
import crypto from 'node:crypto';
import { get, run } from './db.js';
import { buildContext } from './security.js';
import { HttpError, verifyPassword, nowIso } from './util.js';
import { parseCookies } from './http.js';

const SESSION_HOURS = 12;
const failures = new Map(); // username -> { count, until }

export function login(username, password, { ip, userAgent } = {}) {
  const uname = String(username || '').trim().toLowerCase();
  const lock = failures.get(uname);
  if (lock && lock.until > Date.now()) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
  const user = get('SELECT * FROM users WHERE lower(username) = ?', uname);
  const ok = user && user.is_active && verifyPassword(String(password || ''), user.password_hash);
  run('INSERT INTO login_history(user_id, username, at, ip, status, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    user?.id || null, uname, nowIso(), ip || '', ok ? 'Success' : user && !user.is_active ? 'User is inactive' : 'Invalid password', String(userAgent || '').slice(0, 200));
  if (!ok) {
    const f = failures.get(uname) || { count: 0, until: 0 };
    f.count++;
    if (f.count >= 5) { f.until = Date.now() + 5 * 60000; f.count = 0; }
    failures.set(uname, f);
    throw new HttpError(401, 'Please check your username and password. If you still can\'t log in, contact your Slavy administrator.');
  }
  failures.delete(uname);
  return createSession(user.id);
}

export function createSession(userId, extra = {}) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
  run('INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', id, userId, nowIso(), expires);
  run('UPDATE users SET last_login = ? WHERE id = ?', nowIso(), userId);
  return { id, expires, ...extra };
}

export function logout(sessionId) {
  if (sessionId) run('DELETE FROM sessions WHERE id = ?', sessionId);
}

export function sessionIdFrom(req) {
  const auth = String(req.headers.authorization || '');
  if (/^(Bearer|OAuth) /i.test(auth)) return { id: auth.replace(/^(Bearer|OAuth) /i, '').trim(), bearer: true };
  const sid = parseCookies(req).sid;
  return sid ? { id: sid, bearer: false } : null;
}

// Returns { ctx, session } or null.
export function authenticate(req) {
  const s = sessionIdFrom(req);
  if (!s) return null;
  const session = get('SELECT * FROM sessions WHERE id = ?', s.id);
  if (!session || session.expires_at < nowIso()) return null;
  const user = get('SELECT * FROM users WHERE id = ?', session.user_id);
  if (!user || !user.is_active) return null;
  return { ctx: buildContext(user, { sessionId: s.id }), bearer: s.bearer, session };
}

export function sessionCookie(id, expires) {
  return `sid=${id}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expires).toUTCString()}`;
}
