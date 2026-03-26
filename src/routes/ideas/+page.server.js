import { listIdeas } from '$lib/ideas.js';
import { readCriteria } from '$lib/settings.js';

export function load() {
  const ideas = listIdeas();
  const criteria = readCriteria();
  return { ideas, criteria };
}
