---
slug: "contributor-trust-tiering"
milestone: "v5.0 — Trust & Security Model"
order: 113
---

### Select gates by contributor trust tier

- **Status:** planned
- **Spec:** —
- **Summary:** Harness gates are uniform per repository: the same checks run for a maintainer and for a first-time contributor from one of tens of thousands of forks. That is simultaneously too strict and too weak — it wastes compute on trusted changes and applies code-authored-by-strangers to the same pipeline that holds secrets. It also collides with a structural platform gate: fork pull requests require human approval before workflows run, and on a measured dogfood consumer **47 of 100 workflow runs never reached a verdict** (33 awaiting approval, 14 cancelled), which is finished work parked behind a person. Build: declared trust tiers (maintainer, returning contributor, first-time, automated) with a gate profile per tier — secret-free sandboxed verification for untrusted changes, full pipeline for trusted ones, and an explicit promotion path as a contributor's history accumulates. Related but distinct from `risk-tiered-review-gate`, which tiers by *what the change touches*; this tiers by *who wrote it*, and both dimensions are needed.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1545
