---
number: 0003
title: Compound vs knowledge-pipeline scope boundary
date: 2026-05-05
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/feedback-loops/proposal.md
---

## Context

Harness has two knowledge surfaces that can blur into each other: `harness-knowledge-pipeline`
extracts structural domain facts from code into the knowledge graph, and the new
`harness-compound` skill captures solved-problem playbooks (post-mortems) into
`docs/solutions/<track>/<category>/`. Without an explicit boundary, both could end up
trying to own the same artifact and produce drift.

## Decision

- `harness-knowledge-pipeline` extracts **structural domain facts FROM CODE** (entities,
  relationships, invariants) into `business_fact` graph nodes.
- `harness-compound` captures **post-mortem playbooks WRITTEN BY HUMANS/AGENTS** after a
  fix into `docs/solutions/<track>/<category>/<slug>.md`.
- Compound output is a **candidate input** to the knowledge pipeline (via
  `BusinessKnowledgeIngestor.ingestSolutions`, wired in Phase 7); the pipeline never
  writes solution docs.
- Solution docs in `docs/solutions/knowledge-track/` with stable `last_updated` dates are
  candidates for promotion to `business_fact` nodes.

## Consequences

**Positive:**

- Clear ownership: code-derived facts vs. human-derived playbooks live in distinct surfaces.
- One-way flow (compound → pipeline) prevents cycles and double-writes.
- Knowledge-track solutions can graduate into the graph as evidence stabilizes.

**Negative:**

- Authors must decide track at write time; the conventions doc gives examples to reduce
  ambiguity.

**Neutral:**

- The boundary is operational, not enforced by tooling. The conventions doc and code
  review carry the load.
