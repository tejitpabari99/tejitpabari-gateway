---
status: draft
summary: Convert cc-gateway to an adapter-static SPA that reads/writes Firestore client-side with role-based gating, an ai.js stub for SP05, and deletion of all server-only code.
date: 2026-10-26
---
# PRD: cc-spa-port (static SPA port)
Repo/branch: cc-gateway · `feat/firebase-static` · Depends on: 01 (firebase-foundation) · Owns: `svelte.config.js`, `package.json` (adapter/dep changes only), `src/app.html`, `src/routes/**`, `src/lib/{ideas,links,settings,ai,access,session}.js`, `CLAUDE.md`, `README.md`, deletions below

## TL;DR
Switch to `adapter-static` (SPA fallback, `ssr=false`). Replace every `+page.server.js`/`/api/**` call with client-side Firestore calls through the rewritten `src/lib` data layer. A root `+layout.js` waits for auth, loads settings, computes `role` + `allowed`; the layout renders a Google sign-in screen instead of the page when a guest hits a hidden/admin-only route. AI features call `src/lib/ai.js` (stub; SP05 implements). Delete server code, LinkedIn, links click UI.

## Problem
All data and auth live in Node-only code (`fs`, HMAC cookie, Anthropic SDK, hooks gate). A static host has no server, so each of these must become browser code backed by Firestore rules (SP01) without changing how the UI looks.

## Goals / Non-Goals
- Goals: same pages, same visuals, same function surface; zero server code; guest read-only mode enforced by UI + SP01 rules; no admin/guest flash.
- Non-goals: rules/auth internals (SP01), data import (SP02), `go.` site (SP04), Gemini implementation/App Check (SP05), deploy (SP06), UI redesign, offline/realtime listeners (one-shot reads only).

## Requirements
- Same routes: `/`, `/ideas`, `/ideas/[slug]`, `/ideas/rank`, `/links`, `/settings`, plus `/login` (now Google sign-in). Deep links/refresh work via SPA fallback.
- Unauthenticated or non-owner = guest. Guest on a visible page: read-only (no Add/Edit/Delete/Save/AI/status/tag/title/link/github edits, no Rank/Bulk actions). Guest on a hidden page, `/settings`, or `/ideas/rank` (admin-only, as today [verified: `ideas/rank/+page.server.js` redirects non-admin; `settings/+page.server.js` same]): sign-in screen in place, URL unchanged.
- Visibility matching keeps hooks semantics: allowed if `path === p || path.startsWith(p + '/')` for any `guestVisibility[p] === true` [verified: hooks.server.js L58-60]; so `/` matches only `/`.
- Header: guest sees "Admin" pill linking `/login`; admin sees settings cog + "Logout" (calls `signOutUser`, stays SPA). Non-owner Google account: sign-in screen shows "Signed in as X (not authorised)" + Sign out; treated as guest.
- Home: Ideas + Links cards only (LinkedIn card removed).
- Links table: Clicks and Last Hit columns removed; Redirect type toggle removed; expiry, tags, QR, copy, expired badge kept. (`description` stays in data; no UI input exists today [verified: `grep description links/+page.svelte` → 0].)
- Idea create/edit/rank/enhance flows behave as today; AI buttons show the error returned by `ai.js` (stub: "AI not configured").
- Settings: guest-visibility toggles + ranking criteria save to `settings/main` with current validation messages.

## Architecture
**Assumed SP01 interface** (taken from SP01 PRD; SP03 adapts in one place if names drift): `src/lib/firebase.js` -> `{app, auth, db}`; `src/lib/auth.js` -> `signInWithGoogle()`, `signOutUser()`, readable stores `user`, `authReady` (boolean), `role` (`'admin'|'guest'`); `src/lib/config.js` -> `SETTINGS_PATH='settings/main'`; schema per `docs/firestore-schema.md`. SP03 adds `src/lib/session.js` with `whenAuthReady(): Promise<void>` (resolves when `authReady` store is true) so loaders can await it. SP03 does **not** touch `auth.js`/`firebase.js` (SP01 owns; old `auth.js` is overwritten by SP01, not deleted by SP03).

