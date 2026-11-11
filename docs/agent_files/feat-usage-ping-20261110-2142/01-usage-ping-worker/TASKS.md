---
status: draft
summary: Tasks for the usage-ping Worker (SP1): scaffold, normalizer, ingest routes, auth + stats page, README, CI, deploy and spike teardown.
date: 2026-11-10
---
# Tasks: usage-ping Worker (SP1)
Source of truth: /root/projects/cc-gateway/.worktrees/feat/usage-ping/docs/agent_files/feat-usage-ping-20261110-2142/01-usage-ping-worker/PRD.md. All code lives in `workers/usage-ping/` (own package.json and lockfile); nothing in the SvelteKit app changes. No `[OPEN]` items in the PRD. `.github/workflows/` does not exist in the repo, so a CI task is included (Task 7).

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Scaffold, toolchain, D1 schema | none | done |
| 2 | Ping normalizer (pure) + unit tests | 1 | done |
| 3 | Router, /ping ingest, robots, 404 | 1, 2 | done |
| 4 | Basic auth + stats queries | 3 | done |
| 5 | Stats HTML page, escaping, zero-data | 4 | done |
| 6 | Worker README | 5 | done |
| 7 | CI workflow scoped to workers/usage-ping | 1 | done |
| 8 | Deploy, smoke test, spike teardown | 5, 6, 7 | done |

## Task 1 — Scaffold, toolchain, D1 schema
What it is / what it means: The empty, isolated Worker package that everything else builds on (PRD Architecture; Decisions 12, 14, 16).
What changes at a high level: New `workers/usage-ping/` with its own package.json and lockfile (never install at repo root), wrangler pinned 3.114.17, vitest plus pool-workers at exact versions that work with it (verify at install; fallback per PRD risk: plain vitest for pure functions), its own `.gitignore` (`.dev.vars`, `.wrangler`, `node_modules`), `wrangler.toml` (name `usage-ping`, custom domain route, observability on, D1 binding `DB` with `usage-ping-db`; database id placeholder until deploy), a stub entry, and migration `0001_init.sql` with the `events` table (no `country`/`client` columns), the three indexes and the partial unique index `events_dedupe`.
Done when: `npm test` in the folder runs and passes a schema test that applies the migration in the test pool and asserts the table columns, the absence of `country`/`client`, and that inserting a duplicate `(uid, event, run)` with non-null run is rejected while null-run duplicates are allowed. Root `npm run build` still succeeds unchanged (AC 9, first half).

## Task 2 — Ping normalizer (pure) + unit tests
What it is / what it means: The pure function `normalizePing(url, uaHeader) -> row|null` implementing the whole /ping contract table (Decisions 3-7, 13, 17).
What changes at a high level: Parsing and normalization module with first-value-wins params; required-field handling (missing tool_type/tool_name/event after sanitizing returns null); enums with fallbacks (`tool_type`, `mode`, `reason`, `origin` with UA derivation then `other`); org normalization (NFC, `@` becomes `redacted`, lowercase, whitespace to `_`, control chars stripped, max 100); uid pattern else NULL; n/ok/fail 0..5000 else NULL; step, v, x_run to `run`; `t` ignored; unknown keys to capped `extras` (20 keys, 1024 B, `@` values redacted); client-supplied `ts`, `id`, `country`, `client` dropped; server UTC ISO `ts`; URL over 2048 chars returns null; UA text never in the row.
Done when: unit tests cover every contract row and AC 1-3 and 5a cases (org `Red Cross` -> `red_cross`, `a@b.com` -> `redacted`, `uid=notvalid` -> NULL, `tool_type=foo` -> `other`, `reason=zzz` -> `other`, `n=999999` -> NULL, 30 extra keys -> at most 20 and JSON at most 1 KB, origin enum/UA/`other` fallbacks, `x_run` in `run` and not in extras, dropped reserved keys, over-long URL, `t` not stored) and all pass.

## Task 3 — Router, /ping ingest, robots, 404
What it is / what it means: The Worker entry that serves `/ping`, `/robots.txt` and 404 for everything else, with the D1 insert (R1, R2, R4; Decisions 1, 2, 8, 16).
What changes at a high level: Router in the entry module; db helper doing a prepared `INSERT OR IGNORE` with `.bind`, awaited in try/catch (failures logged with `console.error`, still `ok`); `/ping` GET always returns 200 `text/plain` `ok` with `Cache-Control: no-store` and never redirects; HEAD on `/ping` and `/robots.txt` returns no body and stores nothing; `/robots.txt` allows `/ping` and never mentions `/stats`; any other path or non-GET returns 404 and stores nothing.
Done when: integration tests (pool-workers) prove AC 1, 2, 4, 5a: valid ping stores one row with no UA/IP/country anywhere; missing `event` returns `ok` with zero rows added; `/.env`, `/.git/HEAD`, `/backup.sql`, `/__hits` and POST `/ping` return 404 with nothing stored; robots.txt content check; HEAD behavior; same uid+event+x_run twice gives one row and two `ok` responses, while the same without `x_run` gives two rows; a forced DB failure still returns `ok`; SQL-ish org (`'; DROP TABLE events;--`) is stored literally and the table survives.

