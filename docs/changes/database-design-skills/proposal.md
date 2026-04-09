# Database Design Knowledge Skills (Wave 2b)

## Overview

Fill the conceptual layer beneath the existing ORM skills. Engineers using Prisma or Drizzle are implicitly making database design decisions without understanding the fundamentals. These 42 skills teach the durable principles — normalization, indexing, transactions, schema patterns — that remain true regardless of which ORM or engine is in use.

**Keywords:** normalization, indexing, ACID, transactions, schema-design, query-planning, concurrency, sharding, partitioning, migrations, connection-pooling

### Goals

- A complete novice following these skills produces schema and query designs indistinguishable from an expert's
- Every existing `prisma-*` and `drizzle-*` skill gains a bidirectional link to the foundational concept it implements
- PostgreSQL-primary examples with MySQL callouts where differences are material
- Flat `db-{topic}` naming, shipped all at once

## Decisions

| Decision                          | Rationale                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `db-{topic}` naming               | Short, unambiguous, consistent with `prisma-`/`drizzle-` prefix convention                            |
| Flat catalog, no hubs or grouping | Proven by Wave 1 (55 skills) and Wave 2a (13 skills). Dispatcher handles discovery. YAGNI.            |
| Bidirectional cross-references    | ORM skills updated to point back to `db-` skills, creating "why <-> how" graph traversal              |
| PostgreSQL-primary with callouts  | Dominant engine in existing skill ecosystem. Concrete examples without bloating line count.           |
| All at once, no phasing           | Reference material, not tutorials. No dependency ordering needed for consumption. Simpler execution.  |
| 150-250 lines per SKILL.md        | Wave 1/2a standard. Enough for worked examples and anti-patterns without becoming textbooks.          |
| Framework-agnostic prose          | No ORM syntax in `db-` skills. Cross-references handle the "how to do this in Prisma/Drizzle" bridge. |

## Technical Design

### Skill Format

All 42 skills follow the established knowledge skill format:

- `type: knowledge` in skill.yaml
- `cognitive_mode: advisory-guide`
- `tier: 3`
- Empty `phases`, `tools`, and `state`
- `platforms: [claude-code, gemini-cli, cursor, codex]`
- `metadata.upstream` provenance links to authoritative sources (PostgreSQL docs, Use The Index Luke, etc.)
- SKILL.md uses `## Instructions` / `## Details` progressive disclosure split
- 150-250 lines per SKILL.md with worked examples, anti-patterns section, and real-world citations

### Complete Skill List (42 skills)

#### Normalization (4)

1. `db-first-normal-form` — Atomic values, no repeating groups, primary key requirement
2. `db-second-normal-form` — Full functional dependency, eliminating partial dependencies
3. `db-third-normal-form` — Eliminating transitive dependencies, when 3NF is sufficient
4. `db-denormalization` — When and how to intentionally denormalize for performance, read-heavy patterns

#### Indexing (6)

5. `db-btree-index` — B-tree structure, range queries, ordering, default index type
6. `db-hash-index` — Hash indexes, equality-only lookups, when to prefer over B-tree
7. `db-composite-index` — Multi-column indexes, column ordering, leftmost prefix rule
8. `db-partial-index` — Filtered indexes, reducing index size, conditional indexing
9. `db-covering-index` — Index-only scans, INCLUDE columns, avoiding heap lookups
10. `db-expression-index` — Indexes on computed expressions, functional indexes, GIN/GiST

#### Query Planning (4)

11. `db-explain-reading` — Reading EXPLAIN/EXPLAIN ANALYZE output, cost estimation, actual vs estimated rows
12. `db-scan-types` — Sequential scan, index scan, bitmap scan, index-only scan — when each is chosen
13. `db-query-statistics` — pg_stats, histogram bounds, selectivity estimation, ANALYZE command
14. `db-query-rewriting` — Rewriting queries for planner efficiency, CTEs vs subqueries, EXISTS vs IN

#### Schema Patterns (6)

