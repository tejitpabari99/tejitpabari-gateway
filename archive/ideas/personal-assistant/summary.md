# Personal Assistant Hub Interface — Archive

**Status:** Rejected / Shelved (2026-03-27)

---

## What Was Built

A natural-language assistant bar embedded on the cc.tejitpabari.com home page. The user types a query, it hits a SvelteKit API route that calls Claude (Haiku) with a tool-use loop, and Claude invokes tools to read/write ideas and links, then returns a formatted result.

### Files Created

- **`src/lib/assistant.js`** — Tool definitions (`TOOLS` array) and `runTool()` executor. 9 tools: `search_ideas`, `get_idea`, `create_idea`, `update_idea`, `delete_idea`, `search_links`, `get_link`, `create_link`, `update_link`, `delete_link`.
- **`src/routes/api/assistant/+server.js`** — POST endpoint. Admin-only auth, tool-use loop (max 10 iterations), system prompt enforcing terse output.
- **`src/lib/components/AssistantBar.svelte`** — Svelte 5 UI component. At-rest search bar → click to open overlay panel. Desktop: centered modal. Mobile: bottom sheet. Markdown link parsing (`[text](url)`), per-link copy buttons, bare URL auto-detection.
- **`src/routes/+page.svelte`** — Added `<AssistantBar />` to home page.

### Changes to Existing Files

- **`src/lib/ideas.js`** — Fixed date handling: gray-matter parses unquoted YAML dates as JS `Date` objects, which was breaking date formatting. Added `instanceof Date` check using `.toISOString()`.
- **`src/lib/links.js`** — Added `description` field to `saveLink()` so links can have human-readable labels for semantic search.

---

## What Was Tried / Iteration History

### Search Approach (multiple iterations)

1. **Exact substring match** — `haystack.includes(query)`. Too brittle, broke on multi-word queries.
2. **Word-level OR match** (min 3 chars) — split query, match any word. Too broad; "from", "other", "add" pulled in unrelated results.
3. **Word-level AND match** (min 4 chars + stopword list) — all significant words must match. Too strict; "get location from videos" returned no results because "location" and "videos" weren't both in the idea.
4. **Semantic delegation to Claude** — removed all server-side filtering, pass all ideas to Claude and let it pick. Still returned no results; system prompt said "Be strict" which made Claude over-filter. Softened to "include when in doubt" but results were still unreliable.

### System Prompt Tuning

Multiple iterations on the system prompt to get Claude to stop adding preamble ("Here is...", "I found...") and return only the requested data. Eventually worked with numbered absolute rules. Semantic filtering via prompt remained unreliable.

### Other Bugs Fixed Along the Way

- `slugify()` producing triple hyphens from titles like "farting - it makes fart sound" → added `.replace(/-+/g, '-')`
- `create_idea` not returning a URL → Claude was constructing wrong URLs without `/ideas/` prefix
- `update_idea` / `delete_idea` / `delete_link` throwing unhandled exceptions on missing slugs → wrapped in try/catch
- `create_link` not catching duplicate slug errors → added try/catch
- Entire Anthropic call loop unguarded → wrapped in try/catch returning 502

---

## Why It Was Rejected

Core search/retrieval was too unreliable. Simple natural-language queries like "get location from videos" or "meeting link" consistently returned no results despite the relevant data existing. The fundamental tension:

- Keyword matching: fast but misses semantic equivalences (Clip Verse vs "extracting location from videos")
- LLM-as-filter: semantic but inconsistent; Claude's judgment on what "counts" as a match varied and the overhead of passing all ideas every request is expensive

Would need a proper embedding-based semantic search (e.g., pgvector, Chroma, or a simple cosine similarity over pre-computed embeddings) to work reliably. Out of scope for a quick tool on this platform.

---

## Files to Reference

- [Implementation Plan](./personal-assistant-hub-plan.md)
- [Design Spec](./personal-assistant-hub-design.md)
