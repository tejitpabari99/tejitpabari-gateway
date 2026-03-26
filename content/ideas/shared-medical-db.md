---
date: 2026-03-26
title: Shared Medical DB
status: new
tags: []
link: ''
ranked: true
scores:
  feasibility: 1
  time_to_build: 1
  learning_value: 4
  impact: 5
  originality: 2
github: ''
brief: ''
---

A shared database for medical records that enables interoperability between healthcare apps.

## Background
EPIC succeeds largely because of a singular, centralized database. Copying it at scale is nearly impossible now. Cerner is the only other major competitor, formed from mergers of companies each with their own architecture.

## Concept
A shared medical DB where:
- Any app that contributes data gets access to all other data
- Apps that don't contribute significant data can purchase access
- New apps and services can be built on top of it
- Enables true interoperability across healthcare

## Questions to explore
- Regulatory and compliance requirements
- Data ownership and privacy
- Governance model

## Ranking Analysis (Auto-rank)

This idea faces near-insurmountable barriers: HIPAA/GDPR compliance, data sovereignty laws, entrenched incumbents with contractual lock-in, trust/governance challenges across competing health systems, and the political complexity of convincing competitors to share data under a unified model — making feasibility extremely low and build time essentially open-ended (years to decades). The impact ceiling is enormous if achieved, as true healthcare interoperability would transform patient outcomes globally. Originality is modest since this mirrors existing efforts like HL7 FHIR, CommonWell, Carequality, and ONC mandates that are already attempting to solve exactly this problem.