## Task 4 — Basic auth + stats queries
What it is / what it means: Access control and the aggregate data layer for `/stats` (R3, Decisions 9, 10, 15, 18, 19), without rendering yet.
What changes at a high level: Auth module (user `admin`, password from secret `STATS_PASSWORD`, constant-time compare; missing/wrong creds give 401 with `WWW-Authenticate: Basic realm="stats"`; unset secret gives 503, fail closed). `src/config.js` with `ORGS_EXCLUDE` defaulting to `['tejit_test']`. Stats module running one D1 `.batch` of aggregate SELECTs, all via `prepare().bind()`, with the only dynamic fragment being the fixed mode filter chosen from two literals: totals, active orgs (headline, plus per month, from prod `batch_done`/`guide_started`), per tool x month (last 24, plus all-time per tool; batches = `batch_done` events), org list (top 200), origins (all origins), top failing steps (top 20). Everything except the origins table counts only known origins, excludes `ORGS_EXCLUDE`, and defaults to `mode=prod` (`?test=1` includes test).
Done when: tests prove AC 5 (401 without/with wrong password, 503 when the secret is unset, authenticated request reaches the stats handler) and AC 5b with seeded data (origin `other`, `mode=test`, excluded org, and `setup_done`-only orgs are not counted as active; test rows included only with `?test=1`), plus correct per-month and per-tool aggregates and a zero-data run that returns empty result sets without throwing.

## Task 5 — Stats HTML page, escaping, zero-data
What it is / what it means: The server-rendered `/stats` page built from the Task 4 data (R3 page spec, XSS analysis).
What changes at a high level: HTML module with a single `esc()` (`& < > " '`) applied in the one table-cell helper, no string-concatenated HTML elsewhere, extras never rendered raw. Single document, inline CSS, no JS, viewport meta, tables in horizontally scrollable wrappers. Header shows mode (`Production only` default with `?test=1` toggle link) and generated-at UTC; big Active orgs headline plus per-month; totals; per tool x month and all-time rows; org list; origins; top failing steps. Every table shows one "No data yet" row when empty. Response headers: `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'; style-src 'unsafe-inline'`.
Done when: tests prove AC 6 and 7: orgs `<script>alert(1)</script>` and `"><img onerror=x>` appear escaped with no raw `<` from data, SQL-ish values leave the table intact, an empty DB returns 200 with "No data yet" rows and zeros, all five security headers are present, the toggle link and mode label are correct, and the headline value matches seeded data.

## Task 6 — Worker README
What it is / what it means: The operator and integrator doc required by AC 8, inside the Worker folder only.
What changes at a high level: `workers/usage-ping/README.md` documenting the /ping contract (pointing at the PRD table as the source and listing params, normalization and the always-`ok` rule), local dev and test commands, deploy steps (D1 create, migrations, cutover order, deploy, smoke tests), the manual owner steps (STATS_PASSWORD secret, rate-limit rule, editing `ORGS_EXCLUDE`), and spike teardown notes.
Done when: README exists, covers every item above, and a check (grep or a small test) confirms it mentions each contract param, `STATS_PASSWORD`, the migration command and the spike teardown commands; existing test suite still passes.

## Task 7 — CI workflow scoped to workers/usage-ping
What it is / what it means: The repo has no `.github/workflows/` at all, so nothing runs the Worker's tests on push or PR (CI default).
What changes at a high level: New `.github/workflows/` workflow (e.g. `usage-ping-ci.yml`) triggered on push and pull_request with a path filter on `workers/usage-ping/**` and the workflow file itself; uses `working-directory: workers/usage-ping`, Node setup with npm cache keyed on that folder's lockfile, `npm ci`, then `npm test`. No deploy, no secrets, no root-level install.
Done when: the workflow file is valid YAML (parse check in a local test or lint), references only the scoped path filter and working directory, and `npm ci && npm test` run exactly as the workflow does passes locally from `workers/usage-ping`. (First green run is observed later in dev-ship.)

## Task 8 — Deploy, smoke test, spike teardown
What it is / what it means: Make the real Worker live on `ping.tejitpabari.com` and remove the spike (Decisions 11, 12; Manual steps deploy list; AC 9). The agent may use credentials from `~/.cloudflare.env`.
What changes at a high level: Run in this order from `workers/usage-ping`: `wrangler d1 create usage-ping-db` and paste the id into `wrangler.toml`; `wrangler d1 migrations apply usage-ping-db --remote`; `wrangler delete --name usage-ping-spike` (releases the domain; brief downtime accepted); `wrangler deploy`; `wrangler d1 delete usage-ping-spike-db`; then curl smoke tests against the live domain. Record the real database id in the committed `wrangler.toml`. Do not set `STATS_PASSWORD` (owner step), so `/stats` is expected to return 503 until the owner sets it.
Done when: curl proves live `/ping` valid request returns `ok`, a `/ping` without `event` returns `ok`, `/robots.txt` allows `/ping` without `stats`, `/.env` and `/__hits` return 404, `/stats` returns 503 (secret unset) or 401 if already set; a remote D1 query shows the valid ping row and no row for the invalid one (test rows from smoke tests deleted afterwards or using `mode=test` with the excluded test org); `wrangler deployments`/`d1 list` confirm the spike Worker and `usage-ping-spike-db` no longer exist; root `npm run build` still succeeds; the worker test suite passes.

## Manual notes (owner only, not tasks)
- `cd workers/usage-ping && npx wrangler secret put STATS_PASSWORD` with >= 24 random chars (e.g. `openssl rand -base64 24`); until set, `/stats` = 503.
- Cloudflare dashboard: rate-limit rule on `ping.tejitpabari.com` path `/stats` (e.g. 10 requests/min per IP, block).
- Edit `ORGS_EXCLUDE` in `src/config.js` to list own test orgs.