**Shell**: `svelte.config.js` -> `adapter({fallback:'index.html'})`, drop `csrf` block. `src/routes/+layout.js`: `ssr=false; prerender=false; trailingSlash='never'`; `load({url})` -> `await whenAuthReady()`; `role=get(role)`; `settings=await getSettings()`; returns `{role, guestVisibility, allowed: canView(url.pathname, role, guestVisibility)}`. `src/lib/access.js` holds `canView()` (visibility match + admin-only list `['/settings','/ideas/rank']`). `+layout.svelte`: until load resolves SvelteKit renders nothing (no flash); once resolved renders header + `{#if data.allowed} children {:else} <SignInGate/>`. `app.html` gets a tiny inline `<style>` setting body background by the existing theme class to avoid a white flash before hydrate. A layout `$effect` calls `invalidateAll()` when `$role` changes after first resolve (sign-in/out without reload). Header/pages read role from `data.role`, as today.

**Page loaders**: each `+page.js` does `const {role, allowed} = await parent(); if (!allowed) return {...empty}` (never queries Firestore for a denied route, avoiding permission-denied errors), else loads via data layer; keeps today's `data` shape so `.svelte` bodies change minimally. Loader errors (`permission-denied`, not-found) -> `error(404/403)`.

**Data layer** (async, same names; all use `db` from SP01):
| Module | Functions (new surface) | Notes |
|---|---|---|
| `ideas.js` | `listIdeas()`, `getIdea(slug)`, `createIdea({title,content,tags,brief})`->slug, `saveIdeaMeta(slug, partial)`, `saveIdeaContent(slug, body, meta?)`, `deleteIdea(slug)`, `setRanking(slug,{scores,analysis})`, `resetRanking(slug)`, `resetAllRankings(slugs)`, `slugifyTitle(t)`, `renderMarkdown(md)`, `computeScore` (moved from page copies) | `listIdeas` = `getDocs(collection)`, derive `excerpt` from `body` (same regex), titlecase tags, sort as today. `getIdea` returns `html: marked(body)`, `content: body`. Dates stay strings. `setRanking` = one `updateDoc` (scores, ranked:true, body with stripped+appended `## Ranking Analysis (Auto-rank)` section; same regex as server). `resetRanking` = one `updateDoc` (scores {}, ranked false, body stripped). Bulk reset via `writeBatch` (59 docs <500). |
| `links.js` | `listLinks()`, `getLink(slug)`, `saveLink({slug,url,tags,description,expiresAt,existingSlug})`, `deleteLink(slug)`, `validateLink()` | `recordClick` deleted. Validation moved from api routes. Rename = `runTransaction`: read new id (throw `Slug "x" already exists`), `set` new doc (keep `created`), `delete` old. Lowercase slug lookups. |
| `settings.js` | `getSettings()` (memoized, cache cleared on write), `saveGuestVisibility(map)`, `getCriteria()`, `saveCriteria(list)` (validation from `saveCriteria` action) | `settings/main` missing -> same defaults as today's `defaultCriteria`; guestVisibility default `{}`. Writes use `setDoc(..., {merge:true})`. |

**AI interface** (`src/lib/ai.js`, stub now; SP05 replaces bodies, signatures frozen). Derived from the three Anthropic routes:
```js
// all throw Error(userFacingMessage) on failure; admin-only callers
parseIdea(rawText)            // api/ideas POST step1. -> {title, content, tags[], brief}
enhanceIdea(existing, notes)  // api/ideas/[slug] POST enhance. -> {content}  (markdown only, no fences)
rankIdea({title,brief,content}, criteria) // api/ideas/[slug]/rank. -> {scores:{id:1..5 int}, analysis:string}
```
Behavior to port (SP05): `parseIdea` = 5-word title, polish English without adding content, markdown headings, 1-3 tags from `AI, productivity, social, B2B, mobile, web, extension, health, finance, food, travel, education, tools`, 1-2 sentence brief, strict-JSON, strip code fences; `rankIdea` skips criterion `interest`, tells model inverted criteria are scored raw (not inverted), JSON `{scores, analysis}`, clamp 1-5, NaN->3 [verified: rank/+server.js]. Callers (SP03) own slug generation (`slugifyTitle`: lowercase, strip non `[a-z0-9\s-]`, spaces->`-`, max 60), markdown render, and persistence. The stub throws `Error('AI is not configured yet')`.

