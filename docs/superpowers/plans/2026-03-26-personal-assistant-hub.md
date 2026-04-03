# Personal Assistant Hub Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a command bar to the cc.tejitpabari.com home page that lets the user query and manage ideas and links through natural language via Claude.

**Architecture:** A `POST /api/assistant` endpoint receives conversation history, calls Claude Haiku with tool definitions, executes any tool calls against the existing `ideas.js`/`links.js` libs in a loop, and returns the final reply. A `AssistantBar.svelte` component renders a slim bar at rest that expands into an overlay panel on focus, with the conversation thread above and input locked to the bottom.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), `@anthropic-ai/sdk` (already installed), existing `ideas.js` / `links.js` libs, no new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/assistant.js` | Create | Tool definitions array + `runTool(name, args)` executor |
| `src/routes/api/assistant/+server.js` | Create | POST endpoint — Claude call, tool-use loop, return reply |
| `src/lib/components/AssistantBar.svelte` | Create | Bar + overlay UI, conversation state, submit logic |
| `src/routes/+page.svelte` | Modify | Add `<AssistantBar />` above the grid |

---

## Task 1: Tool Definitions and Executor

**Files:**
- Create: `src/lib/assistant.js`

- [ ] **Step 1: Create `src/lib/assistant.js` with the slugify helper and all tool definitions**

```js
// src/lib/assistant.js
import {
  listIdeas, getIdea, saveIdeaContent, saveIdeaMeta, deleteIdea
} from '$lib/ideas.js';
import {
  listLinks, getLink, saveLink, deleteLink
} from '$lib/links.js';

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

export const TOOLS = [
  {
    name: 'search_ideas',
    description: 'Search ideas by keyword, tag, or status. Returns matching idea titles, slugs, and briefs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match against title, brief, or tags' },
        tag: { type: 'string', description: 'Filter by tag name (case-insensitive)' },
        status: { type: 'string', description: 'Filter by status: new, in-progress, done' }
      },
      required: []
    }
  },
  {
    name: 'get_idea',
    description: 'Get full detail for a single idea by its slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The idea slug (e.g. "restaurant-gpt")' }
      },
      required: ['slug']
    }
  },
  {
    name: 'create_idea',
    description: 'Create a new idea. Slug is derived automatically from the title.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Idea title' },
        brief: { type: 'string', description: 'One or two sentence summary' },
        tags: { type: 'array', items: { type: 'string' }, description: 'List of tags' }
      },
      required: ['title']
    }
  },
  {
    name: 'update_idea',
    description: 'Update metadata on an existing idea (title, status, tags, or brief).',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The idea slug' },
        title: { type: 'string' },
        status: { type: 'string', description: 'new, in-progress, or done' },
        tags: { type: 'array', items: { type: 'string' } },
        brief: { type: 'string' }
      },
      required: ['slug']
    }
  },
  {
    name: 'delete_idea',
    description: 'Permanently delete an idea by slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The idea slug' }
      },
      required: ['slug']
    }
  },
  {
    name: 'search_links',
    description: 'Search short links by keyword or tag. Matches against slug, URL, and tags.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match against slug, url, or tags' },
        tag: { type: 'string', description: 'Filter by tag name (case-insensitive)' }
      },
      required: []
    }
  },
  {
    name: 'get_link',
    description: 'Get a single short link by its slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The link slug' }
      },
      required: ['slug']
    }
  },
  {
    name: 'create_link',
    description: 'Create a new short link.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Short slug (lowercase, a-z, 0-9, hyphens)' },
        url: { type: 'string', description: 'Full destination URL (must start with http:// or https://)' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['slug', 'url']
    }
  },
  {
    name: 'delete_link',
    description: 'Permanently delete a short link by slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The link slug' }
      },
      required: ['slug']
    }
  }
];

