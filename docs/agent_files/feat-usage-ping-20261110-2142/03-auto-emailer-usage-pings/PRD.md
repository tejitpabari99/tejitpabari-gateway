---
status: draft
summary: auto-emailer sends anonymous batch/failure pings (org + random uid + counts) to ping.tejitpabari.com via server-side UrlFetchApp, adds a required Organization box, Terms/Privacy links, guide updates and node tests.
date: 2026-11-10
---
# PRD: auto-emailer usage pings, org box, legal docs (SP3)

Repo/branch: tejit-np-auto (GitHub tejitpabari99/tejit-np-auto), new branch off `main` e.g. `feat/usage-pings` · Depends on: SP1 `/ping` contract (Phase 1) · Owns: `auto-emailer/code.gs`, `auto-emailer/index.html`, `auto-emailer/appsscript.json`, `auto-emailer/INSTALLATION_GUIDE.md`, `auto-emailer/tests/*` (new `usage-ping.test.js`, edits to `helpers.js`, `security-server.test.js`), new `TERMS.md`, `PRIVACY.md` (repo root), one line in root `README.md`.

## TL;DR

Server-side `logUsage_()` in `code.gs` fires one GET to `https://ping.tejitpabari.com/ping` (UrlFetchApp, never throws) for: one `batch_done` per send batch (client reports aggregate counts once at loop end/stop via new `reportBatch`), one `batch_done mode=test n=1` per test email, and one `step_failed` per setup failure. A mandatory "Organization name" box at the top is saved to UserProperties with a random `u_xxxxxxxx` uid. Footer links Terms/Privacy. Never any email, name, recipient, subject or sheet name.

## Problem

Owner needs anonymous proof that real orgs use the auto-emailer. Apps Script runs as each user, so no central log exists. Today the tool sends nothing off-Google [verified: `grep -n UrlFetchApp code.gs` → 0]; `script.external_request` was removed in the security pass, and a test asserts its absence [verified: `tests/security-server.test.js:65`]. Owner has not redeployed since, so one re-authorization covers both.

## Goals / Non-Goals

Goals: per-batch counts tied to org + random uid; silent, failure-proof pings; no PII path to the ping; honest notice (Terms/Privacy/guide).

Non-goals: per-email/per-recipient data; reporting a batch whose tab is closed mid-send (accepted loss); opt-out (owner rejected); retries; client-side pings; org alias merging; changing existing function signatures; showing ping state to users; sending `Session.getActiveUser().getEmail()` anywhere.

## Requirements

**R1 Org box** — `index.html` top of the card, above step 1 (unnumbered so existing numbering stays): text input "Organization name" + helper line "Your organization's name, not your email. Used for anonymous usage counts (see Privacy)." Pre-filled on load from server. Trim, 1-100 chars, no `@`. Test Email and Send Emails are blocked (alert, same style as existing) until valid; first action of each is a save, then the real flow continues on its success.

**R2 Persistence** — server fn saves org to `PropertiesService.getUserProperties()` (per Google user, per script, no new scope). Server re-normalizes (never trusts client). uid created once (`u_` + 8 lowercase hex from `Utilities.getUuid()`), stored in UserProperties, reused forever; invalid stored value → regenerated.

**R3 Events** (SP1 enums/params; `tool_type=script`, `tool_name=auto-emailer`, `v=VERSION`, `org`, `uid`, random `t`):

| Event | When | Params |
|---|---|---|
| `batch_done` | client send loop ends or stops (5 consecutive errors) | `mode=prod`, `n=ok+fail`, `ok`, `fail`, `x_stopped=1` only if stopped |
| `batch_done` | `sendTestEmail` succeeds | `mode=test`, `n=1`, `ok=1`, `fail=0` |
| `step_failed` | setup-stage failure, once per failing server call | `step` ∈ `load_sheet`\|`load_tab`\|`load_draft`\|`send`, `reason` enum |

Per-email failures are NOT `step_failed`; they are only the `fail` count. Skipped rows (conditional column TRUE) are excluded from n/ok/fail.

**R4 Never blocks or breaks** — failures swallowed, no UI mention, no retry. Org missing at ping time → ping sent without `org`.