**Old -> new inventory**
| Old | New |
|---|---|
| `+layout.server.js` (role, guestVisibility) | `+layout.js` as above |
| `hooks.server.js` guest gate / go. engine | `access.js` + layout gate / SP04 |
| `/` `+page.svelte` | drop LinkedIn card; no loader |
| `ideas/+page.server.js` (listIdeas, criteria) | `ideas/+page.js` -> `listIdeas()`, `getCriteria()` (+role) |
| `ideas/+page.svelte` fetch `POST /api/ideas` rawText | `ai.parseIdea` then `slugifyTitle` |
| ... `POST /api/ideas {confirmed}` | `createIdea` (adds `date=today`, status `new`, link '', brief); on slug collision append `-2`,`-3` (old code silently overwrote) |
| ... `POST /api/ideas/[slug]/rank` + `PATCH {scores,analysisText}` (`rankOne`) | `ai.rankIdea` + `setRanking`; bulk run uses concurrency 3 (was unbounded `Promise.allSettled`) to respect Gemini limits |
| ... `PATCH {resetRank}` x N + `location.reload()` | `resetAllRankings` + `invalidateAll()` |
| `ideas/[slug]/+page.server.js` load / actions updateStatus,Tags,Title,Link,Github,delete | `+page.js` -> `getIdea`, `getCriteria`; actions -> `saveIdeaMeta` / `deleteIdea` + `goto('/ideas')`; 404 if missing |
| ... actions saveRanking/resetRanking | unused by UI [verified: grep `?/saveRanking` → 0]; dropped; ranking via `setRanking`/`resetRanking` |
| ... `POST/PATCH /api/ideas/[slug]` enhance/confirm/scores | `ai.enhanceIdea` + `renderMarkdown` preview; confirm -> `saveIdeaContent` |
| `ideas/rank/+page.server.js` | `+page.js`: admin only; unranked (`!ranked && status==='new'`) sorted by title, `html` via `renderMarkdown`; autoRank/saveAndNext as above |
| `links/+page.server.js` + `/api/links*` | `links/+page.js` -> `listLinks()`; add/edit/delete -> `saveLink`/`deleteLink`; refresh list by `invalidateAll()` |
| `settings/+page.server.js` actions save/saveCriteria | `+page.js` (admin only); native `<form method=POST>` replaced by `onsubmit` handlers calling `settings.js`; keep success/error messages; add `/`,`/ideas`,`/links` `pages` array unchanged |
| `login/*`, `logout/+server.js` | `login/+page.svelte` Google button (same card styling) -> `signInWithGoogle`, redirect `/` when admin; logout = `signOutUser()` |

**Libs kept client-side**: `marked` (render), `qrcode` (already a dynamic client import in `links/+page.svelte` L13). Add dep `@sveltejs/adapter-static`; `firebase` comes from SP01.

