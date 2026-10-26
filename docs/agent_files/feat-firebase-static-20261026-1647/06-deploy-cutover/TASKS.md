---
status: draft
summary: Tasks to author docs/DEPLOY.md, smoke helpers, README link, run deploy/import/smoke steps, and post-retirement cleanup; owner console/DNS/VPS steps listed separately in order.
date: 2026-10-26
---
# Tasks: SP06 deploy-cutover
Source of truth: /root/projects/cc-gateway/.worktrees/feat/firebase-static/docs/agent_files/feat-firebase-static-20261026-1647/06-deploy-cutover/PRD.md. Agent work is mostly writing the runbook and running deploy/verify commands once the owner has done console steps. Tasks 4-8 are gated on owner steps (see the checklist at the end). Defects found in SP01-05 go back to those sub-projects, not fixed here.

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Write docs/DEPLOY.md runbook (Phases A-G) | SP01 T2, SP02 T3, SP04 T4 | todo |
| 2 | Smoke-test helper scripts | 1 | todo |
| 3 | README Deploy section link | 1, SP03 T10 | todo |
| 4 | Local gates and Firestore rules deploy | 1, SP01 T6, SP03 T10, SP04 T5, SP05 (all), Owner O1-O5 | todo |
| 5 | Data import run and count verification | 4, SP02 T5, Owner O6-O7 | todo |
| 6 | Hosting deploy and web.app smoke test | 2, 5, Owner O8-O9 | todo |
| 7 | Post-flip smoke test on custom domains | 6, Owner O10-O12 | todo |
| 8 | Retirement cleanup: content/ removal and README rows | 7, Owner O13-O15 | todo |

## Task 1 — Write docs/DEPLOY.md runbook (Phases A-G)
What it is: the durable, copy-pasteable runbook (Decision 1) that outlives the branch; SP03's README links to it.
What changes at a high level: new docs/DEPLOY.md with sections for owner console checklist A1-A11, deploy commands (rules, data, hosting, order per Decision 2/3), freeze and export steps, Cloudflare DNS steps (grey cloud, TTL 300, record old A values and proxy state for rollback), the 12-item smoke checklist, rollback (7-day window), and retirement. Every step has a verify command or observable. Includes the resolved notes: admin email tejitpabari99@gmail.com, App Check not enforced on Firestore, shared browser API key check (add referrers, never replace), start certificate provisioning a day ahead. No secrets or service-account paths committed beyond the documented out-of-repo location.
Done when: file exists, covers Phases A-G, each step has a verify, and no secret values appear.

## Task 2 — Smoke-test helper scripts
What it is: optional checkable helpers under scripts/smoke/ for the observable parts of Phase E and D6.
What changes at a high level: small shell scripts (no server code, no secrets) that check dig results for cc/go hostnames, curl status and headers (200 on cc deep link, go slug page, go 404/410 content text, "No slug provided"), TLS issuer and dates, and Firestore doc counts via a documented command. Hostname is a parameter so the same scripts run against *.web.app and custom domains. UI-dependent checks (sign-in, writes, AI rank, GA4 realtime) remain a manual checklist in DEPLOY.md.
Done when: scripts run against a given host and print pass/fail per check, and DEPLOY.md references them.

## Task 3 — README Deploy section link
What it is: repo README points to the runbook (Acceptance Criteria).
What changes at a high level: README Deploy section becomes a short (about 5 line) summary plus a link to docs/DEPLOY.md. Stale "Live Architecture" text is removed if SP03 T10 has not already done so.
Done when: README links docs/DEPLOY.md and no pm2/VPS deploy instructions remain.

## Task 4 — Local gates and Firestore rules deploy
What it is: Phase B steps 1-3. Rules go first so no UI is ever served against missing rules.
What changes at a high level: with a logged-in Firebase session (or owner-provided CI token outside the repo) and project tejitpabari-99 selected, run the local gates (clean install, rules tests, node tests, build), confirm the admin email in config and rules matches tejitpabari99@gmail.com, then deploy only Firestore rules. Record outputs in DEPLOY.md notes if useful.
Done when: all gates green and rules deploy succeeds; a follow-up dry-run deploy shows no diff.

## Task 5 — Data import run and count verification
What it is: Phase C steps 3-5 on this box (Decision 10: agent runs only if the owner places the key path).
What changes at a high level: after the owner supplies the VPS tarball, extract to a scratch dir, diff against repo content/, replace repo content/ with the VPS copy and commit as a sync commit, then run the SP02 migrate script in dry-run, review counts against the recorded VPS counts, then run with the confirm flag. Never rerun after DNS flip without explicit overwrite intent.
Done when: output prints the OK line for ideas, links and settings with matching counts, and ideas date is a string spot-check passes.

