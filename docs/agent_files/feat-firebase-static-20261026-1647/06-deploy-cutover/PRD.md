---
status: draft
summary: Ordered owner checklist, deploy runbook, data freeze, Cloudflare DNS cutover, smoke tests, rollback and VPS retirement for moving cc-gateway to Firebase Hosting.
date: 2026-10-26
---
# PRD: SP06 deploy-cutover
Repo/branch: cc-gateway · `feat/firebase-static` · Depends on: SP01–SP05 · Owns: `docs/DEPLOY.md` (the runbook, new), `scripts/smoke/` (optional checkable helpers), README "Deploy" link, `/root/projects/README.md` cc-gateway row (outside repo, owner-approved edit)

## TL;DR
Mostly a human runbook. Order: console setup -> rules -> data import -> hosting deploy to preview channels -> smoke test on `*.web.app` -> Cloudflare DNS flip -> post-flip smoke -> keep old VPS N days as rollback -> retire. Final runbook lives at `docs/DEPLOY.md`; SP03's README links there.

## Problem
Five sub-projects produce code but nothing is live. The old site is on an unverified VPS (not this box) holding the source-of-truth data `[verified: README.md "Live Architecture (unverified…)"; /root/projects/README.md cc-gateway row]`. Cutover must lose no data, have a fast rollback, and keep guest gating correct from the first request.

## Goals / Non-Goals
- Goals: zero data loss; ordered, copy-pasteable checklist; staged verification before DNS; rollback in minutes; old infra retired deliberately.
- Non-goals: CI/CD pipeline (manual `firebase deploy`, [DEFERRED]); code changes in SP01–05 (defects found here go back to those SPs); post-launch Firestore backup (SP02 deferred item).

## Requirements
- `docs/DEPLOY.md` contains: owner checklist, deploy commands, freeze/migration steps, DNS steps, smoke tests, rollback, retirement. Each step has a verify command or observable.
- No step requires server code or a secret in the repo. Service-account key stays outside the repo and is deleted after cutover.
- Old site stays reachable by raw origin until retirement so rollback is a DNS-only change.

## Architecture
Static pieces only. Sites: `tejitpabari-cc` (target `cc`, `build/`), `tejitpabari-go` (target `go`, `go/`) in project `tejitpabari-99` `[SP01: .firebaserc]`. Data: Firestore `ideas`, `links`, `settings/main`. Website's apex/www are on the default site, untouched `[verified: /root/projects/tejitpabari/firebase.json is a separate project dir]`.

### Phase A — Owner console checklist (do in this order; items marked * are prerequisites of later phases)
| # | Where | Action |
|---|---|---|
| A1* | Firebase console > tejitpabari-99 > Hosting > "Add another site" | Create `tejitpabari-cc` then `tejitpabari-go` (if taken globally, pick another and tell implementer; only `.firebaserc` changes). Do not touch the default site |
| A2* | Build > Firestore Database > Create | Native mode, production rules (rules get deployed next), location `nam5` (US multi-region) — permanent choice. Free quota applies |
| A3* | Build > Authentication > Get started > Sign-in method | Enable **Google**; support email = owner. Settings > Authorized domains: confirm `localhost`, `tejitpabari-99.firebaseapp.com`, `tejitpabari-99.web.app`; add `tejitpabari-cc.web.app`, `cc.tejitpabari.com` (+ `go.` not needed: no auth there) |
| A4* | Project settings > General > Your apps > Add app (Web) | Nickname `cc-gateway`, no Hosting setup. Copy `firebaseConfig` into `src/lib/firebase-config.js` (SP01) and commit. Public by design |
| A5* | Project settings > Service accounts > Generate new private key | Save to `~/.secrets/tejitpabari-99.json`, `chmod 600`, never in repo. For SP02 import only |
| A6 | Build > AI Logic (Gemini) > Get started | Pick **Gemini Developer API** (Spark-compatible if still offered at deploy time; else Vertex path needs Blaze). Enable; note any Blaze prompt `[OPEN-ish: see Risks]` |
| A7 | Build > App Check > Apps > cc-gateway > reCAPTCHA (v3 or Enterprise per SP05) | Create reCAPTCHA key in Google reCAPTCHA admin with domains `cc.tejitpabari.com`, `tejitpabari-cc.web.app` (+ `localhost` for dev only if SP05 chooses). Paste secret in App Check. Token TTL default. Register a debug token for local dev/emulator |
| A8 | App Check > APIs tab | Set **enforcement** on Firebase AI Logic first. Enforce on Firestore only after smoke tests pass and only if SP05 verified it works with reads from `go.` — `go.` does unauthenticated REST with no App Check token, so **do not enforce App Check on Firestore** `[DEFERRED/RESOLVED: leave Firestore unenforced]` |
| A9 | Google Cloud console > APIs & Services > Credentials > the Browser key (auto-created by Firebase) | Application restriction = HTTP referrers: `cc.tejitpabari.com/*`, `go.tejitpabari.com/*`, `tejitpabari-cc.web.app/*`, `tejitpabari-go.web.app/*`, `tejitpabari-99.firebaseapp.com/*`, `localhost:*/*` (dev). Keep API restrictions to Identity Toolkit, Firestore, Firebase AI Logic (`firebasevertexai`/`generativelanguage`), Firebase App Check, Token Service. Without `go.` entries SP04 REST calls 403 `[SP04 manual step]`. Caution: this key may be shared with the personal website's app — check its current referrers before editing and add, never replace |
| A10 | Billing | Spark preferred. If A6 forces Blaze: link billing account, then Billing > Budgets & alerts: budget $5/mo, alert at 50/90/100%. Note Blaze has no hard cap; budget alerts only email |
| A11 | GA4 (property for `G-9NLS3NG63M`) | No action; verify realtime later. Confirm GA consent decision from SP04 |

