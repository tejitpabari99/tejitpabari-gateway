---
date: 2026-09-27
title: Agent Docs Viewer
status: new
tags: []
link: ''
ranked: false
scores: {}
github: ''
brief: ''
---

An ADHD-friendly reader inside cc-gateway for the markdown docs that Claude dev skills (`dev-design`, `dev-tasks`, `dev-review`, etc.) generate in each repo's `docs/agent_files/` folder — PRD.md, TASKS.md, review reports. Right now those docs (PRDs 280–660 lines, TASKS.md up to 1200+ lines) only exist as raw files scattered across `/root/projects/*`, with no board view, TL;DR-first reading, or cross-repo overview.

## Recommended approach

Local-clone reads, not the GitHub API: cc-gateway already runs on the same machine as `/root/projects/*`, so reading straight off disk is simpler, always fresh, needs no token, and is the only option that covers repos with no GitHub remote (e.g. `cc-gateway` itself, `hospital-bill-checker`). Fall back to the GitHub API only if the public site ever runs on a different machine than this box — currently unverified.

## MVP

- `/docs` — repo list (doc counts, last-updated)
- `/docs/[repo]` — sub-project board (status badges, TASKS.md checkbox progress)
- `/docs/[repo]/[...path]` — doc view: TL;DR pinned, sections collapsed with one open at a time (focus mode), auto-generated TOC
- Reuses existing `marked` + `gray-matter` + `.prose` CSS stack; new `src/lib/docs.js` mirroring `src/lib/ideas.js`

## Later

- Read/unread tracking + "changed since last read"
- AI auto-summary when no `summary:` frontmatter exists
- Cross-repo search

## Dependencies / open questions

Works best once skill outputs carry YAML frontmatter (`status`, `summary`, `date`) and a consistent folder layout — today none of the sampled docs have frontmatter. Effort estimate: ~1–2 days for MVP. Open questions: is the public cc-gateway origin actually this box; should `/docs` be admin-only or guest-visible like `/ideas`; which repos to include; crontick uses a different doc layout (`docs/specs/`, `docs/decisions/`) with no `agent_files/` at all, so the viewer needs to handle that shape too.

Full investigation: `/root/files/dev-skills-audit/02-doc-viewer-investigation.md`
