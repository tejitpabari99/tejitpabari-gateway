---
status: draft
summary: Firebase base for cc-gateway — hosting targets, SDK init, Google auth + role store, Firestore schema, tested security rules.
date: 2026-10-26
---
# PRD: SP01 firebase-foundation
Repo/branch: cc-gateway · `feat/firebase-static` · Depends on: none · Owns: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `src/lib/firebase.js`, `src/lib/firebase-config.js`, `src/lib/auth.js` (rewritten, client-side), `src/lib/config.js`, `docs/firestore-schema.md`, `tests/rules/**`, `package.json` firebase deps/scripts

## TL;DR
Everything other sub-projects build on: Firebase project config with two Hosting targets (`cc` SPA, `go` static), one Firebase SDK init, Google sign-in with an `admin|guest` Svelte store, the locked Firestore schema documented, and `firestore.rules` enforcing admin-only writes + toggle-gated guest reads, proven by emulator tests.

## Problem
Current auth is a shared-password HMAC cookie checked in `hooks.server.js`; data is local files. A static SPA has no server to enforce roles, so enforcement must move to Firestore rules, with a client-side role signal for UX.

## Goals / Non-Goals
- Goals: deployable `firebase.json`; single SDK init with named extension points for SP05; role store with no UI flash; schema doc; rules + tests runnable offline.
- Non-goals: page porting/UI (SP03), data import (SP02), go. page (SP04), AI Logic/App Check init (SP05), console/DNS setup (SP06).

## Requirements
- Google sign-in/out helpers; signed-in verified owner email => `admin`; everyone else (anon, other Google users, unverified) => `guest`.
- Pages can await auth-ready before rendering (no admin/guest flash).
- Rules: no public writes anywhere; admin can read/write all; guest reads follow `settings/main.guestVisibility`; `links/{slug}` single `get` always public; `settings/main` public read.
- `/` toggle: home is a static launcher with no Firestore data `[verified: src/routes/+page.svelte has no loader, only cards]`. So `guestVisibility['/']` is **UI/route-guard only**; rules do not reference it. Prefix semantics preserved (`/ideas` covers `/ideas/[slug]`); `/ideas/rank` and `/settings` stay admin-only in UI.
- Local: `npm run emulators` (auth+firestore+hosting), `npm run test:rules`.

## Architecture
**firebase.json** (project `tejitpabari-99`; `.firebaserc` default + hosting `targets`):
| Target | `public` | Behavior |
|---|---|---|
| `cc` | `build` | `rewrites: [{source:"**",destination:"/index.html"}]`; headers copied from website conventions: nosniff, Referrer-Policy, HSTS; `_app/immutable/**` => `public,max-age=31536000,immutable`; `index.html` and `**/*.html` => `no-cache`. `cleanUrls:true`, `trailingSlash:false` |
| `go` | `go` (SP04 fills) | same rewrite `**`→`/index.html` (slug read from path), same baseline headers, `index.html` no-cache |
Plus `firestore: {rules, indexes}` and `emulators: {auth:9099, firestore:8080, hosting:5000, ui:{enabled:false}}`. No composite indexes needed (single-collection reads; sort client-side or single-field `orderBy`) -> `indexes.json` empty. Site IDs in `.firebaserc`: `cc` -> `tejitpabari-cc`, `go` -> `tejitpabari-go` (see Manual steps).

**Config** `src/lib/firebase-config.js`: committed web config object (apiKey, authDomain, projectId, appId...). Web config is public by design `[Firebase docs]`; security comes from rules + authorized domains. Exports also `projectId` for SP04 reference.

**`src/lib/config.js`** (shared constants): `ADMIN_EMAILS = ['<owner>@...']`, `SETTINGS_PATH='settings/main'`.

**`src/lib/firebase.js`** exports: `app`, `auth`, `db`, plus clearly marked stubs `// SP05: initAppCheck(app)` and `// SP05: getAI(app)` placed after app init (App Check must init before other services are used, so the hook point is between `initializeApp` and `getFirestore`/`getAuth`; SP05 adds it there). Browser-only: guard with `typeof window` so SvelteKit prerender of the shell does not execute it.

**`src/lib/auth.js`** (replaces HMAC module): `signInWithGoogle()` (popup; redirect avoided due to third-party-storage issues), `signOutUser()`, stores `user`, `authReady` (set after first `onAuthStateChanged`), derived `role` = `'admin'` iff `user?.emailVerified && ADMIN_EMAILS.includes(user.email)` else `'guest'`. Role is a UX signal only; rules are authoritative. SP03 gates rendering on `$authReady`.

**Rules** (`firestore.rules`, sketch of the one non-obvious part):
```
function isAdmin(){ return request.auth != null && request.auth.token.email_verified == true
  && request.auth.token.email in ['<owner>@...']; }
function visible(p){ return get(/databases/$(database)/documents/settings/main)
  .data.get('guestVisibility',{}).get(p,false) == true; }
match /ideas/{id}  { allow read: if isAdmin() || visible('/ideas'); allow write: if isAdmin(); }
match /links/{id}  { allow get: if true; allow list: if isAdmin() || visible('/links'); allow write: if isAdmin(); }
match /settings/{id} { allow read: if true; allow write: if isAdmin(); }
```
Default deny for everything else. `||` short-circuits so admin reads never pay for `get()`. If `settings/main` is missing, `get()` errors => denied (safe default; SP02 seeds it first).

**Admin email sync**: rules cannot import JS, so the email appears twice (`config.js`, `firestore.rules`). A rules test reads both files and asserts the same set, failing CI-local on drift. Single edit procedure documented in schema doc.

