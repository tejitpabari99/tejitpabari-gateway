# Idea Ranker — Design Spec
**Date:** 2026-03-25
**Project:** cc-gateway (SvelteKit)
**Scope:** Add a dynamic weighted scoring/ranking system to the existing ideas section.

---

## Overview

Add a ranking feature to the ideas section so the user can score project ideas across configurable criteria and see a ranked list to decide what to work on next. Two entry points for ranking: the individual idea page, and a tinder-style `/ideas/rank` flow for processing unranked ideas in bulk.

---

## Data Model

### Idea frontmatter additions

```yaml
brief: "One-sentence summary for card display"
ranked: false
scores:
  interest: 4
  feasibility: 3
  time_to_build: 2
  learning_value: 5
  impact: 3
  originality: 4
```

- `brief` — short plain-English summary (1–2 sentences), shown on rank cards and jogs memory
- `ranked` — boolean, `true` once scores have been saved at least once. **Existing ideas with no `ranked` key are treated as `ranked: false` (unranked) via falsy check (`data.ranked ?? false`).**
- `scores` — map of criterion id → integer 1–5. Missing keys contribute 0 to the formula.

### Settings (`content/settings.json`) additions

```json
"ranker": {
  "criteria": [
    { "id": "interest",       "label": "Interest",       "weight": 1, "invert": false },
    { "id": "feasibility",    "label": "Feasibility",    "weight": 1, "invert": false },
    { "id": "time_to_build",  "label": "Time to Build",  "weight": 1, "invert": true  },
    { "id": "learning_value", "label": "Learning Value", "weight": 1, "invert": false },
    { "id": "impact",         "label": "Impact",         "weight": 1, "invert": false },
    { "id": "originality",    "label": "Originality",    "weight": 1, "invert": false }
  ]
}
```

Criteria are fully dynamic — user can add/remove/rename/reweight at any time.

**Criterion `id` generation:** When the user adds a new criterion in settings, the id is derived from the label by lowercasing and replacing spaces/special characters with underscores (e.g. "Market Size" → `market_size`). If the derived id would collide with an existing id, append `_2`, `_3`, etc. The id is set at creation time and never changed when the label is renamed — renaming only changes `label`. This ensures existing `scores` keys in idea frontmatter remain valid after a label rename.

**Criteria deletion:** When a criterion is deleted from settings, existing `scores` entries with that id in idea frontmatter are silently ignored in the formula (they are unknown keys and simply not iterated). No cleanup of orphaned score keys is required.

### Score formula

```
raw(c)       = scores[c.id] ?? 0        // 0 if missing; slider range is 1–5
effective(c) = raw > 0
                 ? (c.invert ? (6 − raw) : raw)
                 : 0                    // missing score always contributes 0, regardless of invert
weighted_sum = Σ effective(c) × c.weight
max_possible = Σ 5 × c.weight
final_score  = round((weighted_sum / max_possible) × 100)
```

- Missing scores always contribute 0 regardless of invert flag.
- Slider range is 1–5 for filled criteria; 0 is the sentinel for "not scored."
- **Score value validation (server-side):** Each value in the `scores` map must be an integer 0–5. Values outside this range are rejected with a 400 error.
- **Weight validation (server-side):** Each weight must be a positive integer ≥ 1. Weight 0 or negative is rejected with a 400 error (prevents division-by-zero in `max_possible`).
- **Guard against empty criteria:** If `max_possible === 0` (e.g. all criteria deleted or empty array), `final_score` returns `0` rather than `NaN`.
- **Display when all criteria deleted:** If an idea is `ranked: true` but `max_possible === 0` at render time, show `—` in the rank column (same as unranked) rather than `0`, to avoid misleading output.
- **Score deflation when criteria are added:** When new criteria are added to settings, existing ranked ideas will not have scores for those criteria (contributing 0 to numerator but `5 × weight` to denominator). This intentionally deflates scores, signalling that the idea should be re-ranked. This is the desired behavior — no special handling needed.

---

## AI Changes

### Parse prompt (`POST /api/ideas`)

Add instruction 5 to the Claude prompt:

> 5. Write a brief: 1–2 plain English sentences summarizing the idea concisely enough to recognize on a card.

Updated return shape: `{ "title": "...", "content": "...", "tags": [...], "brief": "..." }`

