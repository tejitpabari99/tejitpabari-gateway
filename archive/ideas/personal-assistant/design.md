# Personal Assistant Hub Interface — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** V1 — Ideas + Links integration

---

## Overview

A command bar on the cc.tejitpabari.com home page that lets the user query and manage their gateway services through natural language. Designed for speed: one shot for most tasks, multi-turn when needed. No fluff — responses return only what was asked for.

---

## Interaction Model

**At rest:** A slim input bar sits at the top of the home page, above the grid tiles.

**On focus/click:** Expands into an overlay panel:
- Conversation thread at the top (results grow upward)
- Input locked to the bottom
- On desktop: centered overlay, ~600px wide, dimmed backdrop
- On mobile: full-width bottom sheet, keyboard-aware

**Closing:** `Escape`, tap outside, or `×` button. Clears the session (in-memory only — no persistence).

**Copy:** Each result (link, list, text) has a copy button for quick clipboard access.

**Voice:** Not in V1. Input area is designed to accommodate a mic button in a future pass.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/lib/assistant.js` | Tool definitions + `runTool(name, args)` executor |
| `src/routes/api/assistant/+server.js` | POST endpoint — calls Claude, executes tools, returns reply |
| `src/lib/components/AssistantBar.svelte` | UI component — bar, overlay panel, conversation thread |

### Existing files modified

| File | Change |
|------|--------|
| `src/routes/+page.svelte` | Import and render `<AssistantBar />` above the grid |

### No changes to

- `src/lib/ideas.js` — used as-is
- `src/lib/links.js` — used as-is

---

## API Endpoint

**`POST /api/assistant`**

Request:
```json
{ "messages": [ { "role": "user", "content": "..." }, ... ] }
```

Response:
```json
{ "reply": "..." }
```

- Auth: inherited from existing gateway session (no extra auth needed)
- Model: `claude-haiku-4-5-20251001` (fast, low cost)
- No streaming in V1

**System prompt:**
> You are a personal assistant for cc.tejitpabari.com. Return only the requested data — no preamble, no explanation, no confirmation phrases. If asked for a link, return the link. If asked for a list, return the list. Never say "Here is..." or "I found..." or "Sure!". Just the result.

---

## Tools (V1)

All tools are implemented in `src/lib/assistant.js` and call directly into the existing libs.

### Ideas tools

| Tool | Args | Calls |
|------|------|-------|
| `search_ideas` | `query?: string, tag?: string, status?: string` | `listIdeas()` + filter |
| `get_idea` | `slug: string` | `getIdea(slug)` |
| `create_idea` | `title: string, brief?: string, tags?: string[]` | `saveIdeaContent()` — slug derived from title (kebab-case) |
| `update_idea` | `slug: string, title?: string, status?: string, tags?: string[], brief?: string` | `saveIdeaMeta()` |
| `delete_idea` | `slug: string` | `deleteIdea(slug)` |

### Links tools

| Tool | Args | Calls |
|------|------|-------|
| `search_links` | `query?: string, tag?: string` | `listLinks()` + filter on slug, url, and tags |
| `get_link` | `slug: string` | `getLink(slug)` |
| `create_link` | `slug: string, url: string, tags?: string[]` | `saveLink()` |
| `delete_link` | `slug: string` | `deleteLink(slug)` |

---

## UI Component — AssistantBar.svelte

**State:**
- `messages[]` — conversation history (role + content), in-memory only
- `open: boolean` — whether the overlay is visible
- `loading: boolean` — waiting for API response
- `input: string` — current text in the input field

**Behavior:**
- Click bar → set `open = true`, focus input
- Submit → append user message, POST to `/api/assistant`, append reply
- Escape / click backdrop → set `open = false`
- Clear (×) → reset `messages[]`, keep `open = true`

**Mobile:**
- Bottom sheet anchored to bottom of viewport
- `env(safe-area-inset-bottom)` padding for notch devices
- Full width, no backdrop dim (full screen feel)

---

## Planned V2 Integrations

- **TickTick:** Add `ticktick.js` lib wrapping TickTick REST API (OAuth token from existing credentials). Expose `create_task`, `list_tasks`, `search_tasks` as tools. Same pattern as ideas/links.
- **Voice input:** Mic button in the input area using Web Speech API or a dedicated speech-to-text service.
- **Notes:** If a notes lib is added to the gateway, expose via the same tool pattern.

---

## Out of Scope (V1)

- Persistent conversation history across sessions
- Streaming responses
- TickTick integration
- Voice input
- Markdown rendering in results (plain text only)
