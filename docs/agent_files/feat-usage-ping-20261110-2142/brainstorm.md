---
status: approved
summary: Anonymous usage pings from tejit-np-plugin and NGO Auto Mailer to one Cloudflare Worker + D1 at ping.tejitpabari.com, with a password-protected stats page.
date: 2026-11-10
---

# Usage ping: brainstorm brief

## TL;DR

Build one small Cloudflare Worker (`ping.tejitpabari.com`, code in `workers/usage-ping/` of cc-gateway) backed by D1. Both tools send fire-and-forget GET pings with a random per-person code and an org name. `/stats` (password-protected) shows funders and partners proof that real orgs use the tools. No person names or emails are collected. Spike first: confirm Claude web fetch accepts constructed query-string URLs.

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

**Delivery order**: spike (dummy Worker, owner fetches `…/ping?tool_type=plugin&test=1` in the Claude web app) → Worker + D1 → plugin and script in parallel (separate branches/PRs per repo) → owner redeploys Apps Script once.

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
| Claude web fetch refuses constructed URLs with query strings | The spike |
| Claude skips or forgets pings in long runs | Compare counts with known test runs |
| Spam / junk rows | Accept; filter by mode/uid in stats |
| D1 free-tier limits (100k writes/day) | Far above need |
| Apps Script UrlFetch quota (20k/day consumer) | Fine at this scale |
| Model-generated "random" code is not truly random | Acceptable; collisions negligible at this scale |
| Legal adequacy of Terms/Privacy | Have someone review if funders rely on them |