**Cost of `get()`**: a rules `get()` bills one extra document read per evaluated request, cached within the request; a `list` query evaluates once (not per doc). Guest page load = N docs + 1. Spark limit 50k reads/day; ~60 ideas x occasional visitors is far below. Admin pays nothing extra. Fallback (public `visibility` doc) not needed unless tests show the rule is untenable.

**Schema** (`docs/firestore-schema.md`, exact types):
| Path | Fields |
|---|---|
| `ideas/{slug}` | `date` string `YYYY-MM-DD`; `title` string; `status` string (`new` default); `tags` array<string>; `link` string; `ranked` bool; `scores` map<string, number>; `github` string; `brief` string; `body` string (markdown incl. any `## Ranking Analysis`) |
| `links/{slug}` | `slug` string (= doc id); `url` string; `tags` array<string>; `description` string (optional, `''` ok); `created` string `YYYY-MM-DD`; `expiresAt` string ISO-date or `null` |
| `settings/main` | `guestVisibility` map<string,bool> keys `'/'`,`'/ideas'`,`'/links'`; `ranker.criteria` array<map{`id` string, `label` string, `weight` int>=1, `invert` bool}> |
Dates stay strings (match current files `[verified: head content/links.json, ideas frontmatter]`) so migration is lossless and SP04's REST parse is trivial (`stringValue`/`nullValue`). Slug rule: `[a-z0-9-]+`. Dropped: `clicks`, `lastClicked`, `redirectType`.

**Tests** (`tests/rules/rules.test.js`, `node --test` + `@firebase/rules-unit-testing`, firestore emulator via `firebase emulators:exec --only firestore`): matrix —
| Actor | ideas read | ideas write | links get | links list | settings read | settings write |
|---|---|---|---|---|---|---|
| admin (verified) | ok | ok | ok | ok | ok | ok |
| admin email, unverified | toggle-gated | deny | ok | toggle-gated | ok | deny |
| other Google user | toggle-gated | deny | ok | toggle-gated | ok | deny |
| anon | toggle-gated | deny | ok | toggle-gated | ok | deny |
Each "toggle-gated" case tested with toggle true (ok) and false (deny); plus missing `settings/main` => guest ideas read denied; unknown collection denied; email-sync drift test.

## Decisions
| # | Decision | Choice | Alternatives | Why |
|---|---|---|---|---|
| 1 | Web config | Committed `firebase-config.js` | Vite `PUBLIC_` env | Not secret; no `.env` handling on build/deploy; one less owner step |
| 2 | Sign-in flow | `signInWithPopup` | redirect | Redirect breaks with third-party storage partitioning on custom domains |
| 3 | Guest toggle in rules | `get()` on `settings/main` | Public `visibility` doc mirror | Single source of truth; cost trivial; fallback retained |
| 4 | `/` toggle | UI-only, not in rules | Rule-enforce | No data behind `/` |
| 5 | Admin email sync | Duplicate + drift test | Template-generated rules file | Simplest; test makes drift impossible to miss |
| 6 | Test runner | `node --test` | vitest | Zero extra dep; fits plain rules tests |
| 7 | Hosting site IDs | `tejitpabari-cc`, `tejitpabari-go` | Reuse default site | Default site is the personal website; IDs are global |
| 8 | CSP header on `cc` | Not in v1 | Hash-based CSP | SvelteKit inline bootstrap + Firebase auth popup/reCAPTCHA origins make a correct CSP non-trivial |
| 9 | Write validation in rules | Admin check only | Field-shape validation | Single trusted writer; keeps rules readable |
| 10 | Package scripts | `emulators`, `test:rules` | — | Per scope |

## Manual steps
- Owner: create Hosting sites `tejitpabari-cc` and `tejitpabari-go`, enable Firestore (native mode), enable Google provider, register web app and paste config into `firebase-config.js` (or give it to the implementer).
- Owner: install JDK 21+ locally for Firestore emulator (and `firebase login`) — needed to run `test:rules`.

## Risks / Open Questions
- [RESOLVED: admin email = tejitpabari99@gmail.com] Exact Google account email for `ADMIN_EMAILS`: `tvp2107@columbia.edu` is the account email on file; Columbia Google accounts may not be a plain Google identity — owner to confirm the email that will sign in.
- [DEFERRED: owner supplies from console in SP06 Phase A; placeholders until then] Web app config values (apiKey/appId) — requires console access; implementer uses placeholders until supplied.
- [RESOLVED: dev box has no Java `[verified: java -version → not found]`] Task must install a JDK (apt) or rules tests cannot run here; SP01 tasks include that, noted in README.
- [RESOLVED: placeholder] Site IDs may be taken globally; if so pick another and update `.firebaserc` only.
- [DEFERRED] CSP header for `cc`; field-shape rule validation.
- [DEFERRED] If Blaze is required for AI Logic (SP05), no change to this SP.
- Risk: `settings/main` must exist before any guest read works; SP02 seeds it, SP06 verifies order.

## Acceptance Criteria
- `firebase.json`/`.firebaserc` validate (`firebase emulators:start --only hosting,firestore,auth` boots); `cc` serves `/ideas/foo` -> index.html; `go` serves `/anything` -> its index.html.
- `npm run test:rules` passes the full matrix above, including drift test.
- `src/lib/firebase.js` initializes once; importing it twice does not throw; contains `SP05` marker comments.
- With auth emulator: owner verified account => `role==='admin'`; other account/sign-out => `'guest'`; `authReady` true only after first auth callback.
- `docs/firestore-schema.md` lists every field above with types; `firebase-tools`, `firebase`, `@firebase/rules-unit-testing` in package.json.
