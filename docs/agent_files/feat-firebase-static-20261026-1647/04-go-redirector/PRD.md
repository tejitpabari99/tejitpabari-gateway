---
status: draft
summary: Static go.tejitpabari.com page that resolves a slug via Firestore REST, handles missing/expired links, fires GA4 go_click, then JS-redirects.
date: 2026-10-26
---
# PRD: SP04 go-redirector
Repo/branch: cc-gateway · `feat/firebase-static` · Depends on: SP01 · Owns: `go/index.html`, `go/go.js`, `go/go-core.js`, `go/go.css`, `tests/go/**`, the `go` target block inside SP01's `firebase.json` (edit that block only)

## TL;DR
Hosting site `go` serves one tiny HTML page for every path (`**` -> `/index.html`). A ~100-line module reads the slug from the path, does an unauthenticated Firestore REST `GET` of `links/{slug}`, shows 404 / expired / bad-link pages as content, otherwise fires GA4 `go_click` and `location.replace(url)`. No SDK, no server.

## Problem
Today `hooks.server.js` (host == `go.tejitpabari.com`) does lookup, expiry check, `recordClick`, and a real 301/302 `[verified: src/hooks.server.js]`. Static hosting has no server, and Hosting's own `redirects` are build-time only, so the redirect must run in the browser.

## Goals / Non-Goals
- Goals: parity with current messages and expiry semantics; click counting in the website's existing GA4 property; small payload (<~6 KB, 3 requests + gtag); safe against open-redirect abuse.
- Non-goals: real HTTP 3xx/404/410 (impossible, see D1); in-app click counts; link management UI (SP03); preserving `redirectType`.

