// Slavy server entry point.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from './db.js';
import { Router, readBody, sendJson, sendError, serveStatic } from './http.js';
import { authenticate } from './auth.js';
import { registerCore, HANDLED } from './api/core.js';
import { registerAnalytics } from './api/analytics.js';
import { registerSetup } from './api/setup.js';
import { registerRest } from './api/rest.js';
import { registerAI } from './api/ai.js';
import { startJobWorker } from './ai/features.js';
import { startScheduler } from './automation.js';
import { HttpError } from './util.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp() {
  const router = new Router();
  registerCore(router);
  registerAnalytics(router);
  registerSetup(router);
  registerRest(router);
  registerAI(router);

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const isApi = pathname.startsWith('/api/') || pathname.startsWith('/services/') || pathname.startsWith('/web-to-');
    if (!isApi) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, new HttpError(405, 'Method not allowed'));
      if (serveStatic(PUBLIC_DIR, req, res, pathname)) return;
      // SPA fallback only for page routes; missing assets (/css/x.css, /js/y.js) are real 404s.
      if (path.extname(pathname)) return sendError(res, new HttpError(404, 'Not found'));
      return serveStatic(PUBLIC_DIR, req, res, '/index.html') || sendError(res, new HttpError(404, 'Not found'));
    }
    const rest = pathname.startsWith('/services/');
    try {
      const m = router.match(req.method, pathname);
      if (!m) throw new HttpError(404, `No such endpoint: ${req.method} ${pathname}`);
      if (m.methodNotAllowed) throw new HttpError(405, `Method ${req.method} not allowed`);
      const { route, params } = m;
      let ctx = null;
      if (route.opts.auth !== false) {
        const a = authenticate(req);
        if (!a) throw new HttpError(401, rest ? 'Session expired or invalid' : 'Not logged in');
        ctx = a.ctx;
        // CSRF: cookie-authenticated writes must come from our own client.
        if (!a.bearer && req.method !== 'GET' && req.headers['x-requested-with'] !== 'slavy') {
          throw new HttpError(403, 'Missing X-Requested-With header');
        }
      }
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams);
      const result = await route.handler({ req, res, ctx, params, query, body });
      if (result === HANDLED) return;
      if (res.statusCode === 204) { res.end(); return; }
      sendJson(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, result ?? { ok: true });
    } catch (e) {
      if (!res.headersSent) { res.statusCode = 200; sendError(res, e, { salesforceFormat: rest }); }
      else res.end();
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hasUsers = get('SELECT COUNT(*) AS n FROM users').n > 0;
  if (!hasUsers) {
    const { seed } = await import('./seed.js');
    seed();
  }
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer(createApp());
  startScheduler();
  startJobWorker();
  server.listen(port, () => {
    console.log(`\n  Slavy is running at http://localhost:${port}`);
    if (!hasUsers) console.log('  Demo data loaded. Log in as admin@slavy.dev / slavy123');
    console.log('');
  });
}
