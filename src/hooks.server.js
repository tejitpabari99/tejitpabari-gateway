import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { readSettings } from '$lib/settings.js';
import { getLink, recordClick } from '$lib/links.js';

const PUBLIC_PATHS = ['/login'];
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3001';

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
  const role = verifySession(sessionCookie);
  event.locals.role = role;

  const path = event.url.pathname;

  // Dashboard proxy — admin only
  if (path.startsWith('/dashboard')) {
    if (role !== 'admin') throw redirect(302, '/login');

    const target = new URL(path + event.url.search, DASHBOARD_URL);
    const reqHeaders = new Headers(event.request.headers);
    reqHeaders.delete('host');

    try {
      const response = await fetch(target.toString(), {
        method: event.request.method,
        headers: reqHeaders,
        body: ['GET', 'HEAD'].includes(event.request.method) ? undefined : event.request.body,
        .../** @type {any} */({ duplex: 'half' }),
      });
      return response;
    } catch (e) {
      return new Response('Dashboard unavailable', { status: 502 });
    }
  }

  // Public paths
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    return resolve(event);
  }

  // Require login for everything else
  if (!role) throw redirect(302, '/login');

  // Guest visibility check
  if (role === 'guest') {
    const settings = readSettings();
    const allowedByPrefix = Object.entries(settings.guestVisibility || {})
      .some(([p, v]) => v === true && (path === p || path.startsWith(p + '/')));
    if (!allowedByPrefix) throw redirect(302, '/login');
  }

  return resolve(event);
}
