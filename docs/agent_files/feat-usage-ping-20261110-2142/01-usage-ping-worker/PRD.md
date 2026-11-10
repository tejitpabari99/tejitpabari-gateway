---
status: draft
summary: Cloudflare Worker + D1 at ping.tejitpabari.com — public /ping ingest (the contract SP2/SP3 build on), robots.txt, Basic-auth /stats dashboard, tests, deploy and spike teardown.
date: 2026-11-10
---
# PRD: usage-ping Worker (SP1)

Repo/branch: cc-gateway, `feat/usage-ping` · Depends on: none (Phase 1) · Owns: `workers/usage-ping/**` (package.json, wrangler.toml, src/, migrations/, test/, README.md, .gitignore). Touches nothing in the SvelteKit app.

## TL;DR

One tiny Worker serves four routes: `GET /ping` (validate, normalize, insert one D1 row, always answer `200 ok`), `GET /robots.txt`, `GET /stats` (Basic auth, server-rendered HTML), everything else `404`. Only valid pings are stored. No IP or UA string is ever stored. SP2 (plugin) and SP3 (Apps Script) code against the contract table below.

## Problem

Owner needs anonymous usage proof (orgs, people, batches per tool) for funders. Spike showed: Claude web fetch reaches `/ping?...` and path URLs, fetches `/robots.txt` first, and scanners hit the domain within ~2 min (`/.env`, `/.git/HEAD`, `/backup.sql`). So the endpoint must be public and write-only, tolerant of bad input, and must not store junk. The spike Worker (`usage-ping-spike`, D1 `usage-ping-spike-db`) logs everything and exposes `/__hits`; it must be replaced and deleted.

## Goals / Non-Goals

Goals: stable documented `/ping` contract; junk-resistant ingest; private stats page that is safe against XSS/SQLi and works with zero data; tests; reproducible deploy.

Non-goals: path-style URLs (`/p/...`), rate limiting/WAF (deferred), retention purge, org alias merging, public dashboard, raw-row export, charts/JS libs, CORS, per-email data.

## Requirements

**R1 `/ping`** — see contract. Any `GET /ping` (valid or not) returns `200 text/plain "ok"` with `Cache-Control: no-store`; only rows passing validation are inserted. DB failure is swallowed (logged via `console.error`, observability on) and still returns `ok`.

**R2 `/robots.txt`** — `200 text/plain`: `User-agent: *`, `Allow: /ping`, `Disallow: /stats`. (Claude checks it before fetching; without it Claude may refuse.)

**R3 `/stats`** — Basic auth, user `admin`, password = secret `STATS_PASSWORD` (constant-time compare). Missing/wrong creds → `401` + `WWW-Authenticate: Basic realm="stats"`. Secret unset → `503` (fail closed, never open). Page (single HTML doc, inline CSS, no JS, viewport meta, tables in horizontally scrollable wrappers):
- Header: mode shown (`Production only` default; link toggles `?test=1` = include test runs). Generated-at UTC.
- Totals: events, distinct orgs, distinct uids, items (`SUM(n)`), first/last event.
- Per tool_name × month (`YYYY-MM`, newest first, last 24): batches (events with `event=batch_done`; `setup_done`/`guide_started` are not batches), items, ok, fail, distinct orgs, distinct uids. Plus an all-time row per tool.
- Org list: org, tools used, batches, items, first/last seen (top 200 by batches; shows `redacted` and `(none)` as-is).
- Countries: country, events, distinct orgs (top 50).
- Top failing steps: tool_name, step, reason, count (top 20, from `step_failed`).
- Zero data: every table renders a single "No data yet" row; totals show 0; never errors.
- Security headers: `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'; style-src 'unsafe-inline'`.

**R4 everything else** — `404` empty-ish body, nothing stored/logged to D1. Non-GET (except HEAD on `/ping`, `/robots.txt`: no body, nothing stored) → `404`.

### /ping contract (owned by SP1; SP2/SP3 build against this)

`GET https://ping.tejitpabari.com/ping?k=v&...` — values URL-encoded UTF-8. All params optional unless marked required. Parsing is first-value-wins per key.

