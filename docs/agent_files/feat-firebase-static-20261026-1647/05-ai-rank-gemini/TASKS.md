---
status: draft
summary: 5 tasks — verbatim prompt port, shape/error modules with tests, App Check hook, ai.js implementation, ai.js unit tests and guard checks.
date: 2026-10-26
---
# Tasks: SP05 ai-rank-gemini
Source of truth: /root/projects/cc-gateway/.worktrees/feat/firebase-static/docs/agent_files/feat-firebase-static-20261026-1647/05-ai-rank-gemini/PRD.md. Replaces SP03's stubbed `ai.js` with Gemini via Firebase AI Logic (Gemini Developer API, Spark) and wires App Check into SP01's `firebase.js` hook. Original Anthropic prompts live in the old API routes; if SP03 T10 has already deleted them, read them from git history (main). Console setup and live Gemini comparison are owner-run (SP06).

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Prompt builders ported verbatim | SP03 T4 | todo |
| 2 | Response schemas, validators, error mapping + unit tests | SP03 T4 | todo |
| 3 | App Check init in firebase.js hook | SP01 T3 | todo |
| 4 | Implement ai.js with Gemini | SP01 T4, SP03 T4, T1, T2, T3 | todo |
| 5 | ai.js behavior tests and cleanliness checks | T4 | todo |

## Task 1 — Prompt builders ported verbatim
What it is / what it means: Pure functions producing the three prompts so semantics match today (Components: ai-prompts.js; Per-function contract; Decision 3).
What changes at a high level: Add `src/lib/ai-prompts.js` with builders for parse, enhance, and rank. Text is copied verbatim from the existing Anthropic routes (add-idea, enhance, rank), except the parse prompt drops its "Return ONLY JSON / no markdown" line since the schema replaces it. The rank builder builds the criteria list as today: skips `interest`, and for `invert` criteria adds the "lower is better — score the raw difficulty" note. No network, no SDK imports.
Done when: Builders exist, take plain data, return strings; the inverted-criterion line is present and `interest` never appears in the rank prompt.

## Task 2 — Response schemas, validators, error mapping + unit tests
What it is / what it means: The testable core of output handling, no network (Components: ai-shape.js, ai-errors.js; Decisions 3, 4; Acceptance Criteria).
What changes at a high level: Add `src/lib/ai-shape.js` with schema builders (parse: title, content, tags, brief all required; rank: dynamic `scores` integer per rankable criterion plus `analysis`, never `interest`) and `validateParse`, `validateEnhance`, `validateRank`. Parse: non-empty title/content, tags filtered to the 13-item allowed list and capped at 3. Enhance: trim, strip a leading/trailing code fence, reject empty. Rank: every rankable id present, `parseInt`, NaN to 3, clamp 1-5, missing ids to 3. Add `src/lib/ai-errors.js` with `toUserMessage(err)` per the PRD mapping, matching SDK code/HTTP status first and message substring second; read `AIErrorCode` names from SDK typings. Add `ai-shape` unit tests covering the acceptance cases ("4.7"/"abc"/9/0 giving 4/3/5/1).
Done when: `npm test` passes these tests with no network.

## Task 3 — App Check init in firebase.js hook
What it is / what it means: The abuse gate required by Firebase from 2026-11-02 (Components: firebase.js; Decisions 5, 6; Abuse model).
What changes at a high level: Fill only the SP05 marker in `src/lib/firebase.js`, browser-only and before other services: in dev (`import.meta.env.DEV`) set `self.FIREBASE_APPCHECK_DEBUG_TOKEN` from `VITE_APPCHECK_DEBUG_TOKEN` or `true`; then `initializeAppCheck` with a reCAPTCHA Enterprise provider using `VITE_RECAPTCHA_SITE_KEY` and token auto-refresh. The debug token is never set in prod builds. Create `.env.example` documenting both vars. Ensure the installed `firebase` version supports `firebase/ai` (replay protection needs >= 12.14.0; bump if needed).
Done when: Build succeeds, debug token is guarded by the dev check, and a dev page load prints a debug token and acquires an App Check token.

## Task 4 — Implement ai.js with Gemini
What it is / what it means: The real bodies behind SP03's frozen signatures (Per-function contract; Decisions 1, 2, 7, 8, 9).
What changes at a high level: Replace the stub throws in `src/lib/ai.js`. Add a single `GEMINI_MODEL` constant (`gemini-3.8-flash`). Lazy `await import('firebase/ai')` and a memoized `getAI` with `GoogleAIBackend` and limited-use App Check tokens. Each function first throws `Error('Admin only')` unless the `role` store is `admin`. `parseIdea` and `rankIdea` use JSON mime type with their schemas, run validators, retry once on invalid JSON or failed validation, then throw a malformed-output error. `enhanceIdea` uses plain text and returns `{content}`. SDK defaults for temperature and no output cap. Errors are passed through `toUserMessage`, with raw error logged via `console.error`. Returns exactly the contract shapes (no slug).
Done when: No stub throw remains; the three functions return contract shapes; thrown errors carry user-facing messages.

## Task 5 — ai.js behavior tests and cleanliness checks
What it is / what it means: Network-free proof of guard, retry, and error paths (Acceptance Criteria; Requirements on failures).
What changes at a high level: Add `src/lib/ai.test.js` with a mocked model/SDK: guest call throws `Admin only`; malformed output retries once then surfaces the malformed message; quota, App Check, and model-not-found errors produce their mapped messages; no function partially returns data on failure. Confirm `grep` finds no `@anthropic-ai/sdk`, API key, or `process.env` in `src/lib/ai*.js`.
Done when: `npm test` passes, and the grep check returns zero matches.

## Owner-only steps (from PRD Manual steps — not tasks for agents)
- Firebase console: AI Logic, Get started, Gemini Developer API.
- GCP Fraud Defense: create Web reCAPTCHA Enterprise key for `cc.tejitpabari.com` (no checkbox; do not add `localhost`).
- App Check: register web app with that key; enforce for Firebase AI Logic.
- App Check: register the dev debug token printed in the browser console.
- Set `VITE_RECAPTCHA_SITE_KEY` in build env / `.env`.
- GCP console: lower Firebase AI Logic API per-user RPM to ~10.
- Run the 10-line Spark smoke call and the manual re-rank comparison of 3 existing ideas (mean abs diff <= 1.0 per criterion), plus airplane-mode and quota failure checks (SP06 checklist).
