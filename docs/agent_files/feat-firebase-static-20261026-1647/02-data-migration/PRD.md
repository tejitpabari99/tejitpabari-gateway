---
status: draft
summary: One-time idempotent dry-runnable Node script importing 59 ideas, links.json, settings.json into Firestore per the SP01 schema, with post-write verification.
date: 2026-10-26
---
# PRD: SP02 data-migration
Repo/branch: cc-gateway · `feat/firebase-static` · Depends on: SP01 (schema doc, rules, emulator config) · Owns: `scripts/migrate-to-firestore.js`, `scripts/lib/migrate-transform.js`, `tests/migrate/**`, `.gitignore` additions, `package.json` script `migrate` + devDep `firebase-admin`

## TL;DR
A local-only Node script reads `content/` and writes `ideas/{slug}`, `links/{slug}`, `settings/main` with `set()` (overwrite), so reruns are safe. `--dry-run` writes nothing and prints a validation report. After writing it re-reads Firestore and diffs against the source. Works against the emulator (`FIRESTORE_EMULATOR_HOST`) for testing; the real run is an owner-only step needing a service account key.

## Problem
Data lives in git-tracked files. Firestore must be seeded before the SPA (SP03) or go. page (SP04) work, and `settings/main` must exist before any guest read works (SP01 rules `get()` it). Source data is slightly inconsistent, so the import needs a transform step plus validation.

## Goals / Non-Goals
- Goals: lossless, typed import per schema; idempotent; dry-run; verification; emulator-testable; no secrets committed.
- Non-goals: ongoing sync, a reverse export, deploying rules (SP01/SP06), creating the service account (owner), deleting `content/` (see D7).

## Requirements
- `npm run migrate -- --dry-run` prints per-collection plan (doc ids, counts) and a validation report; exit 1 if any error, 0 otherwise; zero writes.
- `npm run migrate` (no flag) validates first; aborts without writing if any error; otherwise writes then verifies; exit non-zero on verify mismatch.
- Rerun yields identical Firestore state (same ids, same content). Only the three managed collections are touched.
- Credentials: `GOOGLE_APPLICATION_CREDENTIALS` (path to key JSON) or `FIRESTORE_EMULATOR_HOST` (no creds needed, project from `--project`, default `tejitpabari-99`). Real mode with neither set: fail fast with a clear message. Real mode prints project id + target and requires `--yes` (or interactive confirm) so a stray run cannot hit prod. Emulator mode needs no confirm.
- `.gitignore` gains `service-account*.json`, `*-firebase-adminsdk-*.json`, `.secrets/`.

## Architecture
**Flow**: `load` (fs + gray-matter) -> `transform` (pure functions) -> `validate` -> [dry-run: report, stop] -> `write` (batched `set`) -> `verify` (re-read, deep-compare). Transform/validate live in `scripts/lib/migrate-transform.js` (pure, no firebase import) so tests need no emulator for most cases.

**Source facts** `[verified: node+gray-matter scan of content/ideas/*.md]`
| Fact | Count | Handling |
|---|---|---|
| Files | 59, all `[a-z0-9-]+.md` | slug = filename minus `.md` (same as `ideas.js`) |
| `date` parsed as Date | 58 | -> `toISOString().slice(0,10)` |
| `date` already string (`open-source-funding-platform`, `"2026-03-29"`) | 1 | `String(d).slice(0,10)` — identical to `ideas.js` logic |
| `ranked`/`scores` missing | 5 files (54 have both) | `ranked: false`, `scores: {}` (same defaults as `ideas.js`) |
| `github` missing | 1 (58 present); `brief` missing 3 (56 present) | `''` |
| `tags` always array (some empty) | 59 | title-cased like `titleCaseTags` in `ideas.js` |
| `status` values | new 52, completed 3, rejected 2, inprogress 2 | copy; missing -> `'new'` |
| `scores` keys | 53 files have 5 criteria; only 4 have `interest` | copy as-is; not an error (criteria set is editable) — report as info |
| Body contains `## Ranking Analysis` | 53 | kept verbatim in `body` |
| links.json | 2 links, `tags` already title-cased, `expiresAt` null | see below |
| settings.json | 3 toggles, 6 criteria | copied verbatim |