| Param | Req | Normalization / validation | Stored as |
|---|---|---|---|
| `tool_type` | yes | lowercase+trim; enum `plugin`\|`script`; other non-empty value → `other`; empty/missing → NOT stored | `tool_type` |
| `tool_name` | yes | lowercase, trim, chars `[a-z0-9_-]`, max 50 (others stripped); empty after → NOT stored. Known: `start`, `partner-event-finder`, `install-automation`, `auto-emailer` (not enforced — new tools need no server change) | `tool_name` |
| `event` | yes | lowercase, trim, `[a-z0-9_]`, max 50; empty → NOT stored. Known: `setup_done`, `batch_done`, `guide_started`, `step_failed` (SP2/SP3 may define more; free-form by design) | `event` |
| `mode` | no | enum `test`\|`prod`; missing/unknown → `prod` | `mode` |
| `v` | no | trim, max 20 chars | `v` |
| `org` | no (tools require it) | NFC, trim; if contains `@` → `redacted`; else lowercase, whitespace runs → `_`, control chars stripped, max 100 | `org` (NULL if empty) |
| `uid` | no | must match `^u_[0-9a-f]{8}$`, else NULL (never store free text here) | `uid` |
| `n`, `ok`, `fail` | no | integer `0..1000000`; anything else → NULL. `n=ok+fail` not enforced | same |
| `step` | no | lowercase, `[a-z0-9_]`, max 50 | `step` |
| `reason` | no | enum `no_access`\|`not_found`\|`quota`\|`bad_input`\|`other`; unknown → `other` | `reason` |
| `t` | no | reserved cache-buster/nonce; ignored, not stored. Tools SHOULD add a random `t` so Claude's fetcher never serves a cached identical URL | — |
| any other key | no | → `extras` JSON: key lowercased `[a-z0-9_]` max 30; value trimmed max 100; max 20 keys; serialized ≤ 1024 B (excess keys dropped); email-like values (contain `@`) replaced with `redacted` | `extras` (NULL if none) |

Server-derived (never client-supplied; clients sending `ts`, `country`, `client`, `id` have them dropped, not stored in extras): `ts` = UTC ISO-8601 `YYYY-MM-DDTHH:MM:SS.sssZ`; `country` = `request.cf.country` (NULL if absent); `client` = from `User-Agent` (case-insensitive contains `claude-user` → `claude`; `google-apps-script` → `google-apps-script`; else `other`). UA string and IP are discarded, never logged to D1.

**Canonical data list for PRIVACY.md (SP2/SP3 copy this exactly):** tool and version, event type, test-or-real flag, organization name as typed (lowercased), random code, counts (items/ok/failed), failing step and reason category, automation chosen (plugin) / whether a send stopped early (script), country, UTC time, and which kind of app sent it (Claude, Google Apps Script, other: a category only). Never IP address or raw user-agent text, names, emails, recipients, partner lists, events, file/draft/sheet names or contents. Request URL > 2048 chars → `ok`, not stored.

Responses: `200` `ok` (`text/plain`) always for `/ping` GET; never a redirect (no http→https, www or trailing-slash hops on `/ping`). Clients must ignore body/status, never retry, ~3 s timeout.

## Architecture

```
Request → src/index.js router
  /ping       → ingest.js  parse+normalize (pure fn) → db.insertEvent (prepared INSERT, .bind)
  /robots.txt → static text
  /stats      → auth.js → stats.js (D1 .batch of aggregate SELECTs) → html.js (esc() on every dynamic value)
  *           → 404
```
- Pure functions (`normalizePing(url, uaHeader, country) → row|null`) isolated for unit tests.
- D1 table `events` (migration `migrations/0001_init.sql`): `id INTEGER PK AUTOINCREMENT, ts TEXT NOT NULL, tool_type TEXT NOT NULL, tool_name TEXT NOT NULL, event TEXT NOT NULL, mode TEXT NOT NULL, v TEXT, org TEXT, uid TEXT, n INTEGER, ok INTEGER, fail INTEGER, step TEXT, reason TEXT, country TEXT, client TEXT NOT NULL, extras TEXT`. Indexes: `(ts)`, `(mode, tool_name, ts)`, `(org)`.
- `wrangler.toml`: `name="usage-ping"`, `main="src/index.js"`, `compatibility_date`, `routes=[{pattern="ping.tejitpabari.com", custom_domain=true}]`, `[observability] enabled=true`, `[[d1_databases]] binding="DB", database_name="usage-ping-db", migrations_dir="migrations"`. Secret `STATS_PASSWORD` (not in file).
- Repo isolation `[verified: root package.json has no workspaces, scripts only vite dev/build/preview; vite.config.js = sveltekit() only, so vite/Svelte scan src/ only; jsconfig extends .svelte-kit tsconfig; no lint script; .gitignore already ignores node_modules and .wrangler at any depth]`. Worker folder therefore cannot break the SvelteKit build/PM2 deploy. Add `workers/usage-ping/.gitignore` (`.dev.vars`, `.wrangler`, `node_modules`). Never `npm install` at root for the Worker; own lockfile.
- Toolchain: wrangler pinned `3.114.17` (spike-proven deploy), vitest + `@cloudflare/vitest-pool-workers` with versions that support it, pinned exact. Plain JS (ESM), no framework.

