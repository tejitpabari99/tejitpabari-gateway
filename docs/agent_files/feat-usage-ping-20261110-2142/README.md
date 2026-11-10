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
- Identity: org (mandatory, normalized) + `u_` + 8 hex uid; no names/emails; `@` in org: client rejects/re-asks, Worker redacts.
- Per-batch events; `step_failed` only for setup failures; `mode=test` for sample/test runs.
- No opt-out; notice + Terms/Privacy links; TERMS.md/PRIVACY.md in both repos.
- `/stats`: Basic auth `admin` + secret `STATS_PASSWORD`, prod only by default, never raw rows.
- Never store IP/UA text (only derived `client` category, country, UTC ts).
- Plugin 0.3.0; script re-adds `script.external_request`.

## /ping contract

Owned by SP1: [01-usage-ping-worker/PRD.md](01-usage-ping-worker/PRD.md), section "/ping contract". SP2/SP3 build against it. Canonical PRIVACY data list lives there too. Cross-check done 2026-11-10: consistent.

## Remaining [OPEN] items / risks

- SP1: none blocking.
- SP2: Claude Code CLI users may get a visible fetch-permission prompt; owner decides on a `docs/install.md` tip.
- SP3: final TERMS/PRIVACY wording (owner reviews); `VERSION` initial value `"1.1.0"` (owner confirms).
- Cross-cutting: models may skip pings (compare to known test runs); spam rows accepted; Terms/Privacy not legally reviewed; hung UrlFetch if Worker down; rate limiting/WAF deferred.

## Owner manual steps

1. `cd workers/usage-ping && npx wrangler secret put STATS_PASSWORD` (until set, `/stats` = 503).
2. Redeploy Apps Script web app (new version) and re-authorize once, after SP1 is live and SP3 merged.
3. Review Terms/Privacy wording in both repos; merge PRs to `main` so blob URLs resolve.
4. Merge SP2 only after SP1 is live; rebuild plugin dist/marketplace.