### Phase B — Deploy runbook (all commands from repo root; Node/JDK per SP01)
1. `firebase login` (or `firebase login:ci` token stored outside repo for later). `firebase use tejitpabari-99`.
2. Local gates: `npm ci && npm run test:rules && node --test tests/ && npm run build`.
3. **Rules first**: `firebase deploy --only firestore:rules` (empty DB + new rules = safe, deny-by-default).
4. **Data**: Phase C then import (see below). `settings/main` is written first by SP02 so guest reads work.
5. **Hosting to preview channels** (no prod change): `firebase hosting:channel:deploy staging --only cc` and `--only go` (default 7-day expiry, `--expires 14d`). URLs look like `tejitpabari-cc--staging-<hash>.web.app`. **Caveat**: channel hostnames are not in A3/A7/A9 lists — either add the exact channel host to authorized domains/referrers/reCAPTCHA for the smoke test, or smoke-test on the live `tejitpabari-cc.web.app` (deployed in step 6) instead. Chosen: deploy to live site IDs (`firebase deploy --only hosting:cc,hosting:go`), which serve only `*.web.app` until DNS is attached, so no public exposure of a custom domain; channels remain optional.
6. `firebase deploy --only hosting:cc` and `--only hosting:go`.
7. Run Phase E smoke tests against `tejitpabari-cc.web.app` and `tejitpabari-go.web.app/<slug>`.
8. Only after step 7 passes: Phase D DNS.

### Phase C — Data freeze + export
Old VPS is a different machine from this box; this box's `content/` may be stale `[verified: README.md]`.
1. Announce freeze: no edits on old site from now. (Soft freeze = owner discipline; hard freeze optional: set old `content/settings.json` guestVisibility to false and stop using admin UI.)
2. On old VPS, from the app dir: `tar czf /tmp/cc-content.tgz content/ links.json 2>/dev/null; tar czf /tmp/cc-content.tgz content` (contains `ideas/`, `links.json`, `settings.json`). Record `ls content/ideas | wc -l` and `sha256sum` of the tarball.
3. `scp` to this box, extract into a scratch dir, diff against repo `content/` (`diff -r`); replace repo `content/` with the VPS copy (it is the source of truth) and commit it on the branch as `chore: sync content from production`.
4. `GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/tejitpabari-99.json npm run migrate -- --dry-run`, review counts (expect VPS counts, previously 59/2/1 locally), then `-- --yes`. Verify output `OK ideas N/N, links M/M, settings 1/1`.
5. Any edit on the old site after the export requires re-export + rerun. After DNS flips, **never rerun import without `--force-overwrite` intent** (overwrites newer Firestore edits, per SP02).

