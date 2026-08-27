---
slug: "semantic-duplicate-detection-at-backlog-scale"
milestone: "Fleet Family — Batch Orchestration"
order: 115
---

### Semantic duplicate detection across a very large backlog

- **Status:** planned
- **Spec:** —
- **Summary:** `issue-fleet` deduplicates as part of triage, but pairwise comparison against a backlog of a few hundred items is a different problem from a backlog of thousands with thousands more arriving monthly. openclaw/openclaw holds 5,726 open issues against roughly 3,927 created in 30 days: at that ratio duplicates are the dominant class, the same defect is reported in a dozen phrasings, and textual similarity is too blunt to separate "same bug" from "same area." Build: an embedding-backed index over open and recently-closed items so intake matching is sub-linear rather than pairwise; canonical-issue election with duplicates linked rather than silently closed; and a confidence threshold below which the pair is surfaced for a human instead of merged. Note the failure mode that makes this dangerous to automate carelessly — a wrongly-merged duplicate silently discards a distinct report, and the reporter has no recourse.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1547
