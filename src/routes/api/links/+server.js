import { json } from '@sveltejs/kit';
import { listLinks, saveLink } from '$lib/links.js';

export function GET({ locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });
  return json(listLinks());
}

export async function POST({ request, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { slug, url, tags, expiresAt, redirectType } = body;

  if (!slug || !url) return json({ error: 'slug and url are required' }, { status: 400 });
  if (!/^[a-z0-9\-\_\/]+$/.test(slug)) return json({ error: 'Slug may only contain a-z, 0-9, -, _, /' }, { status: 400 });
  if (slug.startsWith('/') || slug.endsWith('/') || slug.includes('//')) {
    return json({ error: 'Slug cannot start/end with / or contain //' }, { status: 400 });
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return json({ error: 'URL must start with http:// or https://' }, { status: 400 });
  }

  try {
    const savedSlug = saveLink({ slug, url, tags: tags || [], expiresAt: expiresAt || null, redirectType: redirectType || '302' });
    return json({ slug: savedSlug });
  } catch (e) {
    return json({ error: e.message }, { status: 409 });
  }
}