### Phase D — Cloudflare DNS cutover (zone `tejitpabari.com`)
Today: `cc`, `go` = `A` -> old VPS IP, **proxied (orange)**, SSL mode `Flexible` `[verified: deploy/README.md Cloudflare section]`. Target: DNS-only (grey) records to Firebase, same as apex `199.36.158.100` `[brief]`.
1. T-24h: lower TTL on the existing `cc`/`go` records to 300s (proxied records show "Auto"; set explicit TTL only applies when grey — so instead lower TTL when switching, accept Cloudflare edge ~5 min). Record the current A values and proxy state in `docs/DEPLOY.md` (rollback).
2. Firebase console > Hosting > site `tejitpabari-cc` > Add custom domain `cc.tejitpabari.com`. Choose the advanced/"zero-downtime" flow if offered. Firebase shows a TXT (`hosting-site=tejitpabari-cc` style) and A record(s); **use the values the console shows, not memory**.
3. In Cloudflare add the TXT (DNS-only; TXT is never proxied) and, in the zero-downtime flow, the `_acme-challenge` CNAME/TXT. Wait for status "Needs setup" -> "Pending" -> certificate minted (minutes to ~24h). Verify: `dig +short TXT cc.tejitpabari.com @1.1.1.1`.
4. Repeat for `go.tejitpabari.com` on site `tejitpabari-go`.
5. **Flip** (per hostname, low-traffic moment): edit the existing `A` record to the Firebase IP(s) from console and set to **DNS only (grey cloud)**, TTL 300. Do not leave it orange: Firebase cannot complete/renew ACME challenges through the proxy, and orange + Flexible would add a redirect-loop risk with Firebase's forced HTTPS. If the zone is set to "Always Use HTTPS" that is fine with grey records. Remove any stale AAAA pointing at the VPS.
6. Verify: `dig +short cc.tejitpabari.com @1.1.1.1` = Firebase IP; `curl -sI https://cc.tejitpabari.com | head` shows `HTTP/2 200` and Firebase headers (`x-served-by`/`server` not nginx); `curl -sI https://go.tejitpabari.com/<slug>` 200 (page, not 301 — expected behaviour change); `openssl s_client -connect cc.tejitpabari.com:443 -servername cc.tejitpabari.com </dev/null | openssl x509 -noout -issuer -dates`.
7. Re-run Phase E against the custom domains.

### Phase E — Smoke tests (checklist, run on `*.web.app` then custom domain)
| # | Test | Pass |
|---|---|---|
| 1 | Open `/` signed out | Sign-in gate or guest view per toggles; no console errors |
| 2 | Google sign-in as owner | Header shows admin controls; works on `cc.tejitpabari.com` (authorized domain) |
| 3 | Sign in as a non-owner Google account (or incognito guest) | No write UI; try a write in console `addDoc(...)` -> permission-denied |
| 4 | Toggle `/links` off in `/settings`, reload as guest | `/links` hidden and `links` list query denied; `go.` single slug still works; toggle back on |
| 5 | Create, edit, delete an idea; add/edit/delete a link (with and without expiry) | Persist after reload; visible in Firebase console |
| 6 | `/ideas/rank` AI rank on one throwaway idea | Scores + "Ranking Analysis" written to doc; fails cleanly (no key exposure) for guest |
| 7 | `go.`: live slug | Redirects to target; GA4 realtime shows `go_click` with `slug` within ~1 min |
| 8 | `go.`: missing slug, expired link, `/` | 404 text, 410 text, "No slug provided" |
| 9 | Deep link refresh `/ideas/<slug>` on cc | Renders (SPA fallback), not 404 |
| 10 | Data counts | Firestore doc counts equal Phase C counts; spot-check `ideas/open-source-funding-platform.date` is a string |
| 11 | `npm run test:rules` green on the deployed rules commit; `firebase deploy --only firestore:rules --dry-run` shows no diff | |
| 12 | Browser Network: no calls to Anthropic or the old VPS; no CSP violations | |

### Phase F — Rollback
- Trigger: any smoke test 1–9 fails on custom domain and not fixable in ~30 min.
- Action: in Cloudflare set `cc`/`go` back to the recorded old A value(s), orange cloud, TTL Auto, SSL mode unchanged (Flexible). DNS-only TTL 300 means ~5 min recovery. Firebase custom-domain config can stay attached (harmless) or be removed.
- Data caveat: edits made in Firestore during the window are **not** in the old site. If any were made, export them (re-run a reverse export: owner copies from Firestore console / `gcloud firestore export`, or manually re-enter — volume expected tiny). Avoid by keeping the freeze on the new side too until the post-flip smoke passes.
- Rollback window: keep old VPS pm2 running and unmodified **7 days** `[RESOLVED: N=7]`.

### Phase G — Retirement (after N=7 days of clean operation)
| Step | Owner decision? |
|---|---|
| Old VPS: `pm2 stop cc-gateway && pm2 delete cc-gateway && pm2 save`; keep a final `content/` tarball in `~/backups/` 30 days; shut down or cancel VPS | Yes (account/billing) |
| Repo: delete `content/` (per SP02/03 "removal deferred to SP06") in a commit `chore: remove migrated content`; keep `archive/` | Agent after owner OK |
| This box (claude1): `pm2 stop cc-gateway; pm2 delete cc-gateway; pm2 save`; free port 80; optionally remove ufw Cloudflare:80 rules | Yes — local copy only serves raw IP `65.21.49.199` `[README.md]`; also linkedin-outreach proxy is gone with SP03 |
| Google Cloud: delete/disable the service-account key from A5; `rm ~/.secrets/tejitpabari-99.json` | Owner |
| Remove `.env` secrets (`GATEWAY_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`) on both boxes; rotate/revoke the Anthropic key if unused elsewhere | Owner |
| Update `/root/projects/README.md` cc-gateway row: "Static SvelteKit SPA on Firebase Hosting (tejitpabari-99, sites tejitpabari-cc / tejitpabari-go); data in Firestore; Google sign-in; no local process. Deploy: `docs/DEPLOY.md`." Also adjust the `linkedin-outreach-tool` row: no longer proxied behind cc-gateway (LinkedIn removed) — flag to owner | Agent |
| Repo docs: `README.md` Deploy section = 5-line summary + link to `docs/DEPLOY.md`; remove stale "Live Architecture" (SP03 already) | Agent |

