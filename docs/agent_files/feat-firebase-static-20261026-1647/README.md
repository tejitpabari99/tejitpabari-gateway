# feat/firebase-static — cc-gateway → Firebase (static)

Brief: [brainstorm.md](brainstorm.md)

## Sub-projects

| # | Sub-project | Phase | Depends on | PRD |
|---|---|---|---|---|
| 01 | firebase-foundation — config, hosting targets, SDK init, Google auth/role, Firestore schema + rules + tests | 1 | — | [PRD](01-firebase-foundation/PRD.md) |
| 02 | data-migration — one-time idempotent import of ideas/links/settings | 2 | 01 | [PRD](02-data-migration/PRD.md) |
| 03 | cc-spa-port — adapter-static SPA, Firestore data layer, guest gating, delete server code, docs | 2 | 01 | [PRD](03-cc-spa-port/PRD.md) |
| 04 | go-redirector — static `go` site, REST lookup, 404/410, GA4 `go_click` | 2 | 01 | [PRD](04-go-redirector/PRD.md) |
| 05 | ai-rank-gemini — Firebase AI Logic (Gemini Developer API) + App Check, implements `src/lib/ai.js` | 3 | 01, 03 | [PRD](05-ai-rank-gemini/PRD.md) |
| 06 | deploy-cutover — owner checklist, `docs/DEPLOY.md` runbook, DNS, smoke tests, rollback, retirement | 4 | all | [PRD](06-deploy-cutover/PRD.md) |

```
01 ─┬─> 02 ──────────┐
    ├─> 03 ─> 05 ────┼─> 06
    └─> 04 ──────────┘
```

## Locked decisions (cross-cutting)

- Firebase project `tejitpabari-99`; hosting sites `tejitpabari-cc` (cc.tejitpabari.com), `tejitpabari-go` (go.tejitpabari.com). Spark plan; no Cloud Functions.
- Admin = `tejitpabari99@gmail.com` (verified), in `src/lib/config.js` + `firestore.rules`, drift-checked by a rules test.
- Guest read gated by `settings/main.guestVisibility` in rules; `/` toggle is UI-only.
- Link slugs `[a-z0-9-]+`; `clicks`/`lastClicked`/`redirectType` dropped.
- AI: Gemini via `GoogleAIBackend`, model id one constant; App Check (reCAPTCHA Enterprise) enforced on AI Logic only — NOT Firestore (go. REST call carries no token).
- go.: always HTTP 200, statuses are page content; GA4 `G-9NLS3NG63M` `go_click` fired unconditionally.
- Shared files: `package.json` (01/02/03 edit), `firebase.json` (01 owns, 04 edits `go` block), `src/lib/firebase.js` (01 owns, 05 fills App Check hook), `src/lib/ai.js` (03 stubs, 05 implements), `src/lib/firebase-config.js` (01; read by 04).

## Cross-cutting risks / notes

- App Check enforcement for AI Logic reportedly mandatory from 2026-11-02 — configure before cutover (SP05/SP06).
- No Java on this box → Firestore emulator needs a JDK install (SP01 task).
- Old VPS `content/` is source of truth; owner must supply export before migration (SP06 Phase C).
- `/root/projects/README.md`: cc-gateway row + linkedin-outreach-tool row need updating (SP06).
- No `[OPEN]` items remain in any PRD.
