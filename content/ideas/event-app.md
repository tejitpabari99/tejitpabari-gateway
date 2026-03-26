---
date: 2026-03-26
title: Event App with Friend Sharing
status: new
tags: []
link: ''
ranked: true
scores:
  feasibility: 3
  time_to_build: 2
  learning_value: 4
  impact: 3
  originality: 2
github: ''
brief: ''
---

An app to discover and share events with friends.

## Two types of events

### Public
- A public calendar of events, filterable and searchable
- Location-based or global
- Anyone can subscribe

### Private (the interesting part)
- Create private events in your own calendar
- Friends subscribe to your calendar by finding your name and sending a friend request
- Organize friends into groups
- Events can be visible to all subscribers, selected friend groups, or kept private with an optional password
- Pass events along to specific friend groups or make them public
- RSVP support, see who's attending, set reminders
- Easily manage friend groups and access
- Similar to Partiful, but with a calendar layer

## Ranking Analysis (Auto-rank)

This is a technically feasible project but involves substantial complexity — friend graphs, real-time RSVP, calendar sync, group permissions, and notification systems all compound the build time significantly, earning a low time-to-build score. The learning value is high because it touches auth, social graphs, event-driven data, and privacy/access control in meaningful ways. However, originality suffers because this space is well-trodden (Partiful, Facebook Events, Luma, Meetup) and the idea doesn't introduce a sufficiently differentiated mechanic to stand out, which also limits projected impact.
