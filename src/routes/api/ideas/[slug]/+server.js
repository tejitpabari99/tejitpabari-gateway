import { getIdea, saveIdeaMeta, saveIdeaContent } from '$lib/ideas.js';
import { marked } from 'marked';
import { json } from '@sveltejs/kit';
import {
  anthropicConfigError,
  createAnthropicClient,
  DEFAULT_ANTHROPIC_MODEL,
  formatAnthropicError
} from '$lib/anthropic.js';

export async function PATCH({ request, params, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();

  // Handle rank reset
  if (body.resetRank) {
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
    return json({ ok: true });
  }

  // Handle scores update
  if (body.scores !== undefined) {
    for (const val of Object.values(body.scores)) {
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 0 || n > 5) return json({ error: 'Invalid score value' }, { status: 400 });
    }
    saveIdeaMeta(params.slug, { scores: body.scores, ranked: true });

    // Append analysis to markdown if provided
    if (body.analysisText) {
      const idea = getIdea(params.slug);
      if (idea) {
        // Strip existing analysis section first, then append fresh
        const stripped = idea.content.replace(/\n*## Ranking Analysis \(Auto-rank\)[\s\S]*$/, '').trimEnd();
        const newContent = stripped + '\n\n## Ranking Analysis (Auto-rank)\n\n' + body.analysisText.trim();
        saveIdeaContent(params.slug, newContent, {
          title: idea.title, status: idea.status, tags: idea.tags,
          link: idea.link, github: idea.github, brief: idea.brief || '',
          scores: body.scores, ranked: true
        });
      }
    }
  }

  const { status, tags } = body;
  const update = {};
  if (status !== undefined) update.status = status;
  if (tags !== undefined) update.tags = tags;
  if (Object.keys(update).length > 0) saveIdeaMeta(params.slug, update);

  return json({ ok: true });
}

export async function POST({ request, params }) {
  const body = await request.json();

  // Confirm and save enhanced content
  if (body.confirmed) {
    const idea = getIdea(params.slug);
    if (!idea) return json({ error: 'Not found' }, { status: 404 });
    saveIdeaContent(params.slug, body.content, {
      title: idea.title,
      status: idea.status,
      tags: idea.tags,
      link: idea.link,
      brief: idea.brief || ''
    });
    return json({ ok: true });
  }

  // Enhance: merge existing + new notes
  const { newNotes } = body;
  if (!newNotes?.trim()) return json({ error: 'No notes provided' }, { status: 400 });

  const idea = getIdea(params.slug);
  if (!idea) return json({ error: 'Not found' }, { status: 404 });

  const configError = anthropicConfigError();
  if (configError) return json({ error: configError }, { status: 500 });

  let message;
  try {
    const client = createAnthropicClient();
    message = await client.messages.create({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are helping expand a project idea. Below is the existing description and new notes added by the author.

Merge them into a single cohesive markdown document. Polish the English. Do NOT invent new content — only incorporate what is already written. Keep the existing structure where possible.

Return ONLY the merged markdown content (no JSON, no explanation, no code fences).

Existing content:
${idea.content}

New notes:
${newNotes}`
      }]
    });
  } catch (error) {
    return json({ error: formatAnthropicError(error) }, { status: 502 });
  }

  const content = message.content[0].text.trim();
  const html = await marked(content);
  return json({ content, html });
}
