import { normalizePing } from './ingest.js';
import { insertEvent } from './db.js';
import { checkAuth, unauthorized } from './auth.js';
import { queryStats } from './stats.js';
import { renderStats, STATS_HEADERS } from './html.js';

const TEXT = { 'Content-Type': 'text/plain; charset=utf-8' };
const ROBOTS = 'User-agent: *\nAllow: /ping\n';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    const isHead = method === 'HEAD';

    if (pathname === '/ping' && (method === 'GET' || isHead)) {
      if (!isHead) {
        const row = normalizePing(request.url, request.headers.get('User-Agent'));
        if (row) await insertEvent(env.DB, row);
      }
      return new Response(isHead ? null : 'ok', {
        status: 200,
        headers: { ...TEXT, 'Cache-Control': 'no-store' },
      });
    }

    if (pathname === '/robots.txt' && (method === 'GET' || isHead)) {
      return new Response(isHead ? null : ROBOTS, { status: 200, headers: TEXT });
    }

    if (pathname === '/stats' && method === 'GET') {
      if (!env.STATS_PASSWORD) {
        return new Response('Stats not configured', { status: 503, headers: { ...TEXT, 'Cache-Control': 'no-store' } });
      }
      if (!(await checkAuth(request, env.STATS_PASSWORD))) return unauthorized();
      const stats = await queryStats(env.DB, { includeTest: url.searchParams.get('test') === '1' });
      return new Response(renderStats(stats), { status: 200, headers: STATS_HEADERS });
    }

    return new Response('Not found', { status: 404, headers: TEXT });
  },
};
