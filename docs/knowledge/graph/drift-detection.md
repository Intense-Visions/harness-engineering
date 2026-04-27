---
type: business_rule
domain: graph
tags: [drift, reconciliation, contradictions, snapshot]
---

# Knowledge Drift Detection Rules

Structural drift detection compares pre-extraction and post-extraction graph snapshots to classify changes in business knowledge.

## Classification System

| Classification  | Severity | Safety        | Auto-Action               |
| --------------- | -------- | ------------- | ------------------------- |
| `new`           | low      | safe          | Stage automatically       |
| `stale`         | high     | probably-safe | Auto-remove (source gone) |
| `drifted`       | medium   | probably-safe | Prompt for confirmation   |
| `contradicting` | critical | unsafe        | Never auto-resolve        |

## Iron Law

Contradicting findings (same entity name from different sources with different content) are never auto-resolved. The human must decide which source is authoritative. This applies in all modes including CI.

## Drift Score

A normalized 0.0-1.0 metric computed from the ratio of unresolved findings (drifted + stale + contradicting) to total entries. A low drift score with one critical contradiction is still a FAIL verdict.

## Contradiction Detection

Cross-source contradictions are detected using Levenshtein distance for fuzzy matching. Contradiction types include: value_mismatch, definition_conflict, temporal_conflict, and status_divergence. Contradictions are never auto-resolved regardless of similarity score.

## Verdict Rules

- **PASS** — Zero unresolved findings after pipeline
- **WARN** — Only `new` findings remain (low severity)
- **FAIL** — Any `contradicting`, `stale`, or `drifted` remain