15. `db-polymorphic-associations` — Single-table inheritance, class-table inheritance, shared FK patterns
16. `db-entity-attribute-value` — EAV pattern, when justified, why usually avoided, alternatives
17. `db-adjacency-list` — Parent-child via foreign key, recursive CTEs, depth queries
18. `db-nested-sets` — Left/right numbering, fast reads, expensive writes, when to use
19. `db-closure-table` — Ancestor-descendant pairs, fast path queries, materialized paths
20. `db-temporal-data` — Valid-time, transaction-time, bitemporal tables, SCD types

#### ACID (2)

21. `db-acid-properties` — Atomicity, consistency, isolation, durability — practical implications and failure modes
22. `db-acid-in-practice` — WAL, fsync, crash recovery, durability guarantees across engines

#### Transaction Isolation (3)

23. `db-isolation-levels` — Read uncommitted through serializable, PostgreSQL's MVCC-based implementation
24. `db-read-phenomena` — Dirty reads, non-repeatable reads, phantom reads, serialization anomalies
25. `db-isolation-selection` — Choosing isolation levels for specific workloads, performance vs correctness

#### Concurrency (4)

26. `db-optimistic-locking` — Version columns, conditional updates, conflict detection and retry
27. `db-pessimistic-locking` — SELECT FOR UPDATE, lock granularity, lock duration
28. `db-mvcc` — Multi-version concurrency control, snapshot isolation, vacuum/bloat
29. `db-deadlock-prevention` — Lock ordering, timeout strategies, detection and resolution

#### CAP/BASE (2)

30. `db-cap-theorem` — Consistency, availability, partition tolerance — practical meaning and common misunderstandings
31. `db-eventual-consistency` — BASE properties, convergence strategies, conflict resolution patterns

#### Data Modeling Patterns (5)

32. `db-time-series` — Append-only tables, partitioning by time, retention policies, TimescaleDB patterns
33. `db-hierarchical-data` — Comparison of adjacency list, nested sets, closure table, materialized path — selection guide
34. `db-graph-in-relational` — Modeling graph relationships in SQL, recursive queries, when to use a graph DB instead
35. `db-document-in-relational` — JSONB columns, when to embed vs normalize, indexing JSON, hybrid modeling
36. `db-audit-trail` — Change tracking, trigger-based vs application-level, immutable append logs

#### Migration Strategy (3)

37. `db-zero-downtime-migration` — Online schema changes, avoiding locks, pg_repack, gh-ost patterns
38. `db-expand-contract` — Add new, migrate data, remove old — safe column/table renames
39. `db-migration-rollback` — Forward-only vs reversible migrations, data backfill safety, blue-green schemas

#### Connection Management (2)

40. `db-connection-pooling` — PgBouncer, pool modes (session/transaction/statement), sizing formulas
41. `db-connection-sizing` — max_connections, per-connection memory, serverless pool constraints

#### Sharding/Partitioning (3)

42. `db-table-partitioning` — Range, list, hash partitioning, partition pruning, declarative partitioning
43. `db-horizontal-sharding` — Shard key selection, cross-shard queries, resharding strategies
44. `db-vertical-partitioning` — Table splitting, hot/cold separation, TOAST and large objects

### Cross-Reference Map (Bidirectional Updates)

Existing ORM skills to be updated with `related_skills` back-references:

| Existing Skill                 | New `db-` References                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `prisma-schema-design`         | `db-first-normal-form`, `db-third-normal-form`, `db-polymorphic-associations` |
| `prisma-transactions`          | `db-acid-properties`, `db-isolation-levels`, `db-optimistic-locking`          |
| `prisma-performance-patterns`  | `db-btree-index`, `db-composite-index`, `db-covering-index`                   |
| `prisma-migrations`            | `db-zero-downtime-migration`, `db-expand-contract`                            |
| `drizzle-schema-definition`    | `db-first-normal-form`, `db-third-normal-form`, `db-polymorphic-associations` |
| `drizzle-transactions`         | `db-acid-properties`, `db-isolation-levels`, `db-optimistic-locking`          |
| `drizzle-performance-patterns` | `db-btree-index`, `db-composite-index`, `db-explain-reading`                  |
| `drizzle-migrations`           | `db-zero-downtime-migration`, `db-expand-contract`                            |
| `events-event-sourcing`        | `db-audit-trail`, `db-temporal-data`                                          |
| `microservices-cqrs-pattern`   | `db-eventual-consistency`, `db-denormalization`                               |