## Task 6 — Hosting deploy and web.app smoke test
What it is: Phase B steps 6-7 on live site IDs (Decision 3), before any DNS change.
What changes at a high level: deploy hosting for cc and go targets, then run the scripts from Task 2 against tejitpabari-cc.web.app and tejitpabari-go.web.app/<slug>, plus the owner-assisted UI items from the Phase E checklist. Findings go to a short pass/fail table; failures on tests 1-9 are routed back to the owning sub-project.
Done when: Phase E passes on web.app (or defects are filed to SP01-05) and the result is recorded for the owner before DNS flip.

## Task 7 — Post-flip smoke test on custom domains
What it is: Phase D6-D7 verification after the owner flips Cloudflare records.
What changes at a high level: run the Task 2 scripts and the Phase E checklist against cc.tejitpabari.com and go.tejitpabari.com, including DNS answers equal Firebase IPs, valid cert, and go_click visible in GA4 realtime (owner confirms). If tests 1-9 fail and are not fixable in about 30 minutes, report the rollback trigger to the owner (Phase F is owner-executed).
Done when: all acceptance checks for the custom domains pass, or a rollback recommendation is issued.

## Task 8 — Retirement cleanup: content/ removal and README rows
What it is: Phase G agent items, executed only after 7 clean days and owner OK.
What changes at a high level: remove repo content/ in a chore commit (keep archive/); update the /root/projects/README.md cc-gateway row to the static Firebase description with a pointer to docs/DEPLOY.md; adjust the linkedin-outreach-tool row to say it is no longer proxied behind cc-gateway and flag this to the owner; stop the local pm2 cc-gateway process on this box only with explicit owner approval.
Done when: content/ gone, both README rows updated, and stale local process handled per owner decision.

## Owner-only steps (from PRD Manual steps — not tasks for agents)
Do in this order; tasks interleaved where order matters.
1. O1 (A1) Firebase console: create hosting sites tejitpabari-cc and tejitpabari-go (if taken, tell implementer; only .firebaserc changes). Leave the default site alone.
2. O2 (A2) Create Firestore, native mode, production rules, location nam5 (permanent).
3. O3 (A3) Enable Google sign-in; add authorized domains tejitpabari-cc.web.app and cc.tejitpabari.com.
4. O4 (A4) Register Web app cc-gateway, copy firebaseConfig into src/lib/firebase-config.js (agent can commit it).
5. O5 (A5) Generate service-account key to ~/.secrets/tejitpabari-99.json, chmod 600, outside repo. Also run firebase login (or provide CI token outside repo). Now Task 4 can run.
6. O6 (Phase C1) Announce freeze: no edits on old site or new side until post-flip smoke passes.
7. O7 (Phase C2) On old VPS, tar content/, record idea count and sha256, scp to this box. Task 5 runs after this.
8. O8 (A6) Enable AI Logic with Gemini Developer API; note any Blaze prompt (fallback pre-approved with $5/mo budget, A10 if so).
9. O9 (A7-A9) App Check reCAPTCHA key and debug token; enforce App Check on AI Logic only, not Firestore; restrict browser API key referrers for cc, go, web.app hosts, firebaseapp.com, localhost. Check current referrers first since the key may be shared with the personal website: add, never replace. Then Task 6 runs. Confirm GA4 consent decision (A11).
10. O10 (D1-D4, a day before flip) Record current Cloudflare A values and proxy state for cc and go in DEPLOY.md; add custom domains in Firebase console; add TXT and ACME records in Cloudflare using the console values; wait for certs.
11. O11 (D5) Flip: edit A records to the Firebase IPs shown in console, DNS only (grey), TTL 300; remove stale AAAA.
12. O12 Confirm GA4 realtime go_click; Task 7 runs. If failing, execute Phase F rollback (restore old A values, orange, TTL Auto).
13. O13 (Phase G) After 7 clean days: stop and delete pm2 process on old VPS, keep a final content tarball in ~/backups/ for 30 days, cancel the VPS.
14. O14 Delete the service-account key in Google Cloud and rm ~/.secrets/tejitpabari-99.json; remove old .env secrets (GATEWAY_PASSWORD, SESSION_SECRET, ANTHROPIC_API_KEY) on both boxes; revoke the Anthropic key if unused elsewhere.
15. O15 Approve Task 8 (content/ removal, local pm2 stop on this box, optional ufw Cloudflare:80 rule removal).
