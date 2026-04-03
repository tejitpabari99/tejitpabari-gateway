import { redirect } from '@sveltejs/kit';
import { listLinks } from '$lib/links.js';

export function load({ locals }) {
  if (!locals.role || (locals.role !== 'admin' && locals.role !== 'guest')) throw redirect(302, '/login');
  return { links: listLinks(), role: locals.role };
}
