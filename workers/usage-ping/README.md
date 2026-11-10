# usage-ping Worker

Cloudflare Worker + D1 at `ping.tejitpabari.com`. Anonymous usage pings in, a private stats page out.
Fully isolated from the SvelteKit app: own `package.json` and lockfile; never run `npm install` at the repo root for this.

Source of truth for design and the full contract table:
`docs/agent_files/feat-usage-ping-20261110-2142/01-usage-ping-worker/PRD.md`. This README is the operator summary.

## Routes

| Route | Behavior |
|---|---|
| `GET /ping` | Validate, normalize, store one row, **always** answer `200 ok` (`text/plain`, `Cache-Control: no-store`), valid or not. Never redirects. DB failure is logged and swallowed. HEAD: no body, nothing stored. URL longer than 2048 chars: `ok`, not stored. |
| `GET /robots.txt` | `User-agent: *` / `Allow: /ping`. Does not mention `/stats`. |
| `GET /stats` | Basic auth (user `admin`, password = secret `STATS_PASSWORD`). 401 with `WWW-Authenticate: Basic realm="stats"` on missing/wrong creds, 503 if the secret is unset (fail closed). Server-rendered HTML, no JS. `?test=1` includes test runs. |
| anything else | `404`, nothing stored. Non-GET is 404. |

## /ping contract

`GET https://ping.tejitpabari.com/ping?k=v&...`, values URL-encoded UTF-8, first value wins per key.
A row is stored only if `tool_type`, `tool_name` and `event` are all non-empty after normalization.

| Param | Required | Normalization |
|---|---|---|
| `tool_type` | yes | lowercase+trim; `plugin` or `script`; any other non-empty value becomes `other` |
| `tool_name` | yes | lowercase, trim, `[a-z0-9_-]`, max 50. Known: `start`, `partner-event-finder`, `install-automation`, `auto-emailer` (not enforced) |
| `event` | yes | lowercase, trim, `[a-z0-9_]`, max 50. Known: `setup_done`, `batch_done`, `guide_started`, `step_failed` |
| `mode` | no | `test` or `prod`; missing/unknown becomes `prod` |
| `v` | no | trim, max 20 chars |
| `org` | no | NFC, trim; contains `@` becomes `redacted`; else lowercase, whitespace runs become `_`, control chars stripped, max 100 |
| `uid` | no | must match `^u_[0-9a-f]{8}$`, else NULL |
| `origin` | no | `claude`, `google_script`, `gpt`, `gemini`, `grok`, `perplexity`, `other`; if missing/unknown derived from User-Agent (`claude-user` is `claude`, `google-apps-script` is `google_script`), else `other`. UA text is discarded |
| `n`, `ok`, `fail` | no | integer 0..5000, otherwise NULL |
| `step` | no | lowercase, `[a-z0-9_]`, max 50 |
| `reason` | no | `no_access`, `not_found`, `quota`, `bad_input`, `other`; unknown becomes `other`; omitted is NULL |
| `x_run` | no | run id for dedupe: lowercase, `[a-z0-9_-]`, max 40; stored in column `run`, never in extras |
| `t` | no | reserved cache-buster; ignored, not stored. Clients should add a random `t` |
| any other key | no | goes to `extras` JSON: key lowercased `[a-z0-9_]` max 30, value trimmed max 100, max 20 keys, <= 1024 bytes, `@` values become `redacted` |

Dedupe: unique `(uid, event, run)` where `run` is not null; inserts are `INSERT OR IGNORE`. Rows without `run` or `uid` are never deduped.
Server-derived and never client-supplied: `ts` (UTC ISO-8601). Clients sending `ts`, `id`, `country`, `client` have them dropped.
IP, User-Agent text and country are never stored. Clients must ignore body/status, never retry, use about a 3 s timeout.

## Stats hygiene

Tables count only known origins and `mode=prod` by default (the Origins table lists every origin). Orgs listed in `ORGS_EXCLUDE` (`src/config.js`, default `['tejit_test']`) are excluded everywhere. Headline "Active orgs" = distinct orgs with at least one prod `batch_done` or `guide_started`.

## Local dev and test

```bash
cd workers/usage-ping
npm ci
npm test          # vitest + @cloudflare/vitest-pool-workers (local D1, migrations auto-applied)
npm run dev       # wrangler dev (local); set STATS_PASSWORD in .dev.vars (git-ignored) to try /stats
```

Pinned: wrangler 3.114.17, vitest 3.0.9, @cloudflare/vitest-pool-workers 0.7.5.

## Deploy

Credentials come from `~/.cloudflare.env` (token: Scripts, Routes, Zone Read, D1 Edit). Run from `workers/usage-ping`. Order matters: the custom domain binds to one Worker, so the spike is deleted before the real deploy (seconds of downtime accepted).

```bash
npx wrangler d1 create usage-ping-db                      # paste database_id into wrangler.toml
npx wrangler d1 migrations apply usage-ping-db --remote
npx wrangler delete --name usage-ping-spike               # spike teardown 1: releases the domain
npx wrangler deploy
npx wrangler d1 delete usage-ping-spike-db                # spike teardown 2: remove spike database
```

Smoke tests (use `mode=test` and the excluded org so the data stays out of the stats):

```bash
curl -i 'https://ping.tejitpabari.com/ping?tool_type=plugin&tool_name=start&event=setup_done&org=tejit_test&mode=test'   # 200 ok
curl -i 'https://ping.tejitpabari.com/ping?tool_type=plugin&tool_name=start'                                             # 200 ok, not stored
curl -i https://ping.tejitpabari.com/robots.txt      # Allow: /ping, no mention of stats
curl -i https://ping.tejitpabari.com/.env            # 404
curl -i https://ping.tejitpabari.com/stats           # 503 until the secret is set, then 401
```

Confirm teardown with `npx wrangler deployments list --name usage-ping-spike` (should fail) and `npx wrangler d1 list`.

## Owner manual steps

1. Set the stats password (at least 24 random chars, e.g. `openssl rand -base64 24`): `npx wrangler secret put STATS_PASSWORD`. Until then `/stats` returns 503. Share it only with intended viewers.
2. Cloudflare dashboard: add a rate-limiting rule on `ping.tejitpabari.com`, path `/stats` (for example 10 requests/min per IP, action block) to blunt password guessing.
3. Edit `ORGS_EXCLUDE` in `src/config.js` to list your own test orgs, then redeploy.