### XSS / SQLi / abuse analysis
- `org`, `extras`, `step`, `country`, `tool_name`, `v` are attacker-controlled and rendered in `/stats` → one `esc()` (`& < > " '`) applied at the single table-cell helper; no string-concatenated HTML elsewhere; extras are never rendered raw (only counts/keys-count if shown); CSP blocks script even if escaping slipped. Stored-XSS test with `<script>`/`"onerror=` org is mandatory.
- All SQL via `prepare().bind()`; the only dynamic SQL fragment is the fixed `mode` filter chosen from two literals, never from input.
- Junk: scanner paths 404 and are not stored; `/ping` without required fields not stored; strict charsets/caps bound row size (~<2 KB). Targeted spam with valid fields is accepted (brief #11); owner can filter by `client`/`mode`. Limits: D1 free 100k writes/day, 5 GB — ample; `/stats` full-scans a small table (indexed) — fine at this scale; `D1 .batch` keeps stats to one round trip.

## Decisions

| # | Decision | Choice | Alternatives considered | Why |
|---|---|---|---|---|
| 1 | URL format | Query string `/ping?...` only | Path style | Owner OK; both worked in spike; one parser |
| 2 | Response | Always `200 ok` for `/ping`, even invalid | 400 on invalid | Brief #6/#4; avoids Claude fetch refusing/“error” noise |
| 3 | Invalid `uid` | Store NULL, keep row | Reject row | uid is optional; never store free text in it |
| 4 | `tool_type` | enum plugin/script/other | free text | Brief: unknown enums → other |
| 5 | `tool_name`/`event` | Sanitized free-form, not enum | Fixed enum | New tools need no server change |
| 6 | Email-like | any `@` in org/extras value → `redacted` | Regex for emails | Conservative PII safety; orgs rarely have `@` |
| 7 | `client` | derived from UA into column, UA discarded | Store UA | PRIVACY.md promise: no UA stored |
| 8 | Insert | awaited in try/catch | `ctx.waitUntil` | Simple, testable; D1 write is ms |
| 9 | `/stats` unset secret | 503 | open / 401 | Fail closed |
| 10 | Test filter | default prod, `?test=1` = include test | separate tabs | Brief #4; one toggle |
| 11 | Cutover | delete spike Worker first, then deploy real on same domain | override attach | Custom domain is bound to one Worker; brief downtime acceptable |
| 12 | Names | Worker `usage-ping`, D1 `usage-ping-db` | reuse spike names | Clean teardown of spike resources |
| 13 | `t` nonce | reserved, ignored | store in extras | Defeats fetch caching without polluting extras |

## Manual steps

- Owner: `cd workers/usage-ping && npx wrangler secret put STATS_PASSWORD` (types the password; until done `/stats` = 503). Share password only with intended viewers.
- Deploy (agent may run with `~/.cloudflare.env`; token has Scripts/Routes/Zone Read/D1 Edit): `wrangler d1 create usage-ping-db` (paste id into wrangler.toml) → `wrangler d1 migrations apply usage-ping-db --remote` → `wrangler delete --name usage-ping-spike` (releases domain) → `wrangler deploy` → `wrangler d1 delete usage-ping-spike-db` → smoke tests with curl.

## Risks / Open Questions

- [RESOLVED: pin wrangler 3.114.17; builder picks vitest/pool-workers versions that support it, verifies at install] vitest-pool-workers vs wrangler 3 compatibility. Fallback if incompatible: unit-test pure functions in plain vitest + manual `wrangler dev` smoke.
- [RESOLVED: spike data discarded] Spike rows are throwaway; spike `/__hits` removed with the Worker.
- [RESOLVED: accepted] Cutover causes seconds of downtime on the domain; no real clients exist yet.
- [RESOLVED: `t` reserved param] Claude fetch may cache identical URLs; SP2 recipe should add random `t`. SP2 owns that wording.
- [DEFERRED] Rate limiting / Cloudflare WAF rule if spam appears; retention purge; org alias list; public dashboard.
- [DEFERRED] Claude Code cloud sessions are blocked by environment allowlist — accepted, not target.
- [OPEN] none blocking tasks.

## Acceptance Criteria

1. `curl 'https://ping.tejitpabari.com/ping?tool_type=plugin&tool_name=start&event=setup_done&org=Red%20Cross&uid=u_0a1b2c3d&mode=test'` → `200 ok`; D1 row has `org=red_cross`, `client=other`, UTC `ts`, no UA/IP anywhere.
2. Missing `event` → `200 ok`, zero rows added. `org=a@b.com` → stored `redacted`. `uid=notvalid` → NULL. `tool_type=foo` → `other`; `reason=zzz` → `other`; 30 extra keys → ≤20 kept, JSON ≤1 KB.
3. UA `Claude-User/1.0` → `client=claude`; `Google-Apps-Script` → `google-apps-script`.
4. `/.env`, `/.git/HEAD`, `/backup.sql`, `/__hits`, POST `/ping` → 404, nothing stored. `/robots.txt` allows `/ping`.
5. `/stats` without/with wrong password → 401; secret unset → 503; correct → 200 HTML, test rows hidden unless `?test=1`.
6. Org `<script>alert(1)</script>` and `"><img onerror=x>` appear escaped in `/stats` (no raw `<`); SQL-ish values (`'; DROP TABLE events;--`) stored literally, table intact.
7. Empty DB → `/stats` 200 with "No data yet" rows, no exception.
8. Vitest suite (normalizer units, ingest/stats/auth integration via pool-workers, XSS, zero-data) passes; `workers/usage-ping/README.md` documents contract, deploy, secret, teardown.
9. Root `npm run build` in cc-gateway still succeeds unchanged; spike Worker and `usage-ping-spike-db` no longer exist (`wrangler deployments`/`d1 list` confirm).
