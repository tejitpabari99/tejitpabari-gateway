---
date: 2026-03-26
title: Code Crawler
status: new
tags: []
link: ''
ranked: true
scores:
  feasibility: 4
  time_to_build: 3
  learning_value: 4
  impact: 3
  originality: 2
github: ''
brief: ''
---

Crawls through a codebase and for each function records key information, creating a map of all functions. Similar to auto-generated docs, but for the entire codebase.

## Features
- Creates a structured map of all functions and their purpose
- Can generate Mermaid diagrams from the map
- Can be fed to an AI as context so it doesn't need to explore all files from scratch
- Supports git diffs — updates the map based on what changed

## Ranking Analysis (Auto-rank)

This is a well-scoped, technically feasible project using existing AST parsing libraries and LLM APIs, though building robust multi-language support and git diff tracking adds meaningful complexity, putting time-to-build in the moderate range. The learning value is solid — you'd gain experience with AST traversal, code analysis, and AI context management. However, originality is low since tools like Sourcegraph, CodeSee, and various doc generators already occupy this space, and the AI-feeding angle is a common pattern in developer tooling right now.
