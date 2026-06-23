---
number: 0037
title: Graph as the cross-skill signal-integration contract
date: 2026-06-22
status: accepted
tier: large
source: docs/changes/five-signal-dashboard-panel/proposal.md
---

## Context

The `eval-fail-rate` signal in the five-signal dashboard panel must consume the output of
`harness:outcome-eval` — the skill that records whether shipped changes pass or fail post-merge
evaluation. But the two are being built in parallel: the dashboard panel ships now, and
`harness:outcome-eval` has not yet shipped. A normal producer/consumer integration would couple
them by import or shared file, forcing one to wait on the other and creating a hard dependency
between two independently-evolving skills.

Two facts make a looser coupling possible. First, `execution_outcome` is already a registered
node type in the knowledge graph (`packages/graph/src/types.ts`). Second, the dashboard already
reads the graph at runtime through `GraphStore` (`packages/dashboard/src/server/gather/graph.ts`).
So a shared substrate already exists between the two skills without either importing the other.

This decision records Spec 534 Decision #2
(`docs/changes/five-signal-dashboard-panel/proposal.md`) as a standalone architectural pattern,
because it establishes the graph as the integration contract for cross-skill signals generally,
not just for this one signal.

## Decision

The **knowledge graph node shape is the only shared contract** between the dashboard's
`eval-fail-rate` signal and the `harness:outcome-eval` producer.

The dashboard reads `findNodes({ type: 'execution_outcome' })` and depends on exactly two fields
of each node's metadata: `metadata.result` (`'success' | 'failure'`) and `metadata.timestamp`
(ISO string). It has zero import coupling and zero file coupling to `harness:outcome-eval`. When
no `execution_outcome` nodes exist — because the producer has not yet shipped or has not yet run
— the signal returns `status: 'pending'` with a null value, **not** an error.

This aligns with STRATEGY.md's graph-as-durable-substrate bet: the graph is the place where one
skill's output becomes another skill's input, decoupled in time and in code. Future signals and
skills that need to consume another skill's output should follow the same pattern — agree on a
node type and a small set of metadata fields, and consume defensively.

## Consequences

**Positive:**

- The dashboard panel and `harness:outcome-eval` develop fully in parallel; neither blocks the
  other, and either can ship first.
- The coupling is reversible — the consumer reads a query, not a linked module, so the producer
  can change its internals freely as long as the node shape holds.
- The pattern is reusable: future signals and future skills can integrate through the graph the
  same way, with the graph as the rendezvous point rather than direct imports.

**Negative:**

- The contract is **implicit in the node shape**. A producer that renames or retypes
  `metadata.result` or `metadata.timestamp` silently breaks the consumer — there is no compiler
  error and no failing import. The only guards are this ADR and the provider's defensive
  field-skipping.

**Neutral:**

- The consumer soft-fails when the graph is missing or cannot be loaded: it degrades to
  `pending`/`error` on its own card rather than affecting the rest of the panel.

## Alternatives considered

- **Direct import of `harness:outcome-eval` types.** Rejected — it couples two skills built in
  parallel and forces a build/ship ordering between them, defeating the point of independent
  development.
- **A shared TypeScript interface package for the outcome shape.** Rejected as premature: there
  is exactly one consumer today, and extracting a package for a single consumer adds a versioned
  artifact and release coordination cost out of proportion to the benefit.
- **A file-based handoff under `.harness/`.** Rejected — the graph is already the durable
  substrate both skills touch, and inventing a parallel file channel would duplicate it while
  adding its own staleness and corruption concerns.

## Implementation

- `packages/dashboard/src/server/signals/providers/eval-fail-rate.ts` — queries
  `findNodes({ type: 'execution_outcome' })`, filters to the 30-day window on
  `metadata.timestamp`, computes the failure fraction from `metadata.result`, and returns the
  `pending` result when no such nodes exist.
- `packages/graph/src/types.ts` — declares the `execution_outcome` node type that forms the
  contract. The two metadata marker fields the consumer depends on are `result`
  (`'success' | 'failure'`) and `timestamp` (ISO string); a producer must preserve both.
