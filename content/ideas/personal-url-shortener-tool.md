---
date: 2026-03-26T00:00:00.000Z
title: Personal URL Shortener Tool
status: completed
tags:
  - Personal
link: 'https://go.tejitpabari.com/'
brief: >-
  A self-hosted Bitly-style URL shortener running on tejitpabari.com. Paste in
  URLs in bulk and generate personal short links that auto-redirect.
ranked: true
scores:
  feasibility: 5
  time_to_build: 1
  learning_value: 2
  impact: 2
  originality: 1
  interest: 3
github: >-
  https://github.com/tejitpabari99/tejitpabari-gateway/tree/main/src/routes/links
---
## Overview
A personal URL shortener hosted on my own domain (tejitpabari.com), similar to Bitly, but for personal use.

## Features
- Paste in a batch of URLs at once
- Generate short links under my own domain
- Auto-redirect from shortened URLs to the original destinations

## Notes
- Self-hosted, personal use only

## Ranking Analysis (Auto-rank)

URL shorteners are an extremely well-trodden problem with countless open-source solutions (YOURLS, Shlink, etc.) that can be self-hosted with minimal effort, making this highly feasible but very low on originality. The learning value is limited since this is a solved problem with established patterns (hash/slug generation, redirect logic), offering little novel engineering challenge. Personal-use-only scope significantly constrains the impact, and the core feature set described is functionally identical to tools built since the early 2000s.
