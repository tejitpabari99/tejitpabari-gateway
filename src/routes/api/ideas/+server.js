import Anthropic from '@anthropic-ai/sdk';
import { saveIdeaContent } from '$lib/ideas.js';
import { json } from '@sveltejs/kit';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

export async function POST({ request, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();

  // Step 2: confirm and save
  if (body.confirmed) {
    const { slug, title, content, tags } = body;
    if (!slug || !title || !content) return json({ error: 'Missing fields' }, { status: 400 });
    const today = new Date().toISOString().split('T')[0];
    saveIdeaContent(slug, content, { title, status: 'new', tags: tags || [], link: '', brief: body.brief || '', date: today });
    return json({ slug });
  }

  // Step 1: parse raw text with Claude
  const { rawText } = body;
  if (!rawText?.trim()) return json({ error: 'No text provided' }, { status: 400 });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are helping organize project ideas. Given the following raw notes, do these things:
1. Write a short, clear title (5 words max)
2. Polish the English — fix grammar, clarity, flow. Do NOT add new ideas or content that wasn't already there.
3. Structure it with markdown headings where logical (## Overview, ## Features, ## Notes, etc.)
4. Suggest 1-3 tags from this list: AI, productivity, social, B2B, mobile, web, extension, health, finance, food, travel, education, tools
5. Write a brief: 1-2 plain English sentences summarizing the idea concisely enough to recognize on a card.

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{"title": "...", "content": "...", "tags": ["..."], "brief": "..."}

Raw notes:
${rawText}`
    }]
  });

  const raw = message.content[0].text.trim();
  let parsed;
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return json({ error: 'Failed to parse Claude response', raw }, { status: 500 });
  }

  const slug = slugify(parsed.title);
  return json({ title: parsed.title, slug, content: parsed.content, tags: parsed.tags || [], brief: parsed.brief || '' });
}
