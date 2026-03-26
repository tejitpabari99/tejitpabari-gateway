import Anthropic from '@anthropic-ai/sdk';
import { getIdea } from '$lib/ideas.js';
import { readCriteria } from '$lib/settings.js';
import { json } from '@sveltejs/kit';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST({ params, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const idea = getIdea(params.slug);
  if (!idea) return json({ error: 'Not found' }, { status: 404 });

  const criteria = readCriteria();
  // Skip "interest" — personal criterion, not suitable for auto-scoring
  const rankable = criteria.filter(c => c.id !== 'interest');

  const criteriaList = rankable.map(c => `- ${c.label}${c.invert ? ' (lower is better — score the raw difficulty, not inverted)' : ''}: id="${c.id}"`).join('\n');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are scoring a software/product project idea across evaluation criteria. Score each criterion from 1 (worst) to 5 (best). Use the full range — don't default to middle scores.

Criteria to score:
${criteriaList}

Idea title: ${idea.title}
${idea.brief ? `Brief: ${idea.brief}` : ''}

Idea content:
${idea.content}

Return ONLY a JSON object with this exact shape (no markdown, no explanation outside the JSON):
{
  "scores": {${rankable.map(c => `"${c.id}": <1-5>`).join(', ')}},
  "analysis": "2-3 sentences explaining your reasoning for the key scores"
}`
    }]
  });

  const raw = message.content[0].text.trim();
  let parsed;
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return json({ error: 'Failed to parse Claude response', raw }, { status: 500 });
  }

  const scores = parsed.scores || {};
  // Validate and clamp scores
  for (const [key, val] of Object.entries(scores)) {
    const n = parseInt(val, 10);
    scores[key] = isNaN(n) ? 3 : Math.max(1, Math.min(5, n));
  }

  return json({ scores, analysis: parsed.analysis || '' });
}