In the **confirm branch**, `brief` is included in the meta object. Note that `brief` comes from `preview` (the object returned by Claude's parse step and stored client-side), which is spread into the confirm POST body — so it arrives in the server as `body.brief`. Update the confirm branch:

```js
saveIdeaContent(slug, content, { title, status: 'new', tags: tags || [], link: '', brief: body.brief || '' });
```

The existing client-side confirm flow spreads `preview` into the POST body (`{ confirmed: true, ...preview }`), so `brief` will be included automatically once it is added to the parse response.

### Auto-rank endpoint (`POST /api/ideas/[slug]/rank`)

**New file:** `src/routes/api/ideas/[slug]/rank/+server.js`

This is a new nested route inside the existing `[slug]` directory — it does **not** modify the existing `src/routes/api/ideas/[slug]/+server.js`.

Given the idea's content + list of current criteria, Claude returns a score 1–5 per criterion:

```json
{ "interest": 4, "feasibility": 2, "time_to_build": 3, "learning_value": 5, "impact": 3, "originality": 4 }
```

Pre-fills sliders client-side only. Admin-only. Does not write to disk.

---

## `src/lib/ideas.js` changes

### `listIdeas()`
Add to the returned object per idea:
```js
brief: data.brief || '',
ranked: data.ranked ?? false,
scores: typeof data.scores === 'object' && data.scores !== null ? data.scores : {},
```

### `getIdea(slug)`
Add the same three fields to the returned object.

### `saveIdeaMeta(slug, fields)`
Extend the destructured parameter and add explicit guards for new fields:
```js
export function saveIdeaMeta(slug, { status, tags, link, title, github, brief, ranked, scores }) {
  // ...existing guards...
  if (brief   !== undefined) data.brief   = brief;
  if (ranked  !== undefined) data.ranked  = ranked;
  if (scores  !== undefined) data.scores  = scores;
  // ...
}
```

---

## `src/lib/settings.js` changes

Add two functions:

```js
const defaultCriteria = [
  { id: 'interest',       label: 'Interest',       weight: 1, invert: false },
  { id: 'feasibility',    label: 'Feasibility',    weight: 1, invert: false },
  { id: 'time_to_build',  label: 'Time to Build',  weight: 1, invert: true  },
  { id: 'learning_value', label: 'Learning Value', weight: 1, invert: false },
  { id: 'impact',         label: 'Impact',         weight: 1, invert: false },
  { id: 'originality',    label: 'Originality',    weight: 1, invert: false },
];

export function readCriteria() {
  const s = readSettings();
  return s.ranker?.criteria ?? defaultCriteria;
}

export function writeCriteria(criteria) {
  const s = readSettings();
  s.ranker = { ...s.ranker, criteria };
  writeSettings(s);
}
```

---

## Pages & Components

### `/ideas` list page

**Server (`+page.server.js`):** Import `readCriteria` from `$lib/settings.js` in the `load` function:
```js
export function load() {
  return { ideas: listIdeas(), criteria: readCriteria() };
}
```

**UI:** Add a **Rank** column (last column, sortable) to the existing table:
- Ranked ideas: show computed score (e.g. `84`)
- Unranked ideas: show `—` with a small "rank it →" link navigating to `/ideas/rank`
- Sorting by rank column: ranked ideas sort by score descending, unranked sort to the bottom

### `/ideas/[slug]` detail page

**Server (`+page.server.js`):** Import `readCriteria` and return it from `load`:
```js
export function load({ params, locals }) {
  return { idea: getIdea(params.slug), criteria: readCriteria(), role: locals.role };
}
```

Add a named action `saveRanking` (admin-only check: `if (locals.role !== 'admin') error(403)`). Reads `scores` from FormData as a single field named `scores` containing a JSON-serialized object (e.g. `JSON.stringify({ interest: 4, feasibility: 3 })`). Validates each score value is integer 0–5. Calls `saveIdeaMeta(params.slug, { scores, ranked: true })`.

Note: `ranked` is always hardcoded to `true` here — saving scores always marks the idea as ranked. Do not read `ranked` from FormData.

**UI:** Add a **Ranking** section below existing content:
- One row per criterion: label, invert indicator (`↓ lower is better`), slider (1–5), current value
- Live score preview updates as sliders move (computed client-side using the formula)
- **Auto-rank** button — calls `POST /api/ideas/[slug]/rank`, pre-fills sliders (admin-only)
- **Save ranking** button — submits `?/saveRanking`
- Scores are always editable; saving again overwrites previous scores
- Section is visible to all, but save and auto-rank buttons only render for admins

### `/ideas/rank` tinder flow (new page)

**New files:** `src/routes/ideas/rank/+page.svelte` + `src/routes/ideas/rank/+page.server.js`

**Access policy: admin-only.** The `load` function must check `locals.role !== 'admin'` and redirect to `/login` if not admin.

**Server load:**
```js
import { listIdeas, getIdea } from '$lib/ideas.js';
import { readCriteria } from '$lib/settings.js';
import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
  if (locals.role !== 'admin') redirect(302, '/login');
  const unranked = listIdeas().filter(i => !i.ranked);
  unranked.sort((a, b) => a.title.localeCompare(b.title));
  // Load full HTML content for each idea so the "More" toggle is client-side show/hide
  const ideas = unranked.map(i => ({ ...i, html: getIdea(i.slug)?.html || '' }));
  return { ideas, criteria: readCriteria() };
}
```

The `html` field (rendered markdown) is loaded at page load so the "More" toggle is a **client-side show/hide of already-loaded content** — no secondary fetch is needed.

**UI — card contents:**
- Idea title + brief
- One slider per criterion (1–5) with label and invert indicator
- Live score preview (computed client-side)

**UI — card actions (all admin-only, but page is already admin-gated):**
- **Auto-rank** — calls `POST /api/ideas/[slug]/rank`, pre-fills sliders
- **Save & Next** — POSTs `{ scores }` to `PATCH /api/ideas/[slug]`; the PATCH handler **always forces `ranked: true`** when a `scores` field is present (the handler ignores any client-sent `ranked` value and sets it to `true` itself); advances to next card; **increments** the "saved" counter. This ensures `ranked` cannot be set to `false` via the API.
- **Skip** — advances to next card without saving; idea remains unranked; counter does **not** change; skipped ideas reappear on next page visit
- **More / Less** toggle — shows/hides full rendered HTML already loaded into page state

**Flow UI:**
- Progress indicator: "3 of 12 ranked" where denominator is total unranked count at page load (fixed) and numerator starts at 0 and increments on each Save
- Empty state when all cards in the current queue are exhausted (saved or skipped through): "All done for now." with link to `/ideas`

### `/settings` page

**Server:** Add a named action `saveCriteria` (admin-only). Reads `criteria` from FormData as a JSON string. Validates:
- Each item has `id` (non-empty string), `label` (non-empty string), `weight` (integer ≥ 1), `invert` (boolean)
- At least one criterion must remain
- Returns `{ error: '...' }` on validation failure (displayed in the form)

On success, calls `writeCriteria(criteria)`.

Also update the `load` function to return criteria:
```js
export function load() {
  return { guestVisibility: readSettings().guestVisibility, criteria: readCriteria() };
}
```

**UI:** Add a **Ranking Criteria** section below Guest Visibility:
- Lists existing criteria: editable label input, weight input (integer, min 1), invert checkbox, delete button
- **Add criterion** button appends a new blank row; id is derived from label on save (or client-side on blur)
- **Save criteria** button submits `?/saveCriteria`

---

## API Changes

| Method | Route | File | Notes |
|--------|-------|------|-------|
| `POST` | `/api/ideas` | existing | Add `brief` to prompt + confirm meta (body.brief) |
| `PATCH` | `/api/ideas/[slug]` | existing `+server.js` | **Extend** existing handler: accept `scores` (object) and `ranked` (boolean) in JSON body alongside existing fields; validate score values 0–5; call `saveIdeaMeta` |
| `POST` | `/api/ideas/[slug]/rank` | **new** `rank/+server.js` | AI auto-rank; returns scores per criterion; admin-only |

**`PATCH /api/ideas/[slug]` body contract:**
```json
{
  "scores": { "interest": 4, "feasibility": 3 }
}
```
When `scores` is present in the body, the handler always writes `ranked: true` regardless of any client-sent `ranked` value — `ranked` cannot be set to `false` via this endpoint. Validation: each score value must be integer 0–5 or absent. Responds 400 on invalid input.

**Auth on the existing PATCH handler:** The existing `PATCH /api/ideas/[slug]` handler currently has **no auth check**. As part of this work, add `if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 })` at the top of the handler, covering all operations (existing `status`/`tags` and new `scores`/`ranked`).

**`POST /api/ideas` auth:** The existing endpoint currently has no auth check. Add an admin-only guard at the top of the handler.

All new write endpoints must also check `locals.role !== 'admin'` and return 403 if not admin.

**`id` collision handling for new criteria:**
- Client-side: derive the id from the label on blur (slugify). Show the derived id to the user in a small read-only text field so they know what key their scores will use.
- Server-side (`saveCriteria` action): if the submitted `criteria` array contains duplicate ids, reject with a 400 error.
- There is no need to handle race conditions across tabs — criteria changes are infrequent and the last save wins.

**Enhance flow and `brief`:** The enhance-confirm branch in `src/routes/api/ideas/[slug]/+server.js` calls `saveIdeaContent` with a meta object built from `getIdea()` fields. Once `getIdea()` returns `brief`, include `brief: idea.brief || ''` in that meta object so it round-trips cleanly. The `saveIdeaContent` merge (`{ ...existingData, ...meta }`) means existing `brief` values survive even if not passed — but being explicit is safer.

**Duplicate criterion id validation:** Client-side duplicate detection is not required. A server-side 400 error on duplicate ids is sufficient. No client-side validation needed before submit.

**`id` visibility to user:** Show the derived id as a read-only hint below the label input (e.g. `id: market_size`) so the user understands what key their scores are stored under.

---

## Out of Scope

- Export to CSV/PDF
- Notes field per idea
- Templates
- Real-time sync across sessions