**R5 Legal** — footer "Terms · Privacy" (GitHub blob links on `main`, `target="_blank" rel="noopener noreferrer"`). `TERMS.md` + `PRIVACY.md` at repo root: plain language, owner Tejit Pabari, contact via GitHub issues, collected (copied exactly from SP1's canonical data list): tool version, event type, test-or-real flag, org name as typed, random code, counts, whether a send stopped early, error category, country, UTC time, kind of app (category only); never IP, raw user-agent text, emails, names, recipients, draft/sheet names; no opt-out; kept indefinitely; "not legal advice".

**R6 Guide/README** — see Architecture §Docs.

## Architecture

```
index.html ──google.script.run──► code.gs
  load: getUsageSettings()          → {org}            (pre-fill)
  test/send: saveOrganization(org)  → {org} → then sendTestEmail(...)/sendEmailBatch(...)  [signatures UNCHANGED]
  loop end/stop: reportBatch(ok, fail, stopped)   fire-and-forget, no handlers
code.gs
  logUsage_(event, fields, extra)  ──UrlFetchApp.fetch(url,{muteHttpExceptions:true})──► ping.tejitpabari.com/ping
  step_failed hooks: catch blocks of getRecentSheets/getPreviewData (load_sheet), getSheetTabs (load_tab),
     getGmailDrafts/getEmailPreview (load_draft), sendEmailBatch/sendTestEmail (send) — before the existing rethrow
```

**`logUsage_` safety design** (the PII firewall):
- Signature `logUsage_(event, fields, extra)`. `event` must match `^[a-z0-9_]{1,50}$` else no-op.
- `fields` is an **allowlist**: `mode` (test|prod), `n`/`ok`/`fail` (coerced to int 0..1,000,000, else dropped), `step` (local enum), `reason` (local enum, default `other`). Any other key dropped. Org, uid, v, tool_* come from code, never from caller.
- `extra` keys must match `^x_[a-z0-9_]{1,28}$`; values only numbers/booleans (stringified) or `[a-z0-9_]{1,30}` strings; anything containing `@` or not matching is dropped. Free text (error messages, names) cannot pass.
- URL built with `encodeURIComponent` on every key and value. Random `t` = 8 chars from `Utilities.getUuid()`. No custom User-Agent (default UA contains `Google-Apps-Script`, so SP1 derives `client=google-apps-script`).
- Whole body in try/catch; logs only `console.warn('usage ping failed')`, no URL, no message text (URL contains org).

**Reason mapping** `classifyReason_(error)`: tests lowercase message only locally; message is never sent. Order: `quota|too many times|limit exceeded` → `quota`; `permission|authoriz|access denied|not have access` → `no_access`; `not found|deleted|unable to open` → `not_found`; `invalid|required|exceeds|must be|no data` → `bad_input`; else `other`.

**Latency/quota**: no ping inside `sendSingleEmail` (per-email path untouched). One fetch per batch (async from the client, UI already reset before the call) plus one per test/failure (inline, ~100-300 ms). UrlFetchApp has no timeout option [verified: Apps Script docs, advanced params are method/headers/payload/muteHttpExceptions/etc.]; worst case a hung endpoint delays a test/failure response. Quota 20k fetches/day consumer, far above need.

**Client**: success and stop branches in `sendEmailsSequentially` call `google.script.run.reportBatch(reportOk, emailsFailed, stopped)` after the UI/button are reset. `reportOk` = successes excluding `result.skipped` (separate counter so on-screen "Sent" text is unchanged). Org value only ever assigned via `.value` (safe); any future HTML echo uses existing `escapeHtml`. `reportBatch` recomputes `n`, clamps ints, forces `mode=prod`.

**Server guards**: `sendEmailBatch`/`sendTestEmail` throw "Organization name is required" if stored org is missing (defence in depth for direct calls). Existing positional params untouched, so old/new client mix is not an issue (HTML and server ship together).

**Manifest**: add `https://www.googleapis.com/auth/script.external_request`; flip the existing assertion in `security-server.test.js:65` to require it (and keep the other scopes).

**Docs**: `INSTALLATION_GUIDE.md`: new step text in Step 5 (org box) + `<!-- SCREENSHOT NEEDED: org-name-box -->` placeholder with "Picture coming soon" italic; permissions table row "Connect to an external service" → "Only used to send anonymous usage counts to ping.tejitpabari.com. Never your emails, drafts or sheet content."; Privacy section: replace "does not send your data to the developer" with an accurate list (what is sent, what never is, no opt-out, kept indefinitely, link to PRIVACY.md/TERMS.md); update the italic "Updated November 2026" line as the What-changed line (organization box, anonymous usage counts, one extra permission, re-authorize once). Root `README.md`: one line under the table noting anonymous usage counts + links to Terms/Privacy (table format and heading `Automations` untouched, plugin parses it).

## Decisions

| # | Decision | Choice | Alternatives considered | Why |
|---|---|---|---|---|
| 1 | Test-email event | `batch_done mode=test n=1 ok=1 fail=0` | New `test_sent` event | SP1 already filters by `mode`; no stats change |
| 2 | Who pings | Server-side only (`logUsage_`); client only reports counts | Client `fetch` to Worker | Brief: silent; avoids CORS/CSP and user-visible network |
| 3 | Batch report | New `reportBatch(ok, fail, stopped)` called once | Ping from `sendEmailBatch` start | Only client knows final counts; start would overcount |
| 4 | Test/step_failed pings | Inline server-side | Extra client calls | No new client-callable surface; failures already caught server-side |
| 5 | Extras control | Allowlist fields + `x_` numeric/enum extras | Pass-through | Prevents accidental PII (error text, names) |
| 6 | Stored org form | Trimmed, whitespace-collapsed, no control chars, ≤100, no `@`; Worker lowercases/`_` | Store `red_cross` | Pre-fill shows what user typed; canonical form is SP1's |
| 7 | Required enforcement | Client blocks + server throws | Client only | Cheap defence in depth |
| 8 | Org with `@` | Rejected with message | Let Worker redact | Better UX; avoids useless `redacted` rows |
| 9 | uid race | No lock; last write wins | LockService | Counts are approximate by design (brief #2) |
| 10 | Skipped rows | Excluded from counts | Count as ok | `n` = emails attempted |
| 11 | Mid-send tab close | Not reported | Periodic partial pings | Accepted (brief #8); keeps one ping/batch |
| 12 | Legal links | GitHub blob on `main` | Hosted page | Brief #16 |

## Manual steps

- Owner: redeploy the Apps Script web app (new version) and re-authorize once (adds `script.external_request`; also applies security fixes). Not before SP1 `/ping` is live (pings fail silently until then, harmless).
- Owner: merge PR to `main` so Terms/Privacy blob URLs resolve before redeploy.

## Risks / Open Questions

- [RESOLVED: inline server-side, no per-email pings] latency on send path.
- [RESOLVED: Utilities.getUuid hex, 32 bits] collision negligible at this scale.
- [RESOLVED: accepted] Tab closed mid-send loses the batch; two browsers/accounts = two uids.
- [RESOLVED: `reportBatch` callable by any user from console; allowlist+clamping bounds it to self-spam] abuse.
- [RESOLVED: server-only, uses existing `escapeHtml` for any HTML echo] XSS from org value.
- [OPEN, non-blocking] Final wording of TERMS/PRIVACY (executor drafts per R5; owner reviews; not legal advice).
- [OPEN, non-blocking] `VERSION` initial value: proposed `"1.1.0"` (owner to confirm).
- [DEFERRED] Throttling duplicate `step_failed` bursts; Worker down → hung UrlFetch.
- Contract assumption: SP1 keeps `batch_done`, `step_failed`, `mode`, `reason` enums, `x_*` as extras, ignores `t`. If SP1 changes, update `logUsage_` constants only.

## Acceptance Criteria

1. Node tests (`node --test auto-emailer/tests/*.test.js`), using fake `UrlFetchApp`/`PropertiesService` (+`Utilities.getUuid`) in `helpers.js`, assert: URL starts `https://ping.tejitpabari.com/ping?`, contains `tool_type=script&tool_name=auto-emailer`, `v`, `uid` matching `^u_[0-9a-f]{8}$`, `t`, all values encoded; `muteHttpExceptions:true`.
2. No PII: for a run with user email, draft subject, sheet name, recipient addresses in fakes, no fetched URL contains any; disallowed `fields`/`extra` keys and values with `@` are dropped; `logs` never contain the URL.
3. `UrlFetchApp.fetch` throwing → `logUsage_` returns normally; failing `getSheetTabs` still throws its original error; `sendTestEmail` still returns `{success:true,...}`.
4. Org: `saveOrganization('  Red   Cross ')` stores `Red Cross`; empty, `a@b.org`, >100 chars (truncated/rejected per R1) handled; `getUsageSettings()` returns it; send/test throw "Organization name is required" when unset.
5. uid created once, same on second call, regenerated if stored value malformed.
6. Event tests: `sendTestEmail` → one `batch_done` `mode=test&n=1&ok=1&fail=0`; `reportBatch(8,2,true)` → `n=10&ok=8&fail=2&x_stopped=1&mode=prod`; `reportBatch(-5,'x')` clamped; setup failure → one `step_failed` with correct `step`/`reason`; `sendSingleEmail` makes zero fetches.
7. Client test (existing `loadIndexScript`/`makeRun`): loop completion and 5-error stop each call `reportBatch` exactly once with right counts (skipped excluded); Test/Send without org do not call server send fns; org input pre-filled from `getUsageSettings`.
8. `appsscript.json` contains `script.external_request` and all prior scopes; JSON valid; CI (`ci.yml`) green unchanged.
9. `index.html` footer has Terms and Privacy links to the exact `main` blob URLs; `TERMS.md`, `PRIVACY.md` exist with the R5 content; guide has org step, permission row, updated privacy section, what-changed line, org-box screenshot placeholder; README has one line and its Automations table is unchanged.
