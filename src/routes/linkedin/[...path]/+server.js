import { error } from '@sveltejs/kit';

// The upstream app sets kit.paths.base = '/linkedin', which means its own root route always
// redirects bare "/linkedin" -> "/linkedin/" (a SvelteKit quirk: a non-empty base always needs
// a trailing slash to match the root "/" route, independent of that app's trailingSlash
// setting). cc-gateway's own default trailingSlash ('never') would otherwise intercept
// "/linkedin/" and redirect it back to "/linkedin" *before* this handler ever runs, producing
// an infinite redirect loop between the two routers. 'ignore' disables cc-gateway's own
// trailing-slash canonicalization for this route so both forms reach proxy() untouched and the
// upstream's own redirect (forwarded as-is, see `redirect: 'manual'` below) is what the browser
// follows.
export const trailingSlash = 'ignore';

// Falls back to the app's default dev port if unset; production sets this in cc-gateway's .env
// (mirrors the existing but currently-unused DASHBOARD_URL convention already in that file).
const LINKEDIN_URL = process.env.LINKEDIN_URL || 'http://127.0.0.1:3003';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'
]);

// Node's fetch() transparently decompresses a gzip/br/deflate upstream response body (same as
// browser fetch) but leaves the original, pre-decompression content-encoding/content-length
// headers on the Response object it hands back. Forwarding those two headers as-is would tell
// the browser "this body is still br-compressed, and is N (compressed) bytes long" when it is
// actually already-decoded, differently-sized bytes -- the browser then fails to decode it (or
// hangs/truncates on the length mismatch). Confirmed live against this app's own precompressed
// _app/immutable/** assets (served with content-encoding: br). Strip both; the HTTP layer
// recomputes a correct length (or uses chunked encoding) for the body actually being sent.
const RESPONSE_ONLY_STRIP = new Set(['content-encoding', 'content-length']);

// linkedin-outreach-tool has no auth of its own and never reads any cookie (grep confirms no
// `cookie`/`cookies.get` usage anywhere in its src/) -- so cc-gateway's own cc_session cookie is
// forwarded upstream for zero functional benefit, only unnecessary exposure of the (HMAC-signed)
// session token to a second process/log stream. Stripped on the request side only.
const REQUEST_ONLY_STRIP = new Set(['cookie']);

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
  for (const name of REQUEST_ONLY_STRIP) headers.delete(name);

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

  const responseHeaders = stripHopByHop(upstreamResponse.headers);
  for (const name of RESPONSE_ONLY_STRIP) responseHeaders.delete(name);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
