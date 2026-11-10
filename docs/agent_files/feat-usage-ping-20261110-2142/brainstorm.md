---
status: approved
summary: Anonymous usage pings from tejit-np-plugin and NGO Auto Mailer to one Cloudflare Worker + D1 at ping.tejitpabari.com, with a password-protected stats page.
date: 2026-11-10
---

# Usage ping: brainstorm brief

## TL;DR

Build one small Cloudflare Worker (`ping.tejitpabari.com`, code in `workers/usage-ping/` of cc-gateway) backed by D1. Both tools send fire-and-forget GET pings with a random per-person code and an org name. `/stats` (password-protected) shows funders and partners proof that real orgs use the tools. No person names or emails are collected. Spike first: confirm Claude web fetch accepts constructed URLs (query-string and path-style); the spike gates the plugin half. No opt-out: metrics always on, with a notice and Terms/Privacy links.

## Problem

Tejit builds free tools for nonprofits:

1. **tejit-np-plugin** (`/root/projects/tejit-np-plugin`): Claude plugin with skills `start`, `partner-event-finder`, `install-automation`, `share-feedback`. Runs mostly in the Claude web/desktop app: only web-fetch GET, no code execution. State lives in Claude memory notes plus a Drive folder `tejit-np-plugin` / `metadata.txt`.
2. **NGO Auto Mailer** (`/root/projects/tejit-np-auto`, folder `auto-emailer`): Google Apps Script web app, `executeAs: USER_ACCESSING`, client-driven per-row sending.

He wants anonymous usage stats and a dashboard to show funders/partners that real orgs use the tools. Audience: owner and people he shows it to. Losing some pings is fine (trends, not billing). One server must serve all current and future tools.

## Decision log

| Decision | Alternative rejected | Why | Who |
|---|---|---|---|
| Cloudflare Worker at `ping.tejitpabari.com`; DNS already on Cloudflare | Own server / Apps Script endpoint | Cheap, always on, free tier ample, same domain | owner |
| Code in cc-gateway under `workers/usage-ping/` | tejit-np-auto or a new repo | One shared home for all tools' infra | owner |
| Storage: Cloudflare D1 | Workers Analytics Engine | Analytics Engine keeps only 3 months; funders need longer history | Claude proposed, owner approved |
| Identity: random `u_` + 8 hex per person, plus normalized org (lowercase, spaces to `_`, trimmed, UTF-8) | Person names / emails | PII; counts of people and orgs are enough | owner |
| Org name mandatory in both tools | Optional org | Dashboard value depends on it | owner |
| Plugin stores org+uid in Claude memory note, fallback root Drive `metadata.txt`; regenerate/ask if both missing | Drive only / memory only | Memory is fast, Drive survives memory loss | owner |
| Script stores org+uid in Apps Script UserProperties; required org text box at top, auto-filled next time | Script properties / cookies | Per user, follows Google account, no extra scope | owner |
| Consent: plugin setup shows one line "This plugin collects basic anonymous usage metrics to help keep it free. Please review the Terms and Conditions." + link; script shows Terms · Privacy links at page bottom | Long onboarding copy now | Detailed wording is a separate later discussion | owner |
| TERMS.md + PRIVACY.md in both repos, plain language, owner "Tejit Pabari", contact via GitHub issues, not legal advice | Lawyer-drafted now | Fast, honest baseline | owner |
| Events are per batch, not per step; only `step_failed` carries step + reason code | Step-level pings | Less noise, less volume, no full exceptions | owner |
| Test vs prod via `mode` (plugin sample run = test; Send Test Email = test) | Separate endpoints | Simple filter in stats | owner |
| Generic catch-all: unknown keys go to one capped `extras` JSON column | Fixed schema | New fields need no server change | owner |
| Plugin helper = shared markdown recipe, not python | Python script | Web app cannot run code | owner |
| Script helper = `logUsage_(event, fields, extra)` using `UrlFetchApp.fetch(url, {muteHttpExceptions:true})` in try/catch; re-add scope `script.external_request` | Hide pings in client JS | Server-side call is silent; owner approved the scope; no redeploy yet so one re-auth covers security fixes + logging | owner |
| Worker answers `200 "ok"` text | 204 | Safer for Claude web fetch | Claude |
| `/stats` behind HTTP Basic auth (password = Worker secret); never returns raw rows | Public dashboard | Write-only for the public; public dashboard maybe later | owner |
| Spike first: dummy Worker + one web-app prompt | Build everything first | Cheapest way to kill the biggest risk | owner |
| Never show ping/log details to users (UI showing "fetched page" is fine) | Verbose logs | Zero user-visible noise | owner |
| No opt-out: consent is a notice-only line (plugin setup) + Terms/Privacy links (script footer); metrics always on | "Reply no tracking to opt out" | Owner rejected opt-out | owner |
| Spike gates the plugin half: test both query-string URL (`/ping?...`) and path-style URL (`/p/<tool_type>/<tool_name>/<event>/...?`) in the Claude web app; if both fail, revisit plugin pings with owner. Decide format after spike | Assume query-string works | Biggest risk; format depends on result | owner |
| Existing users: on next run they see the notice once and are asked for org once (plugin on version update; script org box empty and required). Normal flow otherwise unchanged | Re-onboard everyone | Minimal disruption | owner |
| Org duplicates ("Red Cross" vs "The Red Cross") accepted; owner merges by hand later via a small alias list in stats (build only when needed) | Fuzzy matching now | Not worth it at this scale | owner |

## Builder-check resolutions (Claude's calls)