## Requirements
| Case | Behavior |
|---|---|
| `/meet` live | Fire `go_click`, then replace location with `url` |
| `/` (empty slug) | "URL Shortener / No slug provided." page (today's text) |
| unknown slug (REST 404) | "404 - Link not found. The short link `go.tejitpabari.com/<slug>` does not exist." |
| `expiresAt` in past | "410 - Link expired. This link expired on `<expiresAt>`." |
| url scheme not http/https, or url missing/unparseable | Generic "This link is misconfigured." page; no redirect, no GA event |
| invalid slug shape (not `[a-z0-9-]+`, multi-segment `/a/b`) | Same as unknown slug, no network call |
| REST 403 / 5xx / network failure | "Couldn't load this link. Try again." + retry link (reload); no redirect |
| JS disabled | `<noscript>` message: "This short link needs JavaScript to redirect." |
- Slug parse: `location.pathname` -> strip leading and trailing `/` -> `decodeURIComponent` (try/catch -> not found) -> lowercase. Lowercasing matches SP02, which lowercases slugs, and today's case-insensitive `getLink` `[verified: src/lib/links.js getLink]`.
- Expiry: `new Date(expiresAt) < new Date()` exactly as today; date-only strings parse as UTC midnight so a link dies at 00:00 UTC of its date. Unparseable date = treated as not expired (current behavior).
- Query string and hash are **ignored**, as today (hooks never forwarded them).
- All dynamic text goes in via `textContent` (the current server HTML interpolates the slug raw, an XSS bug not to be ported).
- Page `<meta name="robots" content="noindex">`; neutral text-only layout, system font, matches current look (sans-serif, 2rem padding).

## Architecture
```
browser -> go.tejitpabari.com/<slug>  (Hosting `go`, rewrite ** -> /index.html)
  go.js (module):  start gtag.js load in parallel  +  fetch Firestore REST
  go-core.js (pure, node-testable): parseSlug, decodeLink, classify(link, now)
  fetch GET https://firestore.googleapis.com/v1/projects/tejitpabari-99/databases/(default)/documents/links/{slug}?key=<webApiKey>
  -> {kind: live|expired|notfound|bad|error}
  live: gtag('event','go_click',{slug, target_host, event_callback}) ; min(callback, 300ms) -> location.replace(url)
```
- **REST decode**: `fields.url.stringValue`; `fields.expiresAt` is `nullValue` or `stringValue` per SP01 schema (also tolerate `timestampValue` defensively) `[verified: SP01 PRD schema]`. Other fields ignored.
- **Auth**: unauthenticated; relies on SP01 rule `links/{id} allow get: if true`. The `?key=` is the same public web API key as `src/lib/firebase-config.js` (identifies the project; not a secret).
- **GA4**: measurement ID `G-9NLS3NG63M` `[verified: /root/projects/tejitpabari/.env.example VITE_GA_MEASUREMENT_ID; analytics.ts builds gtag.js?id= from it]`. Standard dataLayer/`gtag` stub, `config` with `send_page_view:false`, so only `go_click` is sent. Event params: `slug`, `target_host` (hostname of url; cheap, useful in GA). gtag.js is requested at page start, in parallel with the Firestore fetch, so by redirect time it is usually ready; this is what makes a 300 ms `event_callback` fallback viable. If the gtag script errors/blocked or `gtag` absent, redirect immediately (no wait). Hard cap: 1500 ms after link resolved if gtag.js still loading.
- **Headers** (`go` block, in addition to SP01 baseline nosniff / Referrer-Policy / HSTS): `index.html`, `go.js`, `go-core.js`, `go.css` -> `Cache-Control: no-cache` (tiny files, revalidated by ETag); `X-Robots-Tag: noindex`; CSP:
  `default-src 'none'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; connect-src https://firestore.googleapis.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; img-src https://www.google-analytics.com https://www.googletagmanager.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  Scripts and CSS are external files so no inline hashes are needed (unlike the website's hash list). Redirect target is `location.replace`, not governed by CSP.
- **Config**: `go.js` top constants `PROJECT_ID`, `API_KEY`, `GA_ID`. A node test asserts `API_KEY`/`PROJECT_ID` equal `src/lib/firebase-config.js` to catch drift (static page cannot import the SPA build).
- **Scheme guard**: `new URL(url)`, `protocol` must be `http:` or `https:` (blocks `javascript:`, `data:`), otherwise "bad" page. Admin-only writes plus this guard are defense in depth.

## Decisions
| # | Decision | Choice | Alternatives | Why |
|---|---|---|---|---|
| D1 | HTTP statuses | Always 200 for every path; 404/410 are page content only | Hosting 404.html for root | Rewrite `**` makes status unchangeable; accepted by owner (no real redirect). noindex header offsets SEO side effects |
| D2 | Query/hash | Ignore | Forward to target | Parity with today; forwarding would leak/alter targets. [DEFERRED] opt-in later |
| D3 | Script layout | External `go.js` + `go-core.js` (ES modules) + `go.css` | One inline page | Strict CSP without hashes; core is unit-testable in node |
| D4 | gtag load timing | Parallel with Firestore fetch | Load after resolve | Avoids losing events under 300 ms fallback |
| D5 | Event params | `slug`, `target_host` | `slug` only | Brief says `{slug}`; host is a harmless addition, droppable |
| D6 | Error handling | Distinct pages for notfound / expired / bad / transient error | Treat all as 404 | A 403/network fault must not tell visitors a valid link is deleted |
| D7 | Slug validation | `[a-z0-9-]+` client-side before fetch | Pass through | Prevents path/query injection into the REST URL; matches SP01 slug rule |
| D8 | Endpoint override for tests | None in shipped code | `?api=` param / localhost branch | An override is an exploitable redirect-of-lookup; emulator tested in node instead |
| D9 | Hosting block ownership | SP04 edits only the `go` block of SP01's `firebase.json` | SP01 writes it all | SP01 left `go` as "SP04 fills" |

## Manual steps
- Owner: if the Web API key is HTTP-referrer restricted in Google Cloud console, add `go.tejitpabari.com/*` (and the `*.web.app` preview domain) or REST calls will 403. Handled in SP06 checklist.
- Owner: after deploy, create a throwaway live and an expired link in `cc` (or via SP02) for manual checks.

## Risks / Open Questions
- [RESOLVED: fire go_click unconditionally, no consent read] GA consent: the website gates GA behind a consent context (`ConsentContext`, `disableGa()`) `[verified: analytics.ts]`. `go.` has no banner. Default proposed: fire `go_click` unconditionally (no page content, no PII besides GA defaults). Owner confirm, else go. needs a consent read (cross-subdomain cookie) or must skip GA.
- [OPEN, coordinate with SP05] App Check must NOT be enforced on Firestore (only on AI Logic), otherwise unauthenticated REST from `go.` returns 403. Add to SP05/SP06.
- [RESOLVED: ID found] GA4 ID `G-9NLS3NG63M`.
- [RESOLVED: ignore] Query/hash passthrough, see D2.
- [RESOLVED: page content] 404/410 are not HTTP statuses, see D1.
- Risk: ad-blockers block gtag.js/collect; redirect still happens, click uncounted (accepted in brief).
- Risk: Firestore REST cold latency adds ~100-300 ms before redirect; measure on phone; upgrade path Cloudflare Worker (brief).
- Risk: link-preview unfurlers show the `go.` page, not the target (accepted).
- [DEFERRED] Real 404 for root `/` via separate path; UTM passthrough; self-hosted gtag.

## Acceptance Criteria
- Node tests (`node --test tests/go/`) pass: `parseSlug` (case, trailing slash, encoded, `/a/b`, empty), `decodeLink` (string/null/timestamp expiresAt), `classify` (live, past, future, date-only boundary, `javascript:`/`data:`/relative/missing url, invalid date).
- Against Firestore emulator with SP01 rules loaded: unauthenticated REST `GET links/live` -> 200 with decodable fields; `links/missing` -> 404; collection list -> 403/denied.
- Manual (hosting emulator or deployed, live Firestore): `/live` redirects to target and DevTools shows `go_click` request to `google-analytics.com/g/collect` with `ep.slug`; `/LIVE/` same; `/missing` shows 404 text; `/expired` shows 410 text with the date; a link with `javascript:alert(1)` shows the misconfigured page and does not execute; `/` shows "No slug provided"; query `?x=1` not forwarded; blocking gtag.js still redirects in <~2 s; no CSP violations in console; JS disabled shows noscript text.
- `go` site returns `index.html` for any path with `no-cache`, CSP and `X-Robots-Tag` present; total page weight excluding gtag < 8 KB.
- `grep` of `go/` shows no Firebase SDK import and no inline `<script>` body.
