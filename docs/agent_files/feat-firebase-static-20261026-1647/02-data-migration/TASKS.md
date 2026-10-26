---
status: draft
summary: 5 tasks to build the one-time idempotent Firestore import script (transform/validate lib, loader + dry-run, write + verify + guards, emulator integration test).
date: 2026-10-26
---
# Tasks: SP02 data-migration
Source of truth: /root/projects/cc-gateway/.worktrees/feat/firebase-static/docs/agent_files/feat-firebase-static-20261026-1647/02-data-migration/PRD.md. Delivers a local-only Node script that seeds `ideas`, `links`, `settings/main` from `content/` per the SP01 schema, with dry-run, post-write verification, and prod-safety guards. All PRD open items are resolved; none block.

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Repo hygiene and dependency setup | SP01 T1 | todo |
| 2 | Pure transform and validation library with unit tests | SP01 schema doc | todo |
| 3 | Script entry: loader, CLI modes, credentials, dry-run report | 1, 2 | todo |
| 4 | Write, verify, and overwrite/prod guards | 3 | todo |
| 5 | Emulator integration test and acceptance spot checks | 4, SP01 emulator config | todo |

## Task 1 — Repo hygiene and dependency setup
What it is / what it means: Prevents key leakage and adds the tooling the script needs (Decisions 1, 2; Requirements on credentials/.gitignore).
What changes at a high level: `.gitignore` gains the service-account key patterns and `.secrets/`. `firebase-admin` is added as a devDependency (existing `gray-matter` is reused, not moved yet). A `migrate` npm script is registered pointing at the script path, so `npm run migrate -- <flags>` works. Only the shared `package.json` areas needed are touched.
Done when: `git status` shows no key-pattern files can be tracked (ignore patterns verified with a dummy file), `firebase-admin` installs, and `npm run migrate` resolves the script entry.

## Task 2 — Pure transform and validation library with unit tests
What it is / what it means: The core correctness logic, free of any Firebase import so it tests without the emulator (Architecture: Ideas, Links, Settings transforms; Validation table; Decisions 5, 6, 10).
What changes at a high level: A new lib module exposes pure functions that normalize ideas (slug from filename, date to `YYYY-MM-DD` string whether Date or string, defaults for missing ranked/scores/github/brief/status, title-cased tags, body kept verbatim, unknown keys dropped with warnings), links (lowercased slug id, title-cased tags, description default, drop clicks/lastClicked/redirectType, require created), and settings (int weights >=1, bool invert, default criteria fallback). A validator returns errors and warnings per the PRD table (id rules, slug pattern, duplicates, type mismatches, required fields, score range 1-5 as warning, body size, count match). Unit tests under `tests/migrate/` use fixtures for the listed edge cases and run via `node --test`.
Done when: `node --test tests/migrate` passes, including failures for slug with `/`, duplicate slugs (case-insensitive for links), and bad types.

## Task 3 — Script entry: loader, CLI modes, credentials, dry-run report
What it is / what it means: The runnable script up to and including `--dry-run` (Requirements: dry-run, credentials; Decision 9).
What changes at a high level: `scripts/migrate-to-firestore.js` (plain ESM) resolves `content/` relative to itself via `import.meta.url`, loads ideas with gray-matter plus links.json and settings.json, runs transform and validate from the lib, and handles flags (`--dry-run`, `--yes`, `--force-overwrite`, `--project` defaulting to `tejitpabari-99`). It determines mode: emulator when `FIRESTORE_EMULATOR_HOST` is set, real when `GOOGLE_APPLICATION_CREDENTIALS` is set, otherwise fails fast with a clear message. Dry-run prints per-collection plan (doc ids, counts), validation errors/warnings, and info notes (e.g. ideas missing `interest` score), makes zero writes, and exits 1 on any error, else 0. Non-dry-run aborts before writing on any validation error.
Done when: dry-run against the emulator and against no-credentials behave as specified; reports 59 ideas / 2 links / 1 settings with 0 errors.

## Task 4 — Write, verify, and overwrite/prod guards
What it is / what it means: The actual idempotent import plus safety rails (Write, Verify, Prune, Rerun-safety sections; Decisions 3, 4, 8).
What changes at a high level: Using Admin SDK batches of at most 400 ops with `set()` overwrite, writes `settings/main` first, then `links`, then `ideas`; never prunes or touches other collections. Real mode prints the project id and target and requires `--yes`; it also checks whether any target doc already exists and then requires `--force-overwrite` (first run needs no flag). Emulator mode skips both checks. After commit, re-reads the three collections, asserts the planned id set is present, deep-compares each doc ignoring key order, reports extra docs as info only, prints `OK ideas 59/59, links 2/2, settings 1/1` or a diff, and exits non-zero on mismatch.
Done when: guarded paths (no `--yes`, existing docs without `--force-overwrite`) refuse to write, and a successful run prints the OK line.

## Task 5 — Emulator integration test and acceptance spot checks
What it is / what it means: Proves end-to-end behavior and idempotency against the Firestore emulator from SP01 (Tests section; Acceptance Criteria).
What changes at a high level: One integration test in `tests/migrate/` runs the script against the emulator on the real `content/`, asserting dry-run leaves collections empty, real run yields 59/2/1 with the OK verify line, and a second run leaves identical docs and unchanged counts. It also spot-checks the PRD cases: `open-source-funding-platform` date is the string `2026-03-29`, an idea lacking `ranked` has `ranked:false, scores:{}`, `links/meet.description` is empty, no link doc contains the dropped fields, and 53 bodies keep `## Ranking Analysis`. Reuses SP01's emulator and JDK setup; no new config beyond what is needed to invoke it.
Done when: the full `node --test tests/migrate` suite passes with the emulator running, and all Acceptance Criteria bullets are covered by tests or recorded checks.

## Owner-only steps (from PRD Manual steps — not tasks for agents)
- Generate a service account key in Firebase console (Project settings > Service accounts); store outside the repo (e.g. `~/.secrets/tejitpabari-99.json`, chmod 600). Firestore must already exist (SP01 manual step).
- Run (or hand the key path to an agent to run) the real import: `GOOGLE_APPLICATION_CREDENTIALS=... npm run migrate -- --dry-run`, review, then `npm run migrate -- --yes`. Freeze `content/` edits after the final run.
- Delete or disable the key once SP06 passes.