export function runTool(name, args) {
  switch (name) {
    case 'search_ideas': {
      let results = listIdeas();
      if (args.query) {
        const q = args.query.toLowerCase();
        results = results.filter(i =>
          i.title.toLowerCase().includes(q) ||
          i.brief.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      if (args.tag) {
        const t = args.tag.toLowerCase();
        results = results.filter(i => i.tags.some(tag => tag.toLowerCase().includes(t)));
      }
      if (args.status) {
        results = results.filter(i => i.status === args.status);
      }
      return results.map(i => ({ slug: i.slug, title: i.title, status: i.status, tags: i.tags, brief: i.brief }));
    }

    case 'get_idea': {
      const idea = getIdea(args.slug);
      if (!idea) return { error: 'Idea not found' };
      return { slug: idea.slug, title: idea.title, status: idea.status, tags: idea.tags, brief: idea.brief, content: idea.content };
    }

    case 'create_idea': {
      const slug = slugify(args.title);
      const today = new Date().toISOString().split('T')[0];
      saveIdeaContent(slug, '', {
        title: args.title,
        status: 'new',
        tags: args.tags || [],
        link: '',
        brief: args.brief || '',
        date: today
      });
      return { slug, title: args.title };
    }

    case 'update_idea': {
      saveIdeaMeta(args.slug, {
        title: args.title,
        status: args.status,
        tags: args.tags,
        brief: args.brief
      });
      return { ok: true };
    }

    case 'delete_idea': {
      deleteIdea(args.slug);
      return { ok: true };
    }

    case 'search_links': {
      let results = listLinks();
      if (args.query) {
        const q = args.query.toLowerCase();
        results = results.filter(l =>
          l.slug.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          (l.tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
      if (args.tag) {
        const t = args.tag.toLowerCase();
        results = results.filter(l => (l.tags || []).some(tag => tag.toLowerCase().includes(t)));
      }
      return results.map(l => ({ slug: l.slug, url: l.url, tags: l.tags || [] }));
    }

    case 'get_link': {
      const link = getLink(args.slug);
      if (!link) return { error: 'Link not found' };
      return { slug: link.slug, url: link.url, tags: link.tags || [] };
    }

    case 'create_link': {
      const savedSlug = saveLink({ slug: args.slug, url: args.url, tags: args.tags || [] });
      return { slug: savedSlug, url: args.url };
    }

    case 'delete_link': {
      deleteLink(args.slug);
      return { ok: true };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/assistant.js
git commit -m "feat: add assistant tool definitions and executor"
```

---

## Task 2: API Endpoint

**Files:**
- Create: `src/routes/api/assistant/+server.js`

- [ ] **Step 1: Create the endpoint directory and file**

```bash
mkdir -p src/routes/api/assistant
```

- [ ] **Step 2: Write `src/routes/api/assistant/+server.js`**

```js
// src/routes/api/assistant/+server.js
import Anthropic from '@anthropic-ai/sdk';
import { json } from '@sveltejs/kit';
import { TOOLS, runTool } from '$lib/assistant.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a personal assistant for cc.tejitpabari.com. Return only the requested data — no preamble, no explanation, no confirmation phrases. If asked for a link, return the link. If asked for a list, return the list. Never say "Here is..." or "I found..." or "Sure!". Just the result.`;

export async function POST({ request, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array is required' }, { status: 400 });
  }

  let msgs = [...messages];

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
      continue;
    }

    // end_turn or any other stop reason — return text
    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    return json({ reply: text });
  }

  return json({ error: 'Too many tool calls' }, { status: 500 });
}
```

- [ ] **Step 3: Verify the endpoint builds without errors**

```bash
npm run build
```

Expected: build succeeds with no errors. If `$lib/assistant.js` import fails, check that the file was saved to `src/lib/assistant.js` (not `src/lib/components/`).

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/assistant/+server.js
git commit -m "feat: add POST /api/assistant endpoint with tool-use loop"
```

---

## Task 3: AssistantBar Component

**Files:**
- Create: `src/lib/components/AssistantBar.svelte`

Note: The project uses Svelte 5 runes (`$state`, `$props`). Check existing components for patterns — `src/routes/+layout.svelte` uses `$state` and `$props`.

- [ ] **Step 1: Create the components directory if it doesn't exist**

```bash
mkdir -p src/lib/components
```

- [ ] **Step 2: Write `src/lib/components/AssistantBar.svelte`**

```svelte
<script>
  import { tick } from 'svelte';

  let open = $state(false);
  let input = $state('');
  let messages = $state([]); // { role: 'user'|'assistant', content: string }
  let loading = $state(false);
  let threadEl = $state(null);
  let inputEl = $state(null);
  let copiedIdx = $state(null);

  async function openBar() {
    open = true;
    await tick();
    inputEl?.focus();
  }

  function close() {
    open = false;
  }

  function clearSession() {
    messages = [];
    input = '';
  }

  async function submit() {
    const text = input.trim();
    if (!text || loading) return;

    messages = [...messages, { role: 'user', content: text }];
    input = '';
    loading = true;

    await tick();
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const data = await res.json();
      messages = [...messages, { role: 'assistant', content: data.reply ?? data.error ?? 'No response.' }];
    } catch {
      messages = [...messages, { role: 'assistant', content: 'Request failed.' }];
    } finally {
      loading = false;
      await tick();
      if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape' && open) close();
  }

  async function copy(text, idx) {
    await navigator.clipboard.writeText(text);
    copiedIdx = idx;
    setTimeout(() => { copiedIdx = null; }, 1500);
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- At-rest bar -->
{#if !open}
  <button class="bar-rest" onclick={openBar} aria-label="Open assistant">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
    <span>Ask anything…</span>
  </button>
{/if}

<!-- Overlay -->
{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}></div>

  <div class="panel" role="dialog" aria-label="Assistant">
    <!-- Thread -->
    {#if messages.length > 0}
      <div class="thread" bind:this={threadEl}>
        {#each messages as msg, i}
          <div class="msg {msg.role}">
            <span class="msg-text">{msg.content}</span>
            {#if msg.role === 'assistant'}
              <button
                class="copy-btn"
                onclick={() => copy(msg.content, i)}
                aria-label="Copy"
              >
                {copiedIdx === i ? '✓' : 'copy'}
              </button>
            {/if}
          </div>
        {/each}
        {#if loading}
          <div class="msg assistant loading">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Input row -->
    <div class="input-row">
      <textarea
        bind:this={inputEl}
        bind:value={input}
        onkeydown={handleKeydown}
        placeholder="Ask anything…"
        rows="1"
        disabled={loading}
      ></textarea>
      <div class="input-actions">
        {#if messages.length > 0}
          <button class="action-btn" onclick={clearSession} title="Clear session" aria-label="Clear">×</button>
        {/if}
        <button class="action-btn send-btn" onclick={submit} disabled={loading || !input.trim()} aria-label="Send">↵</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* At-rest bar */
  .bar-rest {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    color: var(--muted);
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
    margin-bottom: 2rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .bar-rest:hover {
    border-color: var(--card-hover-border);
    background: var(--card-hover-bg);
  }
  .bar-rest svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  /* Backdrop */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
  }

  /* Panel — desktop centered overlay */
  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(600px, calc(100vw - 2rem));
    max-height: min(500px, calc(100vh - 4rem));
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    z-index: 101;
    overflow: hidden;
  }

  /* Mobile: bottom sheet */
  @media (max-width: 600px) {
    .panel {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      transform: none;
      width: 100%;
      max-height: 70vh;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
  }

  /* Thread */
  .thread {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .msg {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.83rem;
    line-height: 1.5;
  }

  .msg.user {
    color: var(--muted);
    flex-direction: row;
  }
  .msg.user .msg-text::before {
    content: '> ';
    opacity: 0.5;
  }

  .msg.assistant {
    color: var(--fg);
    flex-direction: row;
    align-items: flex-start;
  }

  .msg-text {
    white-space: pre-wrap;
    word-break: break-word;
    flex: 1;
  }

  .copy-btn {
    flex-shrink: 0;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    background: var(--icon-bg);
    border: 1px solid var(--card-border);
    color: var(--muted);
    cursor: pointer;
    margin-top: 0.1rem;
  }
  .copy-btn:hover { color: var(--fg); }

  /* Loading dots */
  .msg.loading {
    gap: 0.3rem;
    padding: 0.2rem 0;
  }
  .dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--muted);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  /* Input row */
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.75rem;
    border-top: 1px solid var(--card-border);
    flex-shrink: 0;
  }

  textarea {
    flex: 1;
    resize: none;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font-size: 0.85rem;
    font-family: inherit;
    line-height: 1.5;
    padding: 0.25rem 0;
    max-height: 120px;
    overflow-y: auto;
  }
  textarea::placeholder { color: var(--muted); }

  .input-actions {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--icon-bg);
    border: 1px solid var(--card-border);
    color: var(--muted);
    font-size: 0.85rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s, background 0.1s;
  }
  .action-btn:hover:not(:disabled) { color: var(--fg); }
  .action-btn:disabled { opacity: 0.3; cursor: default; }

  .send-btn {
    background: var(--card-hover-bg);
  }
</style>
```

- [ ] **Step 3: Build to verify no Svelte compilation errors**

```bash
npm run build
```

Expected: build succeeds. Common error to watch for: `$state` / `$props` outside `<script>` — check rune usage.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/AssistantBar.svelte
git commit -m "feat: add AssistantBar component with overlay panel and conversation thread"
```

---

## Task 4: Wire Into Home Page

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add the AssistantBar import and component to `src/routes/+page.svelte`**

Add the import at the top of the `<script>` block:

```js
import AssistantBar from '$lib/components/AssistantBar.svelte';
```

Then add `<AssistantBar />` as the first element inside `<main>`, before `.page-title`:

```svelte
<main>
  <AssistantBar />
  <p class="page-title">Projects</p>
  ...
```

The full updated file:

```svelte
<script>
  import AssistantBar from '$lib/components/AssistantBar.svelte';
  let { data } = $props();
</script>

<svelte:head><title>cc.tejitpabari.com</title></svelte:head>

<main>
  <AssistantBar />
  <p class="page-title">Projects</p>
  <p class="page-sub">Personal tools and dashboards.</p>
  <div class="grid">
    {#if data.role === 'admin'}
    <a class="card" href="/dashboard">
      <div class="card-header">
        <div class="card-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 19h8M4 17l6-6-6-6"/>
          </svg>
        </div>
        <span class="card-name">Claude Code Dashboard</span>
      </div>
      <p class="card-desc">Usage analytics — sessions, token costs, projects, and model breakdowns from your local ~/.claude/ data.</p>
      <span class="card-tag">analytics</span>
    </a>
    {/if}
    <a class="card" href="/ideas">
      <div class="card-header">
        <div class="card-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
        </div>
        <span class="card-name">Ideas</span>
      </div>
      <p class="card-desc">A running list of project ideas — browse, search, and expand.</p>
      <span class="card-tag">ideas</span>
    </a>
    <a class="card" href="/links">
      <div class="card-header">
        <div class="card-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
        </div>
        <span class="card-name">Links</span>
      </div>
      <p class="card-desc">Personal URL shortener — manage short links at go.tejitpabari.com.</p>
      <span class="card-tag">links</span>
    </a>
  </div>
</main>

<style>
  main { max-width: 900px; margin: 0 auto; padding: 3rem 2rem; }
  .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.4rem; color: var(--fg); }
  .page-sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 2.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1.4rem 1.6rem 1.6rem;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .card:hover { border-color: var(--card-hover-border); background: var(--card-hover-bg); }
  .card-header { display: flex; align-items: center; gap: 0.6rem; }
  .card-icon {
    width: 30px; height: 30px;
    background: var(--icon-bg);
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .card-icon svg { width: 15px; height: 15px; stroke: var(--muted); }
  .card-name { font-size: 0.92rem; font-weight: 600; color: var(--fg); }
  .card-desc { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }
  .card-tag {
    display: inline-block;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    background: var(--icon-bg);
    color: var(--muted);
    border: 1px solid var(--card-border);
    margin-top: 0.3rem;
    width: fit-content;
  }
</style>
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Restart and smoke test**

```bash
npm run build && pm2 restart cc-gateway
```

Open cc.tejitpabari.com. Verify:
1. The bar appears above "Projects" heading
2. Clicking it opens the overlay panel
3. Escape closes it
4. Typing "search ideas about food" and submitting returns a list of food-related ideas
5. Typing "get my notion link" returns the URL
6. Copy button copies the text to clipboard

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: wire AssistantBar into home page"
```
