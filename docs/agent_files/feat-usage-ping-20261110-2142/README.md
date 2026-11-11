---
status: draft
summary: Index for usage-ping work: Worker + D1 at ping.tejitpabari.com (SP1), plugin pings (SP2), auto-emailer pings (SP3).
date: 2026-11-10
---
# feat/usage-ping: index

Anonymous usage pings from tejit-np-plugin and NGO Auto Mailer to one Cloudflare Worker + D1, with a password-protected `/stats` page. Brief: [brainstorm.md](brainstorm.md).

## Sub-projects

| # | Name | Repo / branch | Phase | Depends on | PRD | Status |
|---|---|---|---|---|---|---|
| 01 | usage-ping-worker | cc-gateway, `feat/usage-ping` (`workers/usage-ping/`) | 1 | none | [PRD](01-usage-ping-worker/PRD.md) | draft |
| 02 | plugin-usage-pings | `/root/projects/tejit-np-plugin`, new branch off `main` | 2 | SP1 contract (ship after SP1 live) | [PRD](02-plugin-usage-pings/PRD.md) | draft |
| 03 | auto-emailer-usage-pings | `/root/projects/tejit-np-auto`, `feat/usage-pings` off `main` | 2 | SP1 contract | [PRD](03-auto-emailer-usage-pings/PRD.md) | draft |

## Dependency graph

```
SP1 Worker (contract owner)
  |-- SP2 plugin   (build parallel after SP1 contract; merge/ship after SP1 live)
  `-- SP3 script   (same; owner redeploys Apps Script after SP1 live)
```
SP2 and SP3 touch different repos, so run in parallel (max 2 agents).

## Locked decisions (short)

- Worker `ping.tejitpabari.com`, D1, code in `workers/usage-ping/`; query-string `/ping` only; always `200 ok`.
Theme: keep everything basic, minimal user friction, informing users is enough, no PII.

- Worker `ping.tejitpabari.com`, D1, code in `workers/usage-ping/`; query-string `/ping` only; always `200 ok`.
- Identity: org (mandatory, normalized) + `u_` + 8 hex uid; no names/emails; `@` in org: client rejects/re-asks, Worker redacts. Plugin uid from a tiny Python snippet (fallback: model makes up 8 hex); no `/new` endpoint.
- Consent copy (plugin setup + script footer): "Your personal details stay anonymous. We collect your organization name." + Terms link. No opt-out. PRIVACY.md = plain list of what is collected, nothing else (no deletion process).
- Funder headline = active orgs (>= 1 prod `batch_done`/`guide_started`), not people; uids still stored.
- Per-batch events; `step_failed` for setup failures: plugin sends event + `step` only (max one per run), script also sends `reason`; `mode=test` for sample/test runs.
- `origin` field (claude, google_script, gpt, gemini, grok, perplexity, other) replaces the derived `client` column; tools send it, Worker falls back to UA, else `other`.
- Country dropped entirely. Never store IP/UA text.
- Invisible fixes: n/ok/fail cap 5,000; `x_run` dedupe (real `run` column, unique `(uid,event,run)`, INSERT OR IGNORE); `ORGS_EXCLUDE` in `/stats`; stats count known origins + prod only by default.
- `/stats`: Basic auth `admin` + secret `STATS_PASSWORD` (>= 24 random chars), never raw rows; robots.txt silent about it; Cloudflare rate-limit rule (manual).
- No install tip for Claude Code; blocked address / permission prompt is ignored silently.
- Plugin 0.3.0; script `VERSION = "0.1.1"`, re-adds `script.external_request`.
- Real-world checks (plans, live script) are done by the owner, not in PRD acceptance criteria.

## /ping contract

Owned by SP1: [01-usage-ping-worker/PRD.md](01-usage-ping-worker/PRD.md), section "/ping contract". SP2/SP3 build against it. Canonical PRIVACY data list lives there too. Updated 2026-11-10 for owner decisions (origin, x_run, no country/reason in plugin): consistent across SP1-SP3.

## Remaining [OPEN] items / risks

- None blocking. Former opens resolved: install tip [RESOLVED: no tip, ignore silently]; script `VERSION` [RESOLVED: "0.1.1"]; TERMS/PRIVACY wording [RESOLVED: owner's notice copy, plain list].
- Risks accepted: models may skip pings (compare to known test runs); spam rows accepted; Terms/Privacy not legally reviewed; hung UrlFetch if Worker down; rate limiting/WAF on `/ping` deferred.

## Owner manual steps

1. `cd workers/usage-ping && npx wrangler secret put STATS_PASSWORD` (>= 24 random chars; until set, `/stats` = 503).
2. Cloudflare dashboard: add a rate-limit rule for `/stats` on `ping.tejitpabari.com`.
3. Edit `ORGS_EXCLUDE` in `workers/usage-ping/src/config.js` with your test orgs.
4. Redeploy Apps Script web app (new version), after SP1 is live and SP3 merged.
5. Review Terms/Privacy wording in both repos; merge PRs to `main` so blob URLs resolve.
6. Merge SP2 only after SP1 is live; rebuild plugin dist/marketplace.
7. Do the real-world checks yourself (plugin on your plans/Claude Code/Gemini CLI, live script).
