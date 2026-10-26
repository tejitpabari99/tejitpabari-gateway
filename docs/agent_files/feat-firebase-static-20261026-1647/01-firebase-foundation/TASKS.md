---
status: draft
summary: 6 tasks — JDK + deps/scripts, hosting/emulator config, SDK init, auth/role store, schema doc + rules, rules tests.
date: 2026-10-26
---
# Tasks: SP01 firebase-foundation
Source of truth: /root/projects/cc-gateway/.worktrees/feat/firebase-static/docs/agent_files/feat-firebase-static-20261026-1647/01-firebase-foundation/PRD.md. Builds the Firebase base (hosting targets, SDK init, Google auth + role store, schema, tested rules) that SP02-SP06 depend on. Admin email is tejitpabari99@gmail.com; web config values stay placeholders until the owner supplies them (SP06 Phase A).

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Toolchain: JDK, firebase deps, package scripts | — | todo |
| 2 | Hosting targets, emulators, firestore config files | 1 | todo |
| 3 | Shared constants, web config, single SDK init | 1 | todo |
| 4 | Client-side Google auth and role store | 3 | todo |
| 5 | Schema doc and Firestore security rules | 3 | todo |
| 6 | Rules emulator tests incl. email drift test | 1, 2, 5 | todo |

## Task 1 — Toolchain: JDK, firebase deps, package scripts
What it is / what it means: The dev box has no Java, so the Firestore emulator and `test:rules` cannot run. Deps and scripts are the shared entry points other SPs use (Decisions 6, 10; Risks: no Java).
What changes at a high level: Install JDK 21+ via apt and verify `java -version`. Add `firebase`, `firebase-tools`, and `@firebase/rules-unit-testing` to package.json, plus scripts `emulators` (auth, firestore, hosting) and `test:rules` (node --test over the rules tests, wrapped in emulators:exec for firestore only). Do not remove unrelated deps or scripts; SP03 handles adapter changes.
Done when: `java -version` succeeds, deps install cleanly, both scripts exist in package.json.

## Task 2 — Hosting targets, emulators, firestore config files
What it is / what it means: The deployable Firebase config for project `tejitpabari-99` with two Hosting targets (Architecture: firebase.json; Decision 7).
What changes at a high level: Create `.firebaserc` (default project, targets `cc` -> `tejitpabari-cc`, `go` -> `tejitpabari-go`). Create `firebase.json`: `cc` serves `build` and `go` serves `go`, both with the `**` -> `/index.html` rewrite and baseline headers (nosniff, Referrer-Policy, HSTS); `cc` also gets cleanUrls true, trailingSlash false, immutable caching for `_app/immutable/**`, no-cache for html; `go` gets no-cache on index.html. Add firestore rules/indexes pointers and emulators (auth 9099, firestore 8080, hosting 5000, UI disabled). `firestore.indexes.json` is empty. No CSP (Decision 8). Create a placeholder `go/index.html` only if needed so the emulator boots (SP04 fills it).
Done when: `firebase emulators:start --only hosting,firestore,auth` boots; `cc` serves `/ideas/foo` as index.html and `go` serves `/anything` as its index.html.

## Task 3 — Shared constants, web config, single SDK init
What it is / what it means: The one place the Firebase app is initialized, with named extension points for SP05 (Architecture: config, firebase.js; Decision 1).
What changes at a high level: Add `src/lib/config.js` exporting `ADMIN_EMAILS` (tejitpabari99@gmail.com) and `SETTINGS_PATH` as `settings/main`. Add `src/lib/firebase-config.js` with the committed web config using clearly marked placeholders plus an exported `projectId`. Add `src/lib/firebase.js` exporting `app`, `auth`, `db`; initialization is browser-only (guarded by window check) and idempotent so double import does not throw. Place `SP05: initAppCheck(app)` and `SP05: getAI(app)` marker comments between app init and the other services as specified.
Done when: Importing the module twice in the browser does not throw, the SP05 markers exist, and server/prerender import does not execute init.

## Task 4 — Client-side Google auth and role store
What it is / what it means: Replaces the HMAC cookie module with Firebase Google sign-in and an `admin|guest` role signal, a UX hint only since rules are authoritative (Requirements; Architecture: auth.js; Decision 2).
What changes at a high level: Rewrite `src/lib/auth.js` to export `signInWithGoogle()` (popup flow), `signOutUser()`, readable stores `user` and `authReady` (true only after the first auth-state callback), and derived `role` that is `admin` only when the user's email is verified and in `ADMIN_EMAILS`, else `guest` (anon, other users, unverified). Remove the old HMAC logic from this file only; leave callers to SP03.
Done when: With the auth emulator, the verified owner yields `admin`; any other account or sign-out yields `guest`; `authReady` flips only after the first callback.

## Task 5 — Schema doc and Firestore security rules
What it is / what it means: The locked data contract and the server-side enforcement that replaces hooks.server.js (Architecture: Schema, Rules; Decisions 3, 4, 9).
What changes at a high level: Write `docs/firestore-schema.md` listing every field and type for `ideas/{slug}`, `links/{slug}`, `settings/main` (dates as strings, slug rule `[a-z0-9-]+`, dropped fields, guestVisibility keys including the UI-only `/`), the admin-email single-edit procedure, and the `get()` read-cost note. Write `firestore.rules`: admin = verified owner email; ideas read for admin or toggle on `/ideas`, write admin; links `get` always public, `list` admin or toggle `/links`, write admin; settings public read, admin write; default deny; no field-shape validation. The `/` toggle is not referenced.
Done when: The schema doc covers all PRD fields with types, and the rules compile in the emulator.

## Task 6 — Rules emulator tests incl. email drift test
What it is / what it means: Proof that the rules match the access matrix and that the duplicated admin email cannot drift (Architecture: Tests; Decisions 5, 6).
What changes at a high level: Add `tests/rules/rules.test.js` using node --test and `@firebase/rules-unit-testing` against the firestore emulator. Cover the full actor matrix (verified admin, admin email unverified, other Google user, anon) across ideas read/write, links get/list, settings read/write. Toggle-gated cases run with the toggle both true and false. Also test missing `settings/main` denying guest ideas reads, unknown collections denied, and a drift test that reads `config.js` and `firestore.rules` and asserts the same admin email set.
Done when: `npm run test:rules` passes the whole matrix and the drift test.

## Owner-only steps (from PRD Manual steps — not tasks for agents)
- Create Hosting sites `tejitpabari-cc` and `tejitpabari-go`, enable Firestore (native mode), enable the Google provider, register the web app, and supply the config for `firebase-config.js` (SP06 Phase A).
- Run `firebase login`; JDK install on this box is handled by Task 1, but owner installs JDK 21+ on any other local machine that runs `test:rules`.
