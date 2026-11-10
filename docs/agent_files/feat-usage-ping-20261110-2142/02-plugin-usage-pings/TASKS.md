---
status: draft
summary: 8 tasks - validator checks first, legal docs, two shared recipes, three skill call sites, docs, 0.3.0 release.
date: 2026-11-10
---
# Tasks: SP2 - Plugin usage pings, org identity, consent, legal docs
Source of truth: docs/agent_files/feat-usage-ping-20261110-2142/02-plugin-usage-pings/PRD.md. Code lives in /root/projects/tejit-np-plugin (new branch off `main`). "Tests" = new checks in `.github/scripts/validate_plugin.py` (run by `.github/workflows/validate.yml` on PR and push; no new CI task needed) plus the existing plugin validators and ZIP build. No PRD item is [OPEN].

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | Validator checks for new files and call sites (test-first) | none | done |
| 2 | TERMS.md, PRIVACY.md, README note | 1 | done |
| 3 | Shared recipes: identity.md and usage-ping.md | 1 | done |
| 4 | Identity step in start and partner-event-finder | 3 | done |
| 5 | install-automation: identity, guide_started, fetch_guide failure | 3 | done |
| 6 | partner-event-finder run-log pings (batch_done, step_failed) | 3, 4 | done |
| 7 | CONNECTORS and docs updates | 2, 4, 5, 6 | done |
| 8 | Release 0.3.0 (versions, CHANGELOG, validate, ZIP) | 1-7 | done |

## Task 1 - Validator checks for new files and call sites (test-first)
What it is / what it means: The repo's "tests" are the checks in `validate_plugin.py`. Write them first so they fail until the feature exists, then later tasks turn them green (Decisions 1, 7, 11).
What changes at a high level: Add checks that: `TERMS.md` and `PRIVACY.md` exist at repo root; `start/references/identity.md` and `usage-ping.md` exist; the start, partner-event-finder and install-automation call-site files reference `identity.md` / `usage-ping.md`; `share-feedback` references neither; the notice URL in `identity.md` equals the `main` blob URL of `TERMS.md`; `usage-ping.md` has `origin`, `x_run`, `t` and no `reason`. The existing neutral-wording rule (no word "Claude") already covers the new files.
Done when: running `python3 .github/scripts/validate_plugin.py` fails with clear messages for each missing piece before tasks 2-6, and each check is shown to fail on a deliberately bad fixture or missing file.

## Task 2 - TERMS.md, PRIVACY.md, README note
What it is / what it means: Plain-language legal docs at repo root, cross-linked, no more than the PRD lists (Decision 11; Legal docs section).
What changes at a high level: `TERMS.md` (free, volunteer-made, MIT, as-is, no warranty, owner Tejit Pabari, use means accepting metrics, changes by repo edit). `PRIVACY.md` is only the plain collected/never-collected list copied exactly from SP1's canonical list; no deletion process, hosting, retention, opt-out or funder text. `README.md` gets a one-line intro note and links to both (GitHub blob URLs on `main`).
Done when: both files exist and link each other; the PRIVACY list matches SP1's PRD list item for item; README links present; the Task 1 existence checks and the README link check pass.

## Task 3 - Shared recipes: identity.md and usage-ping.md
What it is / what it means: The two shared files in `plugin/skills/start/references/` that hold all identity and ping logic (Decisions 1, 3, 4, 6, 7, 12-15).
What changes at a high level: `identity.md`: numbered idempotent identity check (known in conversation, memory note, Drive `metadata.txt` only if Drive already loaded, then consent notice / org question / uid generation, save, `setup_done` once per new uid). Exact notice text with TERMS blob URL, then the org question, nothing more. Org normalization and `@` re-ask rule, Python uid snippet with made-up-hex fallback, memory-and-Drive-unavailable line. `usage-ping.md`: the single GET URL template, origin mapping, fixed tool/event/step table, silent/single-try/ignore-response/no-curl rules, skip when no consent or no fetch tool. Add the keep-`org`/`uid`/`consent_shown` rule to `root-metadata.md`.
Done when: the exact notice and URL template strings are present; no `reason`, no "metrics" wording; validator checks for both files and the URL match pass; `claude plugin validate plugin` passes.

