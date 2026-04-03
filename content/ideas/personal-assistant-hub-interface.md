---
date: 2026-03-26
title: Personal Assistant Hub Interface
status: rejected
tags:
  - Personal
  - AI
link: ''
brief: >-
  Natural-language assistant bar on cc.tejitpabari.com. User types a query,
  Claude uses tools to read/write ideas and links, returns terse formatted
  results. Shelved due to unreliable search/retrieval.
---
## What Was Built

A natural-language assistant bar on the cc.tejitpabari.com home page. Clicking it opens an overlay panel (desktop: centered modal, mobile: bottom sheet). The user types a query, a SvelteKit API route calls Claude with a tool-use loop, Claude invokes tools to read/write ideas and links, then returns a formatted result with clickable links and copy buttons.

## Implementation

- **`src/lib/assistant.js`** — 9 tools: `search_ideas`, `get_idea`, `create_idea`, `update_idea`, `delete_idea`, `search_links`, `get_link`, `create_link`, `update_link`, `delete_link`
- **`src/routes/api/assistant/+server.js`** — Admin-only POST endpoint, tool-use loop (max 10 iterations), system prompt enforcing terse output
- **`src/lib/components/AssistantBar.svelte`** — Svelte 5 UI, markdown link parsing, per-link copy buttons
- **`src/routes/+page.svelte`** — AssistantBar added to home page
- Also patched `ideas.js` (Date object bug) and `links.js` (added description field)

## Why Rejected

Search was unreliable. "Get location from videos" returned nothing despite Clip Verse being the exact match. Tried keyword matching (too brittle), word-level AND/OR matching (too strict or too broad), and delegating filtering to Claude semantically (inconsistent). Needs proper embedding-based semantic search to work well — out of scope for now.

## Archive

Full summary, implementation plan, and design spec in `archive/ideas/personal-assistant-hub-*`.
