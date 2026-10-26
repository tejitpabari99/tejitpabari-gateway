---
status: draft
summary: 10 tasks to port cc-gateway to an adapter-static SPA on Firestore with role gating, an ai.js stub, and removal of all server code.
date: 2026-10-26
---
# Tasks: cc-spa-port (static SPA port)
Source of truth: /root/projects/cc-gateway/.worktrees/feat/firebase-static/docs/agent_files/feat-firebase-static-20261026-1647/03-cc-spa-port/PRD.md. Data layer first, then shell/gate, then each page, then deletions and docs. All SP01 names (`firebase.js`, `auth.js` stores, `config.js`) are assumed per the PRD; adapt in one place if they drift.

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Settings, session, access helpers | SP01 | todo |
| 2 | Ideas data layer | SP01, T1 | todo |
| 3 | Links data layer | SP01, T1 | todo |
| 4 | AI interface stub | none | todo |
| 5 | Static shell, layout gate, login | T1, SP01 | todo |
| 6 | Home and links page port | T3, T5 | todo |
| 7 | Ideas list and add-idea flow | T2, T4, T5 | todo |
| 8 | Idea detail page | T2, T4, T5 | todo |
| 9 | Rank page and settings page | T1, T2, T4, T5 | todo |
| 10 | Server-code deletions and docs | T6, T7, T8, T9 | todo |

## Task 1 — Settings, session, access helpers
What it is: the small client modules the layout and every loader depend on (Decisions 1, 8).
What changes at a high level: add `settings.js` with memoized `getSettings()` (cache cleared on write), `saveGuestVisibility`, `getCriteria`, `saveCriteria`, using the existing criteria validation messages and today's default criteria when `settings/main` is missing; guestVisibility defaults to empty. Writes use merge-set. Add `session.js` with `whenAuthReady()` resolving when SP01's `authReady` store is true. Add `access.js` with `canView(path, role, guestVisibility)` keeping hooks semantics (exact or prefix-plus-slash match for any enabled entry, so `/` matches only `/`) and the admin-only list for `/settings` and `/ideas/rank`. Does not touch `auth.js` or `firebase.js`.
Done when: helpers import cleanly against SP01 modules and `canView` returns correct results for guest/admin on visible, hidden, and admin-only paths.

## Task 2 — Ideas data layer
What it is: async Firestore replacement for the fs/gray-matter `ideas.js` (data layer table, Decisions 5, 6, 7, 11).
What changes at a high level: rewrite `ideas.js` with `listIdeas` (one-shot `getDocs`, excerpt derived from body with the same regex, titlecased tags, existing sort), `getIdea` (returns rendered `html` via `marked` and raw `content`), `createIdea` (date today, status `new`, link empty; slug collision appends `-2`, `-3`; rejects reserved slug `rank`), `saveIdeaMeta`, `saveIdeaContent`, `deleteIdea`, `setRanking` and `resetRanking` as single updates managing the Auto-rank analysis section with the server's regex, `resetAllRankings` via batched write, plus `slugifyTitle`, `renderMarkdown`, and the shared `computeScore` moved out of page copies. Dates stay strings.
Done when: against the emulator each function round-trips an idea and ranking section strip/append matches old behavior.

## Task 3 — Links data layer
What it is: Firestore replacement for link storage and the validation that lived in the API routes.
What changes at a high level: add or rewrite `links.js` with `listLinks`, `getLink`, `saveLink`, `deleteLink`, `validateLink` (moved from the `/api/links*` routes, slugs restricted to `[a-z0-9-]+`, lowercase lookups). Rename is a transaction: read the new id and throw `Slug "x" already exists` on collision, set the new doc preserving `created`, delete the old. `recordClick` is removed. `description` stays in data with no UI.
Done when: emulator test shows rename removes the old doc, keeps `created`, and rejects a colliding slug; invalid slugs return the existing validation messages.

## Task 4 — AI interface stub
What it is: the frozen boundary SP05 will implement (Decision 9).
What changes at a high level: add `ai.js` exporting `parseIdea(rawText)`, `enhanceIdea(existing, notes)`, `rankIdea({title,brief,content}, criteria)` with the documented return shapes in comments, each throwing `Error('AI is not configured yet')`. Signatures are plain data in/out so pages never call Firebase AI directly. Callers own slug generation, markdown rendering, and persistence.
Done when: all three functions exist with the final signatures and throw the stub error.

