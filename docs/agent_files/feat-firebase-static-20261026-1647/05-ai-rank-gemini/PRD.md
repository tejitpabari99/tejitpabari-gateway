---
status: draft
summary: Implement SP03's ai.js (parseIdea/enhanceIdea/rankIdea) with Gemini 3.x Flash via Firebase AI Logic (Gemini Developer API, Spark), JSON-schema output, and App Check (reCAPTCHA Enterprise).
date: 2026-10-26
---
# PRD: ai-rank-gemini (Gemini via Firebase AI Logic + App Check)
Repo/branch: cc-gateway · `feat/firebase-static` · Depends on: 01 (firebase-foundation), 03 (cc-spa-port) · Owns: `src/lib/ai.js` (bodies), `src/lib/ai-prompts.js`, `src/lib/ai-shape.js`, `src/lib/ai-errors.js`, `src/lib/ai.test.js`, App Check block in `src/lib/firebase.js` (only the marked SP05 hook), `.env.example`

## TL;DR
Replace the three Anthropic routes with browser calls to Gemini through Firebase AI Logic. Backend = Gemini Developer API (no billing, stays on Spark). Prompts are ported verbatim; JSON outputs use `responseSchema` instead of fence-stripping. App Check (reCAPTCHA Enterprise, limited-use tokens) is the only abuse gate, and it is **required by Firebase from 2026-11-02**. App Check proves "this site", not "this admin", so a guest with devtools could still call Gemini; mitigation is staying on Spark (no billing = no cost exposure) plus a lowered per-user quota.

## Problem
Anthropic calls need a server-held key; the new site has no server. SP03 left `ai.js` as a stub with frozen signatures; SP05 fills it and wires App Check.

## Goals / Non-Goals
- Goals: same three AI features, same output shapes, same prompt semantics; no API key in client; clear UI-facing errors; testable response validation.
- Non-goals: UI changes (SP03), console setup (SP06), server-side enforcement of admin-only, Vertex backend, streaming, Remote Config model switching.

## Requirements (user-visible)
- Add Idea (raw notes → title/content/tags/brief), Enhance (merge new notes), Auto-rank (single + bulk, concurrency 3 from SP03) work as today for admin; guests never see the buttons (SP03).
- Failures show a one-line message in the existing error slot; idea state is never partially written (callers persist only after success).
- Rank output: integer 1-5 per rankable criterion + 2-3 sentence analysis, `interest` excluded (personal criterion), inverted criteria scored raw. Same as today [verified: api/ideas/[slug]/rank/+server.js].

## Architecture
**Research findings (all fetched 2026-10-26)**
| Topic | Finding | Source |
|---|---|---|
| SDK | `import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "firebase/ai"`; `getAI(app, { backend: new GoogleAIBackend() })` | firebase.google.com/docs/ai-logic/get-started |
| Plan | Gemini Developer API free tier needs no Cloud Billing link, so Spark works; Gemini 3.x Flash/Flash-Lite need no Blaze. Blaze needed only for Gemini 4 Argon and image models | .../ai-logic/pricing, .../ai-logic/models |
| Model | `gemini-3.8-flash` = latest stable 3.x Flash, no shutdown date. `gemini-2.5-flash` deprecated/restricted to prior users. Retired model → 404 | .../ai-logic/models, .../faq-and-troubleshooting |
| Structured output | `generationConfig: { responseMimeType: "application/json", responseSchema: Schema.object({...}) }`; all properties required unless in `optionalProperties`; unsupported schema fields silently ignored; schema counts toward input tokens | .../ai-logic/generate-structured-output |
| App Check | Production provider on web = reCAPTCHA Enterprise (score-based key); debug via `self.FIREBASE_APPCHECK_DEBUG_TOKEN`; `useLimitedUseAppCheckTokens: true` on `getAI` (5-min tokens); replay protection needs Web SDK >= 12.14.0. **Enforcement mandatory from 2026-11-02**; unenforced calls blocked | .../ai-logic/app-check, .../app-check/web/recaptcha-enterprise-provider |
| Limits | Project-level RPM/RPD/TPM/TPD from Gemini Developer API limits (429 on breach); Firebase default 100 RPM per user, editable in GCP console (Firebase AI Logic API quotas), not per individual | .../ai-logic/quotas |
| Errors | 403 "must enforce App Check"; 403 key/API restriction; 404 genai config not found / model not found; 429 quota or "needs Blaze"; | .../ai-logic/error-codes |

