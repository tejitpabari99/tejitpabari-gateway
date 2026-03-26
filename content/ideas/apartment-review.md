---
date: 2026-03-26
title: Apartment Review & Search
status: new
tags: []
link: ''
ranked: true
scores:
  feasibility: 2
  time_to_build: 5
  learning_value: 4
  impact: 3
  originality: 2
github: ''
brief: ''
---

Honest apartment reviews and better search tooling. Current platforms (Prometheus, Zillow) don't show honest reviews, don't show exact prices by filter, and have poor filtering options.

## Features
- Scrape apartment data from existing sites and build proper filtering (price, washer/dryer, parking, etc.)
- Honest peer reviews — unlocked after you submit your own review for a month
- Detailed reviews covering location, management, cleanliness, and more
- Aggregate reviews from Google, Yelp, and Reddit in one place
- Incentivize first reviewers (e.g. $5 gift card)

## Ranking Analysis (Auto-rank)

Feasibility is low because scraping major platforms like Zillow violates their ToS and they actively block scrapers, while building a trustworthy review ecosystem from scratch requires significant user acquisition effort and cold-start problem solving. Time to build is rated high difficulty (5) because it involves scraping infrastructure, anti-bot circumvention, review aggregation from multiple APIs, a gating/unlock system, and incentive management — easily a multi-month project. Originality is weak since ApartmentRatings, Yelp, Google Reviews, and even newer platforms like Radpad already occupy this space, making differentiation hard despite the valid pain points identified.
