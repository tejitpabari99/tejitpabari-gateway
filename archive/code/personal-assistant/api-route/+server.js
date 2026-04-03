// src/routes/api/assistant/+server.js
import Anthropic from '@anthropic-ai/sdk';
import { json } from '@sveltejs/kit';
import { TOOLS, runTool } from '$lib/assistant.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a personal assistant for cc.tejitpabari.com. Output rules — follow these absolutely:

1. Return ONLY the data. No sentences before or after results. No exceptions.
2. NEVER output "Here is", "I found", "Sure!", "Here's", or any preamble. Your first character is the result.
3. When searching ideas: the tool returns ALL ideas. YOU decide which ones are semantically relevant to the query. Include any idea whose purpose, title, brief, or tags plausibly relate to what was asked — even if the wording differs. Only exclude ideas that are clearly unrelated. When in doubt, include it.
4. When listing ideas: format each on its own line as: [Title](url) — brief description. Use the url field from the tool result exactly as given. If brief is empty, omit the " — " separator and just show [Title](url).
5. When listing links: format each as [slug](url) — description. If description is empty, omit the " — " and just show [slug](url).
6. When showing a single idea or link with a date field: format dates as "Month D, YYYY" (e.g. "March 26, 2026").
7. Single item: return just that item, nothing else.
8. Nothing found: output exactly "No results found." and nothing else.
9. NEVER ask for clarification. Always attempt the operation with whatever was given.`;

export async function POST({ request, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array is required' }, { status: 400 });
  }

  let msgs = [...messages];

  try {
    // Tool-use loop: keep calling Claude until it returns end_turn
    for (let i = 0; i < 10; i++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM,
        tools: TOOLS,
        messages: msgs
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

        // Append assistant turn (includes tool_use blocks)
        msgs.push({ role: 'assistant', content: response.content });

        // Execute each tool and collect results
        const toolResults = toolUseBlocks.map(block => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(runTool(block.name, block.input))
        }));

        // Append tool results as user turn
        msgs.push({ role: 'user', content: toolResults });
      } else {
        // end_turn or any other stop reason — return text
        const text = response.content.find(b => b.type === 'text')?.text ?? '';
        return json({ reply: text });
      }
    }

    return json({ error: 'Too many tool calls' }, { status: 503 });
  } catch (e) {
    return json({ error: e.message ?? 'Assistant error' }, { status: 502 });
  }
}
