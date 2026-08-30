import { error } from '@sveltejs/kit';

// Falls back to the app's default dev port if unset; production sets this in cc-gateway's .env
// (mirrors the existing but currently-unused DASHBOARD_URL convention already in that file).
const LINKEDIN_URL = process.env.LINKEDIN_URL || 'http://127.0.0.1:3003';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'
]);

function stripHopByHop(headers) {
  const h = new Headers(headers);
  for (const name of HOP_BY_HOP) h.delete(name);
  return h;
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
async function proxy(event) {
  // Defense-in-depth. hooks.server.js already default-denies this path prefix for
  // role === 'guest' (it is never added to settings.json's guestVisibility map — see §4.C),
  // so an unauthenticated or guest request never reaches this line. This check exists so that
  // a future accidental guestVisibility['/linkedin'] = true edit in /settings cannot expose
  // the app — it fails closed here regardless of that map's contents.
  if (event.locals.role !== 'admin') {
    throw error(403, 'Forbidden');
  }

  const upstreamUrl = new URL(event.url.pathname + event.url.search, LINKEDIN_URL);
  const headers = stripHopByHop(event.request.headers);

  const init = {
    method: event.request.method,
    headers,
    redirect: 'manual' // forward 3xx to the browser as-is; never let our fetch() silently follow one
  };
  if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
    init.body = event.request.body;
    init.duplex = 'half'; // required by undici/Node fetch whenever body is a ReadableStream
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, init);
  } catch (err) {
    // linkedin-outreach PM2 process down/unreachable — fail cleanly, don't take cc-gateway down.
    throw error(502, 'linkedin-outreach-tool is unreachable');
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: stripHopByHop(upstreamResponse.headers)
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