## Decisions
| # | Decision | Choice | Alternatives | Why |
|---|---|---|---|---|
| 1 | Runbook location | `docs/DEPLOY.md` in repo | Keep in agent_files | agent_files is per-branch artifacts; runbook must outlive branch; SP03 README links it |
| 2 | Deploy order | rules -> data -> hosting -> smoke on web.app -> DNS | Hosting first | Never serve a UI against missing rules/data |
| 3 | Staging | Live site IDs on `*.web.app` before DNS | Preview channels | Channel hostnames need extra authorized-domain/referrer/reCAPTCHA entries; site `web.app` hosts are already listed |
| 4 | Firestore location | `nam5` | `us-central1`, `eur3` | Permanent; US multi-region, free-tier eligible |
| 5 | Cloudflare mode | Grey cloud, DNS-only | Orange proxy | Firebase ACME/renewal + matches website apex; brief locked |
| 6 | App Check on Firestore | Not enforced | Enforced | `go.` REST has no token; AI Logic enforcement is the cost-relevant one |
| 7 | Rollback window | 7 days | 3 / 14 | Enough to catch weekly usage; cheap to keep |
| 8 | Freeze | Owner discipline + final export | Read-only flag in old app | Old app unmodifiable/unverified; edits are rare (sole user) |
| 9 | CI deploy | Manual CLI | GitHub Actions | Single user, infrequent; [DEFERRED] |
| 10 | Import executor | Owner holds key; agent may run if owner places key path | — | Key sensitivity (SP02 open item) |

## Manual steps
All of Phases A, C (VPS copy), D (Cloudflare), G (account/billing items) are human-only. Agent-doable: writing `docs/DEPLOY.md`, README links, content/ removal, README row edit, running local gates, running `firebase deploy` if the owner provides a logged-in session/CI token.

## Risks / Open Questions
- [RESOLVED: tejitpabari99@gmail.com] Owner Google email for `ADMIN_EMAILS` (inherited from SP01) must be final before A4/Phase B rules deploy; wrong email = locked out of admin until redeploy.
- [RESOLVED: SP05 verified Gemini Developer API backend works on Spark; Blaze + $5/mo budget only as fallback, owner pre-approved] Does Firebase AI Logic (Gemini Developer API) work on Spark at deploy time? Decided by SP05 / A6 prompt; if Blaze, owner OK is on record (small spend) — confirm budget amount ($5/mo proposed).
- [DEFERRED: owner-only task] Old VPS access: owner must supply the tarball (`content/`); until then Phase C blocks cutover (not earlier phases).
- [RESOLVED: fire go_click unconditionally] GA consent for `go.` (inherited from SP04) — decide before DNS flip.
- [RESOLVED: checklist step — inspect key usage in Cloud Console before restricting; if shared, add website domains to referrer list] Browser API key sharing with the personal website: confirm before restricting referrers (A9) to avoid breaking tejitpabari.com.
- [RESOLVED: new-side freeze] Window writes: don't edit in either system between the Phase C export and post-flip smoke pass.
- Risk: certificate provisioning can take hours; start A/B/D2–D4 a day ahead of the flip.
- Risk: `go.` changes from HTTP 301 to JS redirect; old printed/QR links keep working, link previews/SEO bots won't follow (accepted in brief).
- Risk: Cloudflare proxied -> grey exposes no origin IP; Cloudflare WAF/Always-Online no longer apply (accepted).
- [DEFERRED] CI deploy, scheduled Firestore export, CSP on `cc`.

## Acceptance Criteria
- `docs/DEPLOY.md` exists, covers Phases A–G, and README Deploy section links it.
- `firebase deploy --only firestore:rules,hosting:cc,hosting:go` completes; `tejitpabari-cc.web.app` and `tejitpabari-go.web.app/<slug>` pass Phase E.
- `dig +short cc.tejitpabari.com` / `go.tejitpabari.com` return Firebase IP(s), records DNS-only; `curl -sI https://cc.tejitpabari.com` is 200 over a valid cert.
- Firestore counts equal the VPS export counts; import verify line printed `OK`.
- GA4 realtime shows `go_click` for a test slug after the flip.
- Rollback steps documented with the previous A values and proxy state recorded before the flip.
- After day 7: old pm2 process stopped, local claude1 `cc-gateway` pm2 process stopped (owner-approved), service-account key deleted, `content/` removed, `/root/projects/README.md` row updated.