**Ideas transform** (mirror of `listIdeas`/`getIdea` normalization, but storing `body` = gray-matter `content` untrimmed-except-outer-newline as parsed): `{date,title(default slug),status,tags,link,ranked,scores,github,brief,body}` — exactly the SP01 field set, no extras (drop unknown frontmatter keys, report them as warnings). No `slug` field (doc id is the slug; SP01 schema has none for ideas).

**Links transform**: `{slug (lowercased), url, tags (title-cased), description ?? '', created, expiresAt ?? null}`; drop `clicks`, `lastClicked`, `redirectType`. Doc id = lowercase slug (the app lowercases on save and matches case-insensitively; go. lookup uses lowercased path). Missing `created` -> error (schema requires it); `meet` has no `description` -> `''`.

**Settings**: doc `settings/main` = `{guestVisibility, ranker:{criteria}}`; criteria `weight` coerced to int >=1, `invert` bool; missing `ranker` -> default 6-criteria list from `settings.js` `defaultCriteria`.

**Validation** (errors abort writes; warnings do not):
| Check | Level |
|---|---|
| Slug contains `/`, is `.`/`..`, matches `__.*__`, empty, >1500 bytes (Firestore id rules) | error |
| Slug not `[a-z0-9-]+` (SP01 slug rule) | error |
| Duplicate slug within collection (case-insensitive for links) | error |
| Field type mismatch vs schema (e.g. `tags` not array of strings, `scores` values non-number, `date` not `YYYY-MM-DD`, `url` not http(s)) | error |
| Required missing: idea `title`/`date`; link `url`/`created`; settings toggles for `/`,`/ideas`,`/links` | error |
| Unknown frontmatter key; `ranked:true` with empty scores; unranked with scores; score outside 1–5 (confirm range from ranker UI) | warning |
| Body > 900 KB (doc limit 1 MiB) | error (not expected; total corpus is 256K) |
| Counts: files found vs docs planned must match | error |

**Write**: Admin SDK `WriteBatch` of <=400 ops (limit 500), order `settings/main` first (rules prerequisite), then `links`, then `ideas`. `set()` without merge => full overwrite, fields removed from source are removed from the doc. Admin SDK bypasses rules, so migration can run before rules are deployed. Timestamps: none (all strings per schema).

**Verify**: after commit, `get` each collection; assert doc-id set equals planned set (no missing/extra *among managed ids*), deep-equal each doc to the transformed payload (key order ignored), print `OK ideas 59/59, links 2/2, settings 1/1` or a diff. `ideas` ordering is not stored; SP03 sorts client-side by `date` desc then title (existing `listIdeas` behavior), so no `order` field.

**Prune**: not implemented. Extra docs already in Firestore (e.g. an idea created in the new UI before a rerun) must never be deleted by a stale file import. Verify reports extras as info only.

**Rerun-safety caveat**: rerun overwrites with file content. After cutover, edits live only in Firestore, so a rerun would clobber them. Mitigation: script refuses real-mode writes if `settings/main.migratedAt` exists... not in schema — instead use `--force-overwrite`: real mode checks whether any target doc already exists and, if so, requires `--force-overwrite`; the first run needs no flag. Emulator mode skips the check.

**Tests** (`tests/migrate/`, `node --test`): pure-transform unit tests with fixtures (Date vs string date, missing keys, `/` in slug, duplicate slugs, dropped link fields); one emulator integration test running the script against `firestore` emulator on the real `content/` expecting 59/2/1 and a clean second run (idempotency) — reuses SP01's emulator + JDK.

