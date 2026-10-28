// Minimal HTTP toolkit: router, body parsing, cookies, static files.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, ValidationError } from './util.js';

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler, opts });
    return this;
  }
  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  put(p, h, o) { return this.add('PUT', p, h, o); }
  patch(p, h, o) { return this.add('PATCH', p, h, o); }
  delete(p, h, o) { return this.add('DELETE', p, h, o); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      const type = String(req.headers['content-type'] || '');
      try {
        if (type.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(raw)));
        if (type.includes('text/')) return resolve({ text: raw });
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
};

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

export function sendText(res, status, text, type = 'text/plain', headers = {}) {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, ...SECURITY_HEADERS, ...headers });
  res.end(text);
}

export function sendError(res, e, { salesforceFormat = false } = {}) {
  const status = e instanceof HttpError ? e.status : 500;
  if (status === 500) console.error(e);
  const message = status === 500 ? 'Internal server error: ' + e.message : e.message;
  if (salesforceFormat) {
    const errs = e instanceof ValidationError
      ? e.errors.map((x) => ({ message: x.message, errorCode: 'FIELD_CUSTOM_VALIDATION_EXCEPTION', fields: x.field ? [x.field] : [] }))
      : [{ message, errorCode: { 400: 'MALFORMED_QUERY', 401: 'INVALID_SESSION_ID', 403: 'INSUFFICIENT_ACCESS', 404: 'NOT_FOUND' }[status] || 'UNKNOWN_EXCEPTION' }];
    return sendJson(res, status, errs);
  }
  sendJson(res, status, { error: message, ...(e.details || {}) });
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

export function serveStatic(root, req, res, pathname) {
  const target = path.normalize(path.join(root, decodeURIComponent(pathname)));
  if (!target.startsWith(root)) return false;
  let file = target;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    return false;
  }
  if (!fs.existsSync(file)) return false;
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': (MIME[ext] || 'application/octet-stream') + (ext === '.html' || ext === '.js' || ext === '.css' ? '; charset=utf-8' : ''),
    'Cache-Control': ext === '.html' ? 'no-cache' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  fs.createReadStream(file).pipe(res);
  return true;
}