## Success Criteria

1. All 42 `db-` skills pass schema validation (`type: knowledge`, empty phases, empty tools, `cognitive_mode: advisory-guide`)
2. Every SKILL.md is 150-250 lines with: Instructions section, Details section, worked examples from real production systems, anti-patterns section
3. All `related_skills` references resolve to existing skills (100% linkage integrity)
4. Bidirectional updates applied to all 10 ORM skill pairs listed in the cross-reference map
5. All 4 platforms listed (`claude-code`, `gemini-cli`, `cursor`, `codex`)
6. PostgreSQL used as reference engine in all concrete examples; MySQL callouts present where behavior differs materially
7. No ORM-specific syntax appears in any `db-` skill prose
8. `metadata.upstream` provenance links included for authoritative sources (PostgreSQL docs, Use The Index Luke, etc.)
9. The novice standard holds: a complete novice following these skills produces schema designs indistinguishable from an expert's

## Implementation Order

Six phases, grouped by conceptual affinity. Each phase produces a self-contained set of skills.

### Phase 1: Core Theory

<!-- complexity: low -->

Author 8 foundational skills: Normalization (4) + ACID (2) + CAP/BASE (2). These are the theoretical bedrock that all other database skills reference.

Skills: `db-first-normal-form`, `db-second-normal-form`, `db-third-normal-form`, `db-denormalization`, `db-acid-properties`, `db-acid-in-practice`, `db-cap-theorem`, `db-eventual-consistency`

### Phase 2: Indexing and Query Planning

<!-- complexity: low -->

Author 10 skills: Indexing (6) + Query Planning (4). The most cross-referenced area — ORM performance skills depend on these concepts.

Skills: `db-btree-index`, `db-hash-index`, `db-composite-index`, `db-partial-index`, `db-covering-index`, `db-expression-index`, `db-explain-reading`, `db-scan-types`, `db-query-statistics`, `db-query-rewriting`

### Phase 3: Schema and Data Modeling

<!-- complexity: low -->

Author 11 skills: Schema Patterns (6) + Data Modeling Patterns (5). Design patterns for structuring data in relational databases.

Skills: `db-polymorphic-associations`, `db-entity-attribute-value`, `db-adjacency-list`, `db-nested-sets`, `db-closure-table`, `db-temporal-data`, `db-time-series`, `db-hierarchical-data`, `db-graph-in-relational`, `db-document-in-relational`, `db-audit-trail`

### Phase 4: Transactions and Concurrency

<!-- complexity: low -->

Author 7 skills: Transaction Isolation (3) + Concurrency (4). Runtime behavior patterns for multi-user database access.

Skills: `db-isolation-levels`, `db-read-phenomena`, `db-isolation-selection`, `db-optimistic-locking`, `db-pessimistic-locking`, `db-mvcc`, `db-deadlock-prevention`

### Phase 5: Operations

<!-- complexity: low -->

Author 8 skills: Migrations (3) + Connection Management (2) + Sharding/Partitioning (3). Operational concerns for production databases.

Skills: `db-zero-downtime-migration`, `db-expand-contract`, `db-migration-rollback`, `db-connection-pooling`, `db-connection-sizing`, `db-table-partitioning`, `db-horizontal-sharding`, `db-vertical-partitioning`

### Phase 6: Cross-References

<!-- complexity: low -->

Apply bidirectional `related_skills` updates to 10 existing ORM skills per the Cross-Reference Map. Run schema validation across all new and modified skills. Verify linkage integrity (all `related_skills` resolve). Final consistency review.

Detailed task breakdown is harness-planning's responsibility.
