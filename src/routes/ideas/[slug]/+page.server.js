import { error, redirect } from '@sveltejs/kit';
import { getIdea, saveIdeaMeta, saveIdeaContent, deleteIdea } from '$lib/ideas.js';
import { readCriteria } from '$lib/settings.js';

export function load({ params, locals }) {
  const idea = getIdea(params.slug);
  if (!idea) throw error(404, 'Idea not found');
  return { idea, criteria: readCriteria(), role: locals.role };
}

export const actions = {
  updateStatus: async ({ request, params, locals }) => {
    if (locals.role !== 'admin') return { ok: false };
    const data = await request.formData();
    const status = data.get('status');
    if (status) saveIdeaMeta(params.slug, { status });
    return { ok: true };
  },
  updateTags: async ({ request, params, locals }) => {
    if (locals.role !== 'admin') return { ok: false };
    const data = await request.formData();
    const tagsRaw = data.get('tags') || '';
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    saveIdeaMeta(params.slug, { tags });
    return { ok: true };
  },
  updateTitle: async ({ request, params, locals }) => {
    if (locals.role !== 'admin') return { ok: false };
    const data = await request.formData();
    const title = data.get('title')?.trim();
    if (title) saveIdeaMeta(params.slug, { title });
    return { ok: true };
  },
  updateLink: async ({ request, params, locals }) => {
    if (locals.role !== 'admin') return { ok: false };
    const data = await request.formData();
    const link = data.get('link')?.trim() || '';
    saveIdeaMeta(params.slug, { link });
    return { ok: true };
  },
  updateGithub: async ({ request, params, locals }) => {
    if (locals.role !== 'admin') return { ok: false };
    const data = await request.formData();
    const github = data.get('github')?.trim() || '';
    saveIdeaMeta(params.slug, { github });
    return { ok: true };
  },
  delete: async ({ params, locals }) => {
    if (locals.role !== 'admin') return { ok: false };
    deleteIdea(params.slug);
    throw redirect(302, '/ideas');
  },
  saveRanking: async ({ params, locals, request }) => {
    if (locals.role !== 'admin') throw error(403, 'Forbidden');
    const fd = await request.formData();
    const scoresRaw = fd.get('scores');
    let scores;
    try {
      scores = JSON.parse(scoresRaw);
    } catch {
      throw error(400, 'Invalid scores');
    }
    // Validate score values 0-5
    for (const [, val] of Object.entries(scores)) {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 0 || n > 5) throw error(400, 'Score out of range');
    }
    saveIdeaMeta(params.slug, { scores, ranked: true });
    return { success: true };
  },
  resetRanking: async ({ params, locals }) => {
    if (locals.role !== 'admin') throw error(403, 'Forbidden');
    saveIdeaMeta(params.slug, { scores: {}, ranked: false });
    // Strip ranking analysis section from content
    const idea = getIdea(params.slug);
    if (idea) {
      const stripped = idea.content.replace(/\n*## Ranking Analysis \(Auto-rank\)[\s\S]*$/, '').trimEnd();
      if (stripped !== idea.content.trimEnd()) {
        saveIdeaContent(params.slug, stripped, {
          title: idea.title, status: idea.status, tags: idea.tags,
          link: idea.link, github: idea.github, brief: idea.brief || '',
          scores: {}, ranked: false
        });
      }
    }
    return { success: true };
  }
};