1. Spike `test=1` is throwaway.
2. Distinct people/org counts are approximate (two devices / both tools give two uids; memory+Drive both missing gives new uid, org re-asked). Accepted, trends only.
3. Worker replaces email-like org values with `redacted`.
4. `/stats` excludes `mode=test` by default, with a toggle.
5. Worker never stores IP or user-agent (PRIVACY.md states so); stores country + UTC timestamp.
6. Unknown enum values become `other`; missing required fields (`tool_type`, `tool_name`, `event`) are not stored but still return 200 "ok"; unknown keys go to extras JSON (at most 20 keys, 1 KB, values at most 100 chars).
7. `n` = items in batch (plugin: orgs; script: emails attempted), plus `ok`/`fail` counts; Worker does not enforce n=ok+fail. Script sends only aggregate counts, never per-email.
8. Tab closed mid-send: that batch is not reported. Accepted.
9. `index.html` change in scope: client calls server `reportBatch_` at loop end/stop.
10. Plugin recipe: ping is a mandatory listed step in each skill at fixed points; uid format `u_` + 8 lowercase hex; single attempt, about 3s; never retry; never mention to user.
11. `/ping` unauthenticated; spam accepted.
12. One D1 table `events` (id, ts UTC, tool_type, tool_name, event, mode, v, org, uid, n, ok, fail, step, reason, country, extras JSON); schema + migrations in `workers/usage-ping/migrations`; wrangler deploy from this machine using `~/.cloudflare.env` (token + account id present); custom domain `ping.tejitpabari.com`; no retention purge for now.
13. `/stats`: Basic auth, user `admin`, secret `STATS_PASSWORD` (owner sets via `wrangler secret`); server-rendered HTML tables, no JS libs, mobile friendly; all-time + per-month.
14. `v`: plugin = `plugin.json` version; script = a `VERSION` constant in `code.gs`. `tool_name` strings: `start`, `partner-event-finder`, `install-automation`, `auto-emailer`.
15. Step names: fixed short list per tool, documented in the recipe / code (e.g. `setup`, `find_sources`, `collect_events`, `calendar`; script: `load_sheet`, `load_draft`, `send`).
16. TERMS.md / PRIVACY.md at each repo root; links = GitHub blob URLs on main.
17. Script scope re-add = manifest edit; users re-authorize once on the next redeploy (which also carries the merged security fixes).
18. Plugin release = version bump + CHANGELOG + dist per `docs/releasing.md`.
19. Worker tests with vitest + `@cloudflare/vitest-pool-workers` inside `workers/usage-ping` (own package.json, independent of the SvelteKit app).
20. Worker down/slow: tools ignore it.

## Design

**Ping (GET `/ping`)**: validate, cap lengths (100 chars per field, extras at most 1 KB and 20 keys), normalize org, insert row, return `200` text `ok`. CORS not needed. Server adds date/time and `request.cf.country`.

**Fields**: `tool_type` (plugin|script), `tool_name`, `event`, `mode` (test|prod), `v`, `org`, `uid`, `n`, `ok`, `fail`, `step`, `reason` (no_access|not_found|quota|bad_input|other). Any other key goes into `extras` JSON.

**Events**
- plugin: `setup_done` (start); one per `partner-event-finder` batch of orgs; `guide_started` with `x_automation` (install-automation); `step_failed` with step + reason.
- script: one per email send batch, reported once when the client loop finishes or stops; `step_failed` likewise.
- Test runs use `mode=test`.

**Plugin helper**: one shared recipe, e.g. `plugin/references/usage-ping.md` (or under `start/references`), describing URL build, required/optional/extra params, silent fire-and-forget. Never surface ping details to the user.

**Script helper**: `logUsage_` in `code.gs`, try/catch, `muteHttpExceptions`. The guide's permission table states the scope is used only for these pings.

**`/stats`**: Basic auth, HTML page: runs and items per tool per month, distinct orgs and uids, org list, countries, test vs prod, top failing steps.

**Delivery order**: spike (dummy Worker, owner fetches both `…/ping?tool_type=plugin&test=1` and a path-style `…/p/plugin/start/setup_done/...` URL in the Claude web app; format decided after the spike; if both fail, revisit plugin pings with owner) → Worker + D1 → plugin and script in parallel (separate branches/PRs per repo) → owner redeploys Apps Script once.

**Owner-only tasks**: Cloudflare API token + account id in `~/.cloudflare.env` (chmod 600); set the `/stats` password secret.

## Goals / non-goals / anti-goals

**Goals**
- Distinct org and person counts and batch volumes per tool over time.
- Zero user-visible noise.
- A failed or slow ping never affects the tool.

**Non-goals**
- Contacting users.
- Per-email or per-recipient data.
- Real-time alerts.
- Public dashboard (maybe later).
- Detailed onboarding copy.

**Anti-goals**
- Collecting person names, emails, or recipient data.
- Pings that slow or break a run.
- Users seeing technical logs.

## Open risks

| Risk | Cheapest test / mitigation |
|---|---|
| Claude web fetch refuses constructed URLs (query-string or path-style) | The spike tests both |
| Claude skips or forgets pings in long runs | Compare counts with known test runs |
| Spam / junk rows | Accept; filter by mode/uid in stats |
| D1 free-tier limits (100k writes/day) | Far above need |
| Apps Script UrlFetch quota (20k/day consumer) | Fine at this scale |
| Model-generated "random" code is not truly random | Acceptable; collisions negligible at this scale |
| Legal adequacy of Terms/Privacy | Have someone review if funders rely on them |
