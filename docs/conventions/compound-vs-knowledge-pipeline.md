# Compound vs Knowledge-Pipeline: Operational Guidance

This document gives contributors concrete guidance on when to write a compound
solution doc versus when to add structural facts to the knowledge pipeline. For
the high-level architectural rationale, see
[ADR-0003](../knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md).

## Decision Tree

Ask, in order:

1. **Did you just solve a specific problem (bug, incident, gnarly debugging
   session, hard-won architectural insight)?**
   → Write a compound doc under `docs/solutions/<track>/<category>/<slug>.md`.

2. **Are you encoding a structural rule the code itself enforces (validation,
   API contract, type invariant, business constant)?**
   → Let the knowledge pipeline extract it from the code (or, if it cannot,
   author a `business_fact` node directly).

3. **Is it both?** Write the compound doc first (the post-mortem narrative),
   then let the pipeline pick up any structural facts the fix introduced
   into the code.

The simple test: **if it would make sense as a "we hit X, here's how we fixed
it" story to a future teammate, it belongs in compound.** If it would make
sense as a row in a domain-rules table, it belongs in the knowledge graph.

## Compound: Post-Mortem Playbooks

Tracks live under `docs/solutions/`:

- `bug-track/` — fix playbooks, debugging post-mortems, regression analyses.
- `knowledge-track/` — design decisions captured after-the-fact, refactors
  with non-obvious tradeoffs, "we tried X first and it failed" narratives.

### Examples

- **bug-track/race-conditions/dashboard-stream-double-subscribe.md** — Two
  React effects subscribed to the same SSE stream after a router refactor;
  the fix was a single `useRef` guard. The narrative (symptom → diagnosis →
  fix → prevention) is the value. The code change itself is a one-liner.

- **knowledge-track/performance/graph-query-cache-warmup.md** — We profiled
  graph queries, discovered cold-cache p95 was 3x warm-cache, and added a
  startup warmup. The decision context (why warmup vs LRU sizing vs query
  rewriting) belongs in compound; the warmup function is just code.

- **bug-track/data-integrity/roadmap-sync-blocked-to-planned.md** — A
  `manage_roadmap sync` bug downgraded `blocked` items to `planned`. The
  playbook captures the regression test pattern and the trap (status fields
  are not always preserved by sync logic). Future agents searching for
  "roadmap sync regression" find this doc.

## Knowledge Pipeline: Structural Domain Facts

`business_fact` nodes capture rules the code itself encodes — extracted by
`packages/graph/src/ingest/` ingestors and materialized into
`docs/knowledge/`. These are not narratives; they are rows.

### Examples

- **Validation rule:** "Pulse retention is capped at 90 days" — extracted
  from `pulse.config.ts` schema bounds. The constant lives in code; the
  pipeline surfaces it as a queryable fact.

- **API contract:** "`POST /api/actions/claim` requires `assigneeId` and
  `taskId`" — extracted from the route handler's zod schema. The schema is
  the source of truth; the knowledge graph mirrors it for cross-cutting
  queries.

- **Domain constant:** "Default maintenance task cadence is daily 8am UTC" —
  declared in `task-registry.ts` as a config object. The pipeline pulls
  it into a fact so dashboards and skills can reason about scheduling
  without re-parsing TypeScript.

## How They Connect at Runtime

Compound output flows back into the knowledge graph via
`packages/graph/src/ingest/BusinessKnowledgeIngestor.ts`:

- `ingestSolutions()` reads markdown under `docs/solutions/`.
- For each solution, it emits a `business_concept` node tagged with the
  track (`bug-track` | `knowledge-track`) and category.
- Subsequent pipeline runs link these concepts to code modules by symbol
  reference, enabling queries like "show me all bug-track playbooks
  referencing `pulse/sanitize.ts`".

So compound docs are not write-only artifacts — they become part of the
queryable knowledge surface, but they enter via the post-mortem path
rather than the structural-extraction path.

## Phase 4.5 Deferred Work

Real third-party adapters (PostHog, Sentry, Stripe) for the pulse subsystem
are deferred to Phase 4.5. Until those land, pulse reports run against the
mock adapters declared in `pulse.config.ts`. Compound docs that reference
production analytics or error-tracking signals should note this dependency
explicitly so they do not appear authoritative before the adapters ship.

## See Also

- [ADR-0003](../knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md) —
  architectural decision and full rationale.
- [ADR-0004](../knowledge/decisions/0004-report-only-maintenance-tasks-for-pulse-and-compound.md) —
  why `compound-candidates` and `product-pulse` run as `report-only` tasks.
- `agents/skills/claude-code/harness-compound/SKILL.md` — agent guidance for
  writing compound docs.
- `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` — agent
  guidance for working with the knowledge pipeline.
