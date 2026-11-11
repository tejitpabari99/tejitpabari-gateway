---
status: draft
summary: 7 tasks to add anonymous server-side usage pings, a required Organization box, Terms/Privacy, guide updates and node tests to auto-emailer.
date: 2026-11-10
---
# Tasks: auto-emailer usage pings, org box, legal docs (SP3)
Source of truth: /root/projects/cc-gateway/.worktrees/feat/usage-ping/docs/agent_files/feat-usage-ping-20261110-2142/03-auto-emailer-usage-pings/PRD.md. Work happens in repo /root/projects/tejit-np-auto (branch `feat/usage-pings` off `main`), folder `auto-emailer/`. Depends on the SP1 `/ping` contract only (enums/params); no SP1 code needed. Every task is test-first with the node harness (fakes for `UrlFetchApp`, `PropertiesService`, `Utilities.getUuid` in `tests/helpers.js`). CI already exists (`.github/workflows/ci.yml` runs `node --test auto-emailer/tests/*.test.js` plus syntax/JSON checks on push and PR), so no CI task is needed; keep it green unchanged.

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Manifest scope, VERSION, test fakes | none | done |
| 2 | Safe `logUsage_` and reason mapping | 1 | done |
| 3 | Org + uid persistence and required guards | 2 | done |
| 4 | Server events: test, reportBatch, step_failed | 3 | done |
| 5 | Client: Organization box, gating, batch report | 4 | done |
| 6 | Footer notice, TERMS.md, PRIVACY.md | none | done |
| 7 | Installation guide and root README line | 6 | done |

## Task 1 — Manifest scope, VERSION, test fakes
What it is / what it means: Groundwork. The script gets permission to call out to the ping host, a version constant, and the shared fakes every later test needs. Decisions 14, 16 and the Manifest paragraph.
What changes at a high level: `appsscript.json` gains `script.external_request` (all prior scopes kept). `code.gs` gets `VERSION = "0.1.1"`. `tests/helpers.js` gains fake `UrlFetchApp` (records URLs and options, can be set to throw), fake `PropertiesService.getUserProperties()`, and deterministic `Utilities.getUuid`. The existing assertion in `security-server.test.js` that the scope is absent is flipped to require it.
Done when: the flipped test passes and checks all prior scopes plus JSON validity; a small test asserts `VERSION` equals `0.1.1`; existing tests still pass with the extended helpers.

## Task 2 — Safe `logUsage_` and reason mapping
What it is / what it means: The single PII firewall that sends pings. Decisions 2, 5, 14 and the `logUsage_` safety design.
What changes at a high level: `code.gs` gains `logUsage_(event, fields, extra)` and `classifyReason_(error)`. Event name validated; `fields` allowlist (mode, n/ok/fail clamped 0..5000, step, reason); `x_` extras limited to numbers/booleans/safe strings, anything with `@` dropped; `x_run` accepted if valid else server-random; org, uid, v, tool type/name and `origin=google_script` set in code; every key and value `encodeURIComponent`-ed; random `t`; `muteHttpExceptions:true`; whole body in try/catch with only a generic `console.warn`.
Done when: new `tests/usage-ping.test.js` proves URL prefix and fixed params (acceptance 1), org omitted when unset (R4), disallowed keys and `@` values dropped, no PII from user email/subject/sheet/recipient fakes in any URL, logs never contain the URL, fetch throwing returns normally (acceptance 2, 3), and reason mapping order for each enum.

## Task 3 — Org + uid persistence and required guards
What it is / what it means: Server side of the Organization box. Stored per Google user in UserProperties, server re-normalizes, uid created once. Decisions 6, 7, 8, 9 and R2.
What changes at a high level: `code.gs` gains `getUsageSettings()` (returns the saved org) and `saveOrganization(org)` (trim, collapse whitespace, strip control chars, 1-100 chars, reject `@`/empty with a clear message). uid is `u_` plus 8 lowercase hex, stored once, regenerated if malformed. `sendEmailBatch` and `sendTestEmail` throw "Organization name is required" when no org is stored; their signatures stay unchanged.
Done when: tests cover `'  Red   Cross '` stored as `Red Cross`, empty, `a@b.org`, over-100 handling, `getUsageSettings` round trip, uid stability across calls and regeneration of a malformed value, and both send fns throwing when org is unset (acceptance 4, 5).

