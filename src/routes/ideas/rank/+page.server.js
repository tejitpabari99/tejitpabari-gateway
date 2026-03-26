import { listIdeas, getIdea } from '$lib/ideas.js';
import { readCriteria } from '$lib/settings.js';
import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
  if (locals.role !== 'admin') redirect(302, '/login');
  const unranked = listIdeas().filter(i => !i.ranked && i.status === 'new');
  unranked.sort((a, b) => a.title.localeCompare(b.title));
  const ideas = unranked.map(i => ({ ...i, html: getIdea(i.slug)?.html || '' }));
  return { ideas, criteria: readCriteria() };
}
