---
status: draft
summary: Five tasks to build the static go. redirector page (pure core, page shell, runtime, hosting block, emulator tests).
date: 2026-10-26
---
# Tasks: SP04 go-redirector
Source of truth: /root/projects/cc-gateway/.worktrees/feat/firebase-static/docs/agent_files/feat-firebase-static-20261026-1647/04-go-redirector/PRD.md. Static page on the `go` Hosting site that resolves a slug via unauthenticated Firestore REST, shows not-found/expired/bad/error pages, fires GA4 `go_click`, then JS-redirects. No Firebase SDK, no server.

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Pure core module and unit tests | — | todo |
| 2 | Page shell, styles, noscript | SP01 T2 | todo |
| 3 | Runtime: fetch, render, GA4, redirect | 1, 2, SP01 T3 | todo |
| 4 | Hosting `go` block: headers and CSP | SP01 T2, 2 | todo |
| 5 | Emulator REST test and drift/grep guards | 3, 4, SP01 T5 | todo |

## Task 1 — Pure core module and unit tests
What it is / what it means: `go-core.js` is the node-testable logic with no DOM or network, per D3 and D7.
What changes at a high level: Add `parseSlug` (strip slashes, safe decode, lowercase, reject anything not `[a-z0-9-]+` or multi-segment, empty handled distinctly), `decodeLink` (REST fields: url string, expiresAt null/string/timestamp tolerated), and `classify(link, now)` returning live, expired, notfound, or bad. Expiry is `new Date(expiresAt) < now`, invalid date means not expired. Scheme guard allows only http/https; missing, relative, or unparseable url is bad. Add `tests/go/` node tests for all PRD acceptance cases (case, trailing slash, encoded, `/a/b`, date-only boundary, `javascript:`/`data:`).
Done when: `node --test tests/go/` passes.

## Task 2 — Page shell, styles, noscript
What it is / what it means: The single HTML page served for every path, with no inline script (D3).
What changes at a high level: Add `go/index.html` with noindex meta, a content container, module script reference to `go.js`, stylesheet link, and the noscript message "This short link needs JavaScript to redirect." Add `go/go.css` with system sans-serif and 2rem padding matching today's look. Replace any SP01 placeholder page.
Done when: page loads in the hosting emulator with no inline script body, and noscript text appears with JS disabled.

## Task 3 — Runtime: fetch, render, GA4, redirect
What it is / what it means: `go.js` orchestrates the behavior table (D1, D2, D4, D5, D6, D8).
What changes at a high level: Top constants for project id, API key, GA id (`G-9NLS3NG63M`), no endpoint override. Parse slug; empty shows "URL Shortener / No slug provided."; invalid shape shows 404 with no network call. Start gtag.js loading in parallel with the Firestore REST GET (config with page view disabled). Render notfound (404), expired (410 with date), bad (misconfigured), and error (retry link, no redirect on 403/5xx/network) using `textContent` only. On live, fire `go_click` with slug and target_host unconditionally, then `location.replace` after the event callback or 300 ms; redirect immediately if gtag is blocked or absent, hard cap 1500 ms. Query and hash ignored.
Done when: manual checks in the PRD pass against the emulator or live data, including blocked-gtag redirect and no CSP violations.

## Task 4 — Hosting `go` block: headers and CSP
What it is / what it means: Edit only the `go` target block of SP01's `firebase.json` (D9).
What changes at a high level: Keep the `**` to `/index.html` rewrite and SP01 baseline headers. Add `no-cache` for index.html, go.js, go-core.js, go.css; `X-Robots-Tag: noindex`; and the strict CSP from the PRD Architecture section (self scripts plus googletagmanager, connect to Firestore and GA hosts, base-uri/form-action none, frame-ancestors none).
Done when: hosting emulator returns index.html for any path with those headers, and the `cc` block is unchanged.

## Task 5 — Emulator REST test and drift/grep guards
What it is / what it means: Verification of the unauthenticated read contract and config drift (D8, Acceptance Criteria).
What changes at a high level: Add a node test run against the Firestore emulator with SP01 rules loaded: unauthenticated GET of an existing link returns 200 with decodable fields, a missing link returns 404, a collection list is denied. Add a test asserting `PROJECT_ID` and `API_KEY` in `go.js` equal `src/lib/firebase-config.js`. Add a check that `go/` has no Firebase SDK import or inline script body, and page weight excluding gtag is under 8 KB.
Done when: all tests pass locally with the emulator running.

## Owner-only steps (from PRD Manual steps — not tasks for agents)
- If the Web API key is HTTP-referrer restricted, add `go.tejitpabari.com/*` and the `*.web.app` preview domain (tracked in the SP06 checklist).
- After deploy, create a throwaway live link and an expired link in `cc` (or via SP02) for manual checks.
