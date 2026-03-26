---
date: 2026-03-26
title: AI Test Prep Generator
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

Auto-generate practice questions for certification exams using GPT. Initially built around PMP exam prep.

## Background
Currently preparing for PMP. Existing options like PMP Pocket charge $20/month for only ~1,100 questions. The goal is to auto-generate a large bank of high-quality questions for free.

## Features
- Understands source content (e.g. the PMBOK guide)
- Understands the format and style of exam questions
- Generates a large number of practice questions in the correct format
- Provides answers with explanations — why the correct answer is right, why the others are wrong, and which section of the guide the question refers to
- Question correlation coefficient — if two questions are too similar, don't show both in the same session
- Ability to mark questions as important or for revisit
- Add words, phrases, and concepts as personal learning notes while going through questions

## Ranking Analysis (Auto-rank)

This is technically feasible with modern LLMs and well-understood prompt engineering patterns, though ensuring consistent question quality and accurate PMBOK citations requires careful validation work. The feature set is moderately complex — correlation coefficients, spaced repetition logic, and personal notes push build time beyond a simple weekend project into weeks of real effort. The originality score is low because AI-powered quiz/flashcard generators are a saturated space (Quizlet AI, various GPT wrappers), and the PMP-specific angle, while practically motivated, doesn't represent a novel technical or product insight.