**Components**
- `firebase.js` (SP01 hook): before other services, if `typeof window`: in dev set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true`; then `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true })`. Debug token never set in prod builds (`import.meta.env.DEV` guard). Site key is public. No AI Logic emulator exists: dev calls hit live Gemini with debug token.
- `ai.js`: lazy `await import('firebase/ai')` (keeps AI SDK out of initial bundle), memoized `getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true })`. Model id constant `GEMINI_MODEL = 'gemini-3.8-flash'` in one place (retirement = one-line change).
- `ai-prompts.js`: pure prompt builders (text ported verbatim, see below). `ai-shape.js`: pure `validateParse/validateEnhance/validateRank` + builders for response schemas. `ai-errors.js`: `toUserMessage(err)`.
- Role guard: each function throws `Error('Admin only')` if `get(role) !== 'admin'` (defense in depth; old enhance route lacked a server check).

**Per-function contract (signatures frozen by SP03)**
| Fn | Prompt | Output handling |
|---|---|---|
| `parseIdea(rawText)` | Verbatim 5-step prompt from api/ideas/+server.js (drop the "Return ONLY JSON / no markdown" line; schema replaces it) | Schema `{title, content, tags[], brief}` all required. Validate: non-empty title/content; tags filtered to the 13-item allowed list, max 3; brief string. Returns `{title, content, tags, brief}` (no slug; caller slugifies) |
| `enhanceIdea(existing, notes)` | Verbatim merge prompt | Plain text (no schema). Trim, strip a leading/trailing code fence defensively, reject empty. Returns `{content}` |
| `rankIdea({title,brief,content}, criteria)` | Verbatim scoring prompt; criteria list built as today (skip `interest`, "lower is better — score the raw difficulty" note for `invert`) | Schema built dynamically from rankable criteria: `scores: Schema.object({ [id]: Schema.integer() })`, `analysis: Schema.string()`. Post-validate: every rankable id present, `parseInt`, NaN→3, clamp 1-5 (schema range not relied on); missing ids → 3; analysis string. Returns `{scores, analysis}` |

**Error mapping (`toUserMessage`)**: App Check 403 → "App Check blocked this request (reload; if it persists check App Check setup)"; 429 → "Gemini quota reached, try again later"; 404 model/config → "AI model or AI Logic not set up"; blocked/safety finish → "Gemini declined this content"; invalid JSON or failed validation → one automatic retry, then "AI returned malformed output, try again"; anything else → generic "AI request failed" with raw message in `console.error`. Match on SDK error `code`/HTTP status first, message substring second (exact `AIErrorCode` names to be confirmed against SDK typings at implementation; docs pages do not list them).

**Abuse model (admin-only)**
AI Logic has no Firestore-rules equivalent; any visitor to the real site gets a valid App Check token. A guest could invoke Gemini from devtools. Impact is bounded: Spark has no billing account, so worst case is exhausting the free quota (rank/add fail until reset), never a bill. Mitigations: (1) stay on Spark, (2) lower per-user quota from 100 RPM to ~10 RPM (manual), (3) reCAPTCHA risk threshold default 0.5, (4) `ai.js` role guard and UI hiding, (5) if ever moved to Blaze: budget alert + hard cap is mandatory first. Requiring Firebase Auth does not help (guests can sign in with any Google account).

## Decisions
| # | Decision | Choice | Alternatives considered | Why |
|---|---|---|---|---|
| 1 | Backend | Gemini Developer API (`GoogleAIBackend`) | Vertex/Agent Platform backend | No billing needed; owner wants Spark |
| 2 | Model | `gemini-3.8-flash` (constant) | 3.5-flash-lite; 2.5-flash; Gemini 4 Argon | Latest stable Flash, no Blaze; 2.5 deprecated; Argon needs Blaze |
| 3 | JSON | `responseSchema` + validation + clamp | Parse text, strip fences | Eliminates fence/malformed class; clamp stays as safety net |
| 4 | Enhance | Plain text output | JSON wrapper | Output is a single markdown doc, matches old prompt |
| 5 | App Check provider | reCAPTCHA Enterprise, auto-refresh | reCAPTCHA v3 | Only provider the AI Logic docs name for web |
| 6 | Tokens | Limited-use tokens on; replay protection optional | Session tokens | Shorter validity, small cost; replay protection is console toggle later |
| 7 | AI SDK loading | Dynamic import in ai.js | Static import in firebase.js | Keeps initial bundle small; App Check still inits early |
| 8 | Admin gating | Client guard only; accept guest-devtools risk | Require auth; Cloud Function proxy | No server allowed; auth doesn't distinguish admin; Spark caps cost |
| 9 | Temperature/thinking | SDK defaults, no `maxOutputTokens` cap | Tuned temp, low token cap | Thinking tokens count toward output cap and could truncate JSON; revisit if scores unstable [DEFERRED] |
| 10 | Bulk rank | Concurrency 3 (SP03) | Higher | Project-level RPM on free tier |

## Manual steps (owner; consolidated for SP06)
1. Firebase console → AI Logic → Get started → Gemini Developer API (enables the two APIs).
2. GCP Fraud Defense: create Web reCAPTCHA Enterprise key for `cc.tejitpabari.com` (no checkbox challenge); do NOT add `localhost`.
3. Console → App Check → register web app with reCAPTCHA Enterprise key; enforce for Firebase AI Logic (baseline "Enforced").
4. Console → App Check → Manage debug tokens: register the dev token printed in the browser console.
5. Put `VITE_RECAPTCHA_SITE_KEY` in the build env/`.env`.
6. GCP console → Firebase AI Logic API quotas: lower per-user RPM (~10).

## Risks / Open Questions
- [RESOLVED: Spark] Gemini 3.x Flash on Developer API needs no Blaze. Verify with the 10-line smoke call before porting (SP06 checklist).
- [RESOLVED: bounded] Guest devtools abuse: see Abuse model.
- [RESOLVED: proceed] Docs say App Check enforcement mandatory 2026-11-02, six days from now; cutover must already have App Check configured, no unenforced window.
- [DEFERRED] Model-id retirement: 404 handled with message; Remote Config not used.
- [DEFERRED] Replay protection enforcement (needs SDK >= 12.14.0, monitor metric first).
- [DEFERRED] Gemini temperature tuning if re-rank deltas are large.
- Note: SDK `AIErrorCode` names unverified (docs omit them); implementation reads typings. Not blocking.
- No [OPEN] items.

## Acceptance Criteria
- `ai.js` has no stub throw; three functions return exactly the shapes in the contract table.
- `npm test` passes unit tests for `ai-shape.js`: valid parse/enhance/rank; missing score id → 3; "4.7"/"abc"/9/0 → 4/3/5/1; tags outside allowed list dropped; empty title/content rejected; fenced enhance output unfenced; `interest` never in rank schema; inverted criterion prompt line present. Tests need no network.
- Dev (debug token) and prod (reCAPTCHA) builds both get a valid App Check token; AI call without it fails with the App Check message, not a hang.
- Manual comparison: re-rank 3 existing ideas (e.g. `ai-card-game` feasibility 3/ttb 2/learning 4/impact 3/originality 3, `apartment-review`, plus one with extreme scores); record old vs new in the PR; pass = mean absolute difference <= 1.0 per criterion and no NaN/missing ids. Large drift triggers a prompt/temperature review, not a block.
- Airplane-mode, quota, and forced-malformed-response tests each show one readable message and leave the idea unchanged.
- No `@anthropic-ai/sdk`, API key, or `process.env` reference remains in `src/lib/ai*.js`.
- Guest sessions: no AI button rendered; calling `ai.rankIdea` as guest throws 'Admin only'.