**Deletions** (each backed by grep):
| Target | Evidence |
|---|---|
| `src/hooks.server.js` | go. engine -> SP04; guest gate -> `access.js` |
| `src/lib/anthropic.js`, dep `@anthropic-ai/sdk` | `grep -rn anthropic src` -> only `api/**` + itself; all `api/**` deleted |
| `src/routes/api/**` (5 files) | `grep -rn "fetch('/api\|fetch(\`/api"` -> only in the 4 pages being rewritten |
| `src/routes/login/+page.server.js`, `logout/+server.js` | replaced by client auth |
| `src/routes/linkedin/**` | proxy to :3003; removed per brief |
| dep `dotenv` | `grep -rn dotenv src` -> 0 (only `process.env` in deleted files) |
| dep `@sveltejs/adapter-node`, `adapter-auto` | `svelte.config.js` only imports adapter-node; adapter-auto unused |
| dep `gray-matter` | only `src/lib/ideas.js` (rewritten). SP02's Node script needs it: SP02 must add it as its own devDependency/script-local dep |
| `ecosystem.config.cjs`, `deploy/nginx/`, `deploy/README.md`, `.env.example` | pm2/nginx/VPS/env vars (`GATEWAY_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_*`, `LINKEDIN_URL`) all obsolete |
| `src/lib/auth.js` (HMAC) | not deleted by SP03: SP01 overwrites it |
| `archive/**`, `content/**` | untouched (content/ is SP02's import source; removal deferred to SP06) |

**Docs**: `CLAUDE.md` -> drop "Build Before Restart/pm2", API-route, dashboard-proxy, LinkedIn-exception bullets; new rules: pages gate via `canView`; write UI under `{#if data.role !== 'guest'}`; real enforcement in `firestore.rules`; new guest-visible page needs a `pages` entry in settings (`+page.js` not needed) **and** a rules update; build = `npm run build`, deploy per SP06. `README.md`: delete "Live Architecture"/VPS/nginx/pm2 sections; new short Overview + Local dev (`npm run dev`, emulators from SP01) + Deploy -> "see SP06 runbook" (`docs/agent_files/.../06-deploy-cutover`).

## Decisions
| # | Decision | Choice | Alternatives considered | Why |
|---|---|---|---|---|
| 1 | Where data loads | `+layout.js`/`+page.js` awaiting auth-ready; denied routes skip queries | `onMount` fetches per page | Keeps `data.*` shape so `.svelte` bodies barely change; no flash; no permission-denied noise |
| 2 | Gate | Layout swaps children for sign-in gate | Redirect to `/login` | Matches old behavior of "login" without URL churn; deep link survives sign-in |
| 3 | Slug charset | `[a-z0-9-]+` (SP01) | Keep `[a-z0-9\-_/]` | Firestore doc IDs cannot contain `/`; both existing slugs `meet`,`meet-full` comply [verified: links.json]. `/` and `_` dropped; SP04 gets a flat path |
| 4 | Link rename | Transaction create+delete | Immutable slug | Preserves today's edit UX; atomic |
| 5 | Idea slug | Generated once from title, never renamed on title edit (as today); collision suffix | Overwrite | Old overwrite was a latent bug |
| 6 | Reserved idea slugs | Reject `rank` (static route wins over `[slug]`) | Ignore | Avoid unreachable doc |
| 7 | Markdown | `marked` client-side, no sanitizer | + DOMPurify | Only owner can write bodies (rules); guests read trusted content |
| 8 | Settings cache | Memoized `getSettings()` | Re-read per navigation | Avoid a read per route change; cleared on write |
| 9 | AI boundary | `ai.js` stub, 3 functions, plain-data in/out | Pages call Firebase AI directly | SP05 swaps implementation without touching pages |
| 10 | Rank bulk | Concurrency 3 | Unbounded | Free-tier rate limits |
| 11 | Realtime | One-shot `getDocs` | `onSnapshot` | Single user; fewer reads; same as today |

## Risks / Open Questions
- [RESOLVED: SP01 PRD defines `authReady` as a store, `role` store, `signInWithGoogle/signOutUser`] SP03 wraps in `session.js`.
- [RESOLVED: `package.json` shared with SP01/SP02] SP03 edits only adapter/deps lines; apply after SP01 merges; rebase conflicts expected, trivial.
- [RESOLVED: list reads pull full `body`] 59 docs, ~256 KB total; acceptable for list pages.
- [DEFERRED] `/ideas` list could drop `body` via a separate `excerpt` field if size grows.
- [RESOLVED: guest list on `/links` blocked by rules when toggle off] Gate prevents the query; rules are backstop.
- [RESOLVED: slugs restricted to [a-z0-9-]+] Confirm dropping `/` and `_` from link slugs (needed because of Firestore doc IDs). Only matters if owner has paper/QR links using them; current data has none.
- [DEFERRED] Settings page copy "without a password" -> "without signing in"; trivial text edit during port.

## Acceptance Criteria
- `npm run build` emits `build/index.html` + `_app/`; no `adapter-node`, `@anthropic-ai/sdk`, `dotenv`, `gray-matter` in `package.json`; `grep -rn "\$env\|process\.env\|from 'fs'\|\+page\.server\|\+server" src` -> 0.
- `src/routes/api`, `login/+page.server.js`, `logout`, `linkedin`, `hooks.server.js`, `ecosystem.config.cjs`, `deploy/nginx` absent.
- Emulator run: admin can add/edit/delete idea, change status/tags/title/link/github, rename a link (old doc gone, `created` preserved, collision rejected), edit settings; guest sees no write controls on `/`, `/ideas`, `/ideas/[slug]`, `/links`.
- Guest with `/links` toggled off sees sign-in gate (no Firestore query fired); `/settings` and `/ideas/rank` show gate for guest and non-owner Google user.
- Hard refresh on `/ideas/<slug>` shows no admin/guest flash and renders markdown body identical to old HTML for 3 sampled ideas.
- Links table has no Clicks/Last Hit columns or redirect toggle; home has no LinkedIn card.
- Auto-rank/Add Idea/Enhance buttons call `ai.js` and surface its error message with the stub.
- `CLAUDE.md` and `README.md` contain no references to pm2, nginx, `/api`, dashboard proxy, `/linkedin`, `GATEWAY_PASSWORD`.
