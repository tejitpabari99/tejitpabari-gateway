import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { readSettings } from '$lib/settings.js';
import { getLink, recordClick } from '$lib/links.js';

const PUBLIC_PATHS = ['/login'];

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handle({ event, resolve }) {
  // go.tejitpabari.com redirect engine — must be first, redirects are public
  const host = event.request.headers.get('host') || '';
  if (host === 'go.tejitpabari.com') {
    const slug = event.url.pathname.slice(1); // strip leading /
    if (!slug) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#111">
        <h2>URL Shortener</h2><p>No slug provided.</p>
        </body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      );
    }
    const link = getLink(slug);
    if (!link) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#111">
        <h2>404 — Link not found</h2><p>The short link <code>go.tejitpabari.com/${slug}</code> does not exist.</p>
        </body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      );
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#111">
        <h2>410 — Link expired</h2><p>This link expired on ${link.expiresAt}.</p>
        </body></html>`,
        { status: 410, headers: { 'Content-Type': 'text/html' } }
      );
    }
    recordClick(slug);
    return new Response(null, {
      status: parseInt(link.redirectType, 10),
      headers: { Location: link.url }
    });
  }

  // cc-gateway auth logic
  const sessionCookie = event.cookies.get('cc_session');
  const role = verifySession(sessionCookie) || 'guest';
  event.locals.role = role;

  const path = event.url.pathname;
  const isApiRequest = path === '/api' || path.startsWith('/api/');

  // Public paths
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    return resolve(event);
  }

  // Require login for everything else
  // Guest visibility check
  if (role === 'guest') {
    const settings = readSettings();
    const allowedByPrefix = Object.entries(settings.guestVisibility || {})
      .some(([p, v]) => v === true && (path === p || path.startsWith(p + '/')));
    if (!allowedByPrefix) {
      if (isApiRequest) return jsonError(403, 'Forbidden');
      throw redirect(302, '/login');
    }
  }

  return resolve(event);
}