## Task 5 — Static shell, layout gate, login
What it is: switch to a client-only SPA with no auth/role flash (Decisions 1, 2; Requirements on routes, header, sign-in).
What changes at a high level: `svelte.config.js` uses adapter-static with `index.html` fallback and no csrf block; swap the adapter dependency in `package.json` (adapter/dep lines only, applied after SP01 merges). Add root `+layout.js` (`ssr=false`, `prerender=false`, `trailingSlash='never'`) awaiting auth-ready, then returning `role`, `guestVisibility`, and `allowed`. `+layout.svelte` renders the header (guest "Admin" pill to `/login`; admin cog and Logout via `signOutUser`) and either children or a SignInGate showing Google sign-in, plus "Signed in as X (not authorised)" with Sign out for non-owners. A `$effect` calls `invalidateAll()` when role changes. `app.html` gets inline body background by theme class. `/login` becomes a Google button in the same card styling, redirecting to `/` for admin.
Done when: `npm run build` emits `build/index.html`; deep link refresh shows no admin/guest flash; hidden pages, `/settings`, and `/ideas/rank` show the gate with URL unchanged.

## Task 6 — Home and links page port
What it is: the two simplest pages moved off server loaders and API fetches.
What changes at a high level: home drops the LinkedIn card (Ideas and Links only), no loader. Links gets `+page.js` that skips queries when denied and otherwise calls `listLinks()`; add/edit/delete use `saveLink`/`deleteLink` and refresh with `invalidateAll()`. Remove Clicks and Last Hit columns and the redirect-type toggle; keep expiry, tags, QR (existing dynamic import), copy, expired badge. Write controls remain under the guest guard. Loader errors map to 403/404.
Done when: admin can add, edit, rename, and delete links; guest sees no write controls; guest with the links toggle off sees the gate and no Firestore query fires.

## Task 7 — Ideas list and add-idea flow
What it is: `/ideas` loader and its create/bulk flows (Decisions 5, 10).
What changes at a high level: `ideas/+page.js` returns `listIdeas()` and `getCriteria()` plus role, empty when denied. Add Idea calls `ai.parseIdea`, derives the slug with `slugifyTitle`, and persists via `createIdea`; AI errors are surfaced in the UI. Remove the `fetch('/api/ideas...')` calls. Bulk reset uses `resetAllRankings` followed by `invalidateAll()` instead of per-idea patches and reload. Guest sees no Add, Rank, or Bulk actions.
Done when: with the stub, Add Idea shows "AI is not configured yet"; list renders with the same shape and sorting; guest view is read-only.

## Task 8 — Idea detail page
What it is: `/ideas/[slug]` loader and former form actions.
What changes at a high level: `+page.js` loads `getIdea` and `getCriteria`, returning 404 when missing. Status, tags, title, link, and github edits call `saveIdeaMeta`; delete calls `deleteIdea` then `goto('/ideas')`. Enhance calls `ai.enhanceIdea` with a `renderMarkdown` preview and confirm calls `saveIdeaContent`; rank and reset use `setRanking`/`resetRanking`. The unused saveRanking/resetRanking form actions are dropped. All write UI stays under the guest guard.
Done when: admin can perform every edit and delete; markdown body of three sampled ideas renders identically to the old HTML; guest has no write controls.

## Task 9 — Rank page and settings page
What it is: the two admin-only pages (Requirements; Decisions 10).
What changes at a high level: `ideas/rank/+page.js` is admin-only, lists unranked ideas (`!ranked` and status `new`) sorted by title with `html` from `renderMarkdown`; autoRank and saveAndNext use `ai.rankIdea` plus `setRanking`, and any bulk auto-rank runs with concurrency 3. Settings `+page.js` is admin-only; native POST forms become `onsubmit` handlers calling `settings.js`, keeping success/error messages and the unchanged `pages` array (including `/`, `/ideas`, `/links`). Copy "without a password" becomes "without signing in".
Done when: admin can save visibility toggles and criteria; guest and non-owner Google users see the gate on both routes; rank buttons surface the stub error.

## Task 10 — Server-code deletions and docs
What it is: remove everything server-only and refresh project docs (Deletions and Docs sections).
What changes at a high level: delete `hooks.server.js`, `anthropic.js`, `routes/api/**`, `login/+page.server.js`, `logout/`, `routes/linkedin/**`, `ecosystem.config.cjs`, `deploy/nginx/`, `deploy/README.md`, `.env.example`. Remove deps `@anthropic-ai/sdk`, `dotenv`, `adapter-node`, `adapter-auto`, `gray-matter` (SP02 carries its own). Leave `auth.js` (SP01), `archive/`, `content/`. Rewrite `CLAUDE.md` (drop pm2, API-route, dashboard-proxy, LinkedIn bullets; add canView gating, `data.role` guards, rules as real enforcement, settings `pages` entry plus rules update) and `README.md` (Overview, local dev with emulators, deploy pointing to the SP06 runbook).
Done when: the grep for `$env|process.env|from 'fs'|+page.server|+server` in `src` returns 0; listed paths are absent; docs have no pm2, nginx, `/api`, dashboard proxy, `/linkedin`, or `GATEWAY_PASSWORD`; build passes.

## Owner-only steps (from PRD Manual steps — not tasks for agents)
The PRD defines no manual steps. One owner awareness item: link slugs drop `/` and `_` (RESOLVED); only matters if paper or QR links used them, and current data has none.
