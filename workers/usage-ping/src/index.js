import { normalizePing } from './ingest.js';
import { insertEvent } from './db.js';

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

    return new Response('Not found', { status: 404, headers: TEXT });
  },
};
