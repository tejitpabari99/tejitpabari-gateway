---
date: 2026-03-26
title: API Docs Chatbot
status: new
tags: []
link: ''
ranked: true
scores:
  feasibility: 4
  time_to_build: 2
  learning_value: 4
  impact: 3
  originality: 2
github: ''
brief: ''
---

An embeddable chatbot focused specifically on API documentation. Potentially open source.

## Features
- Developers create API docs and add examples
- Embed a chat widget in any website for users to search through the docs
- Self-hosted or cloud-hosted
- RAG over the provided knowledge base
- Parses Swagger docs, Markdown files, HTML, and more
- Works with GitHub docs, SwaggerUI, ReadTheDocs, etc.
- Webhook support to update the RAG when docs change

## Stretch goals
- A directory of all available API doc bots — users can query multiple bots at once to compare APIs or combine them into a full solution
- Available as MCPs in GPT, Claude, etc.
- Health checks for all bots

## Ranking Analysis (Auto-rank)

This is technically feasible using well-established RAG patterns, vector databases, and existing embedding models, but the full feature set (multi-format parsing, webhook sync, self-hosting, MCP integrations) makes it a substantial build — likely months of serious engineering effort. The learning value is solid as it touches RAG pipelines, document parsing, embedding, and developer tooling. However, originality is low since tools like Mintlify, Docusaurus AI, and various RAG-on-docs products already occupy this space, and the core concept is fairly well-trodden.