## Decisions
| # | Decision | Choice | Alternatives | Why |
|---|---|---|---|---|
| 1 | Script lang/location | Plain ESM Node `scripts/migrate-to-firestore.js` | TS; SvelteKit endpoint | No build; one-shot tool |
| 2 | Dependencies | `firebase-admin` devDep; reuse existing `gray-matter` (move to devDep in SP03 when app stops using it) | `firebase` client SDK with admin user | Admin SDK bypasses rules, standard for seeding |
| 3 | Write mode | Batched `set` overwrite | merge; create-only | Idempotent, removes drift |
| 4 | Prune | No | `--prune` | Would delete post-cutover data |
| 5 | Date format | `YYYY-MM-DD` strings | Firestore Timestamp | SP01 schema; SP04 REST parse trivial |
| 6 | Tags | Title-case at import (matches what the app displayed) | Store raw | Same visible result; raw files already effectively normalized |
| 7 | `content/` after migration | Keep in tree until SP06 smoke tests pass; SP06 (post-cutover) `git rm -r content/` and the script's `content/` reads go with it. History retains everything; also tag `pre-firebase-migration` | Delete in SP03 | SP03 deletes `src/lib/*` fs readers but the script still needs the files for reruns/verify; brief says no local mirror needed afterwards |
| 8 | Prod confirm | `--yes` flag + project print; overwrite guard `--force-overwrite` | None | One-shot prod writes should be deliberate |
| 9 | Script path constants | Resolve `content/` relative to the script (`import.meta.url`), not the hardcoded `/root/projects/cc-gateway/...` | Hardcoded path | Works in the worktree and anywhere |
| 10 | Ranking analysis | Stays inside `body` verbatim | Separate `analysis` field | Locked schema; SP05 can re-split if needed |

## Manual steps
- Owner: Firebase console > Project settings > Service accounts > generate key (role: default Admin SDK / Cloud Datastore User); save outside the repo (e.g. `~/.secrets/tejitpabari-99.json`, chmod 600). Firestore must already be created (SP01 manual step).
- Owner (or implementer holding the key): run `GOOGLE_APPLICATION_CREDENTIALS=... npm run migrate -- --dry-run`, review, then `... npm run migrate -- --yes`. Delete the key afterwards (or disable it) once SP06 passes.
- Agent verification run uses the emulator only.

## Risks / Open Questions
- [RESOLVED: store as-is, report info] Only 4 of 53 scored ideas have `interest`; not a data error.
- [RESOLVED: title-case at import, mirrors `titleCaseTags`] Tag normalization.
- [RESOLVED: lowercase ids] Link slug case — app already lowercases.
- [RESOLVED: keep until SP06] Fate of `content/`.
- [RESOLVED: keep 1–5 warning; SP05 clamps scores to 1–5] Score range assumption (1–5) is only a warning check; confirm range from the rank UI/prompt (SP03/05) or drop the check. Not blocking.
- [RESOLVED: owner-only step in SP06 — owner runs it, or gives an agent the key path] Who runs the real import: owner with the key, or owner shares key path for an agent run? Affects SP06 checklist only.
- Risk: rerun after cutover overwrites newer Firestore edits — guarded by `--force-overwrite`.
- Risk: Firestore must be seeded (`settings/main`) before guests can read; script writes settings first and SP06 checks order.
- Risk: any edits to `content/` between dry-run and cutover need a rerun; freeze edits after the final run.
- [DEFERRED] Exporting Firestore back to markdown (backup) — consider a scheduled `gcloud firestore export` post-launch.

## Acceptance Criteria
- `npm run migrate -- --dry-run` against the emulator exits 0, writes nothing (collections empty after), reports 59 ideas / 2 links / 1 settings and 0 errors.
- Real-mode run against the emulator then reports `OK ideas 59/59, links 2/2, settings 1/1`; second run yields identical docs (idempotent, doc count unchanged).
- Spot checks: `ideas/open-source-funding-platform.date == "2026-03-29"` (string); an idea lacking `ranked` has `ranked:false, scores:{}`; `links/meet.description == ''`; no link doc contains `clicks`/`lastClicked`/`redirectType`; `ideas/*` bodies containing `## Ranking Analysis` are preserved (53).
- Unit tests fail the run on slug with `/`, duplicate slugs, and bad types; all pass in `node --test tests/migrate`.
- Real mode without credentials/emulator exits non-zero with a clear message; without `--yes` does not write.
- `git status` shows no key files; `.gitignore` covers them.