## Task 4 - Identity step in start and partner-event-finder
What it is / what it means: Run the identity check at entry of `start` (right after the welcome message) and `partner-event-finder` (phase 0b, right after the update check) (Decision 2, 3).
What changes at a high level: Add the step and reference to `identity.md` in `start/SKILL.md` and in partner-event-finder phase 0; `start`'s root-metadata creation and the partner-event-finder onboarding refresh write `org`, `uid`, `consent_shown` from the conversation. Update-check file stays untouched. `setup_done` sent via the recipe with tool_name = skill entered.
Done when: both files reference `identity.md`; validator call-site checks pass for them; `00-update-check.md` is unchanged in the diff; skill frontmatter/reference checks pass.

## Task 5 - install-automation: identity, guide_started, fetch_guide failure
What it is / what it means: Same identity step for install-automation, plus its two pings (Decisions 2, 8).
What changes at a high level: Add the identity step at entry (no update check exists there). After step 2 validates the folder and before fetching, a bold numbered "Usage step (required, silent)" sends `guide_started` with `x_automation` = folder name. In step 3, if the guide cannot be fetched, one `step_failed` with `step=fetch_guide` only. Steps sit before any closing message.
Done when: `SKILL.md` references `identity.md` and `usage-ping.md` with those two numbered usage steps; no `reason` param; skip-silently wording present; validator checks pass.

## Task 6 - partner-event-finder run-log pings (batch_done, step_failed)
What it is / what it means: Ping anchored to the mandatory Log row in `prompts/05-run-log.md` (Decisions 5, 8, 14, 15).
What changes at a high level: Right after the Log row (phases find-sources / collect-events, also refresh via 04 alone) a required silent step sends `batch_done`: n = orgs in batch, fail = orgs left Needs input/Unreadable or not completed, ok = n - fail, x_run = the Log row's Run ID, mode=test only when Log Scope is `sample 5`, counts capped at 5,000. When the run or setup phase stopped on an error: one `step_failed` per run, `step` from the fixed list only, x_run = Run ID, no `batch_done` if no org finished. Not written to the Log or reports.
Done when: `05-run-log.md` has both numbered steps with the stated parameters and references `usage-ping.md`; no `reason`; validator call-site check passes.

## Task 7 - CONNECTORS and docs updates
What it is / what it means: Keep documentation honest and the docs checks green.
What changes at a high level: `plugin/CONNECTORS.md`: web page reading now needed by every skill (also for anonymous usage counts); `share-feedback` unchanged. `docs/how-it-works.md`: new "Usage metrics and privacy" section (what is sent, where identity is saved). `docs/skills/{start,partner-event-finder,install-automation}.md` flows (Mermaid) and use cases updated. `docs/README.md` links TERMS/PRIVACY. `docs/releasing.md` "What CI checks" lists the new checks.
Done when: link check and skill-docs Mermaid check in `validate_plugin.py` pass; no word "Claude" in `plugin/` text; the new docs section matches PRIVACY.md.

## Task 8 - Release 0.3.0 (versions, CHANGELOG, validate, ZIP)
What it is / what it means: MINOR release per `docs/releasing.md` (Decision 10).
What changes at a high level: Bump `plugin/.claude-plugin/plugin.json` and `plugin/gemini-extension.json` to 0.3.0; `metadata.version` 0.3.0 for `start`, `partner-event-finder`, `install-automation`; `share-feedback` stays 0.1.2. `plugin/CHANGELOG.md` 0.3.0: user bullets (asked organization name once, usage notice, Terms), "Project changes: none", maintainer notes. Build the dist ZIP with `python3 scripts/build_zip.py` (uncommitted; `dist/` is not committed). Owner steps (merge only after SP1 live, refresh marketplace copy, real-world checks with org `tejit_test`) stay in the PRD.
Done when: `claude plugin validate .`, `claude plugin validate plugin`, `python3 .github/scripts/validate_plugin.py --base origin/main` all pass with the new checks; `dist/tejit-np-plugin-0.3.0.zip` builds and contains `skills/start/references/identity.md` and `usage-ping.md` but no `.github/` or `docs/`; version-bump and changelog checks pass.