## Task 4 — Server events: test, reportBatch, step_failed
What it is / what it means: Wire the three event types to `logUsage_`. Decisions 1, 3, 4, 10, 15, 17 and R3.
What changes at a high level: successful `sendTestEmail` fires one `batch_done mode=test n=1 ok=1 fail=0` with a server-made run id. New `reportBatch(ok, fail, stopped, runId)` recomputes `n`, clamps to 0..5000, forces `mode=prod`, adds `x_stopped=1` only when stopped, and falls back to a server run id if the client one is invalid. Catch blocks of the sheet, tab, draft and send functions fire one `step_failed` (step + classified reason) before rethrowing the original error. `sendSingleEmail` untouched.
Done when: tests assert the exact query strings from acceptance 6 (including `reportBatch(8,2,true,'abcd1234efgh')`, negative/garbage and above-5000 clamping), each step/reason pair on a failing call, the original error still thrown, `sendTestEmail` still returns `{success:true,...}` when fetch throws, and `sendSingleEmail` makes zero fetches.

## Task 5 — Client: Organization box, gating, batch report
What it is / what it means: The only visible change: a required Organization name box, plus a silent end-of-batch report. Decisions 2, 3, 7, 11 and R1.
What changes at a high level: `index.html` adds an unnumbered "Organization name" input with helper "Your organization's name, not your email." above step 1, pre-filled from `getUsageSettings` on load. Test Email and Send Emails validate (trim, 1-100, no `@`), alert in the existing style if invalid, otherwise save first and continue on success. The send loop makes one random run id at start and, on completion or the 5-error stop, calls `reportBatch` once (after UI reset, no handlers) with a skipped-excluded success counter; on-screen "Sent" text unchanged.
Done when: client tests using `loadIndexScript`/`makeRun` show pre-fill, no send/test server call without a valid org, `saveOrganization` called first, and `reportBatch` called exactly once for completion and for the stop with correct counts and run id (acceptance 7); existing UI tests still pass.

## Task 6 — Footer notice, TERMS.md, PRIVACY.md
What it is / what it means: Plain notice and legal pages; informing is enough, no opt-out. Decisions 12, 13 and R5.
What changes at a high level: `index.html` footer shows "Your personal details stay anonymous. We collect your organization name." plus "Terms · Privacy" links to the `main` GitHub blob URLs (`target="_blank" rel="noopener noreferrer"`). New root `TERMS.md` (free, as-is, using it means accepting usage counts, contact via GitHub issues, owner Tejit Pabari) and `PRIVACY.md` (SP1's plain list of collected items and the never-collected list, nothing else).
Done when: a UI test asserts the exact notice text and exact link URLs and attributes; a test (or CI-run check) asserts both files exist, carry the key list items and the never-list, and contain no deletion, hosting, retention, opt-out or funder text.

## Task 7 — Installation guide and root README line
What it is / what it means: Keep docs honest about the new behavior. R6 and the Docs paragraph.
What changes at a high level: `INSTALLATION_GUIDE.md` gets org-box wording in Step 5 with the `<!-- SCREENSHOT NEEDED: org-name-box -->` placeholder and italic "Picture coming soon", the new permissions-table row, a Privacy section replaced by a short accurate list linking PRIVACY.md/TERMS.md, and the "Updated November 2026" line as the what-changed note (organization box, anonymous usage counts, one extra permission); no re-authorization wording. Root `README.md` gets one line under the table about anonymous usage counts with Terms/Privacy links; the table and `Automations` heading stay untouched.
Done when: a docs test checks each guide item above, the absence of "does not send your data to the developer" and of re-authorization wording, and that the README Automations table block is byte-identical to before; full `node --test auto-emailer/tests/*.test.js` passes.

Closing note (owner-only, stays in the PRD): redeploy the Apps Script web app after SP1 `/ping` is live; merge the PR to `main` before redeploy so the Terms/Privacy links resolve.
