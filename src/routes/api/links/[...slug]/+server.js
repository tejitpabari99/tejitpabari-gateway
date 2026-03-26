import { json } from '@sveltejs/kit';
import { saveLink, deleteLink } from '$lib/links.js';

export async function PATCH({ request, params, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const existingSlug = params.slug;
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
    saveLink({ slug, url, tags: tags || [], expiresAt: expiresAt || null, redirectType: redirectType || '302', existingSlug });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, { status: e.message === 'Link not found' ? 404 : 409 });
  }
}

export function DELETE({ params, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  try {
    deleteLink(params.slug);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, { status: 404 });
  }
}
