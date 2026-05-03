# Plan: Database Design Skills — Phase 1: Core Theory

**Date:** 2026-04-09
**Spec:** docs/changes/database-design-skills/proposal.md
**Estimated tasks:** 9
**Estimated time:** ~45 minutes

## Goal

Author 8 foundational database knowledge skills (Normalization 4 + ACID 2 + CAP/BASE 2) that form the theoretical bedrock all other `db-` skills reference.

## Observable Truths (Acceptance Criteria)

1. When `ls agents/skills/claude-code/ | grep "^db-"` is run, 8 directories are listed: `db-first-normal-form`, `db-second-normal-form`, `db-third-normal-form`, `db-denormalization`, `db-acid-properties`, `db-acid-in-practice`, `db-cap-theorem`, `db-eventual-consistency`.
2. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 8 new skill.yaml files pass SkillMetadataSchema validation (`type: knowledge`, empty tools, empty phases, `state.persistent: false`).
3. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 8 new SKILL.md files pass the knowledge-type section check (`## Instructions` required).
4. Each SKILL.md contains all 7 required sections: `## When to Use`, `## Instructions`, `## Details`, `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
5. Each SKILL.md is 150-250 lines with PostgreSQL-primary examples, at least 2 worked examples, and an anti-patterns subsection.
6. No SKILL.md contains ORM-specific syntax (no Prisma/Drizzle code in prose).
7. Each skill.yaml has `platforms: [claude-code, gemini-cli, cursor, codex]`, `cognitive_mode: advisory-guide`, `tier: 3`, and a `metadata.upstream` provenance link.
8. When `harness validate` is run, validation passes.

## File Map

```
CREATE agents/skills/claude-code/db-first-normal-form/skill.yaml
CREATE agents/skills/claude-code/db-first-normal-form/SKILL.md
CREATE agents/skills/claude-code/db-second-normal-form/skill.yaml
CREATE agents/skills/claude-code/db-second-normal-form/SKILL.md
CREATE agents/skills/claude-code/db-third-normal-form/skill.yaml
CREATE agents/skills/claude-code/db-third-normal-form/SKILL.md
CREATE agents/skills/claude-code/db-denormalization/skill.yaml
CREATE agents/skills/claude-code/db-denormalization/SKILL.md
CREATE agents/skills/claude-code/db-acid-properties/skill.yaml
CREATE agents/skills/claude-code/db-acid-properties/SKILL.md
CREATE agents/skills/claude-code/db-acid-in-practice/skill.yaml
CREATE agents/skills/claude-code/db-acid-in-practice/SKILL.md
CREATE agents/skills/claude-code/db-cap-theorem/skill.yaml
CREATE agents/skills/claude-code/db-cap-theorem/SKILL.md
CREATE agents/skills/claude-code/db-eventual-consistency/skill.yaml
CREATE agents/skills/claude-code/db-eventual-consistency/SKILL.md
```

_Skeleton not produced -- rigor level is fast._

## Tasks

All 8 skill-authoring tasks (Tasks 1-8) are **parallelizable** -- they have no dependencies on each other. Task 9 (validation) depends on all 8 completing.

---

### Task 1: Author db-first-normal-form skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 2-8)
**Files:** `agents/skills/claude-code/db-first-normal-form/skill.yaml`, `agents/skills/claude-code/db-first-normal-form/SKILL.md`

1. Create directory `agents/skills/claude-code/db-first-normal-form/`

2. Create `agents/skills/claude-code/db-first-normal-form/skill.yaml`:

```yaml
name: db-first-normal-form
version: '1.0.0'
description: Atomic values, no repeating groups, and primary key requirement for First Normal Form (1NF)
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-second-normal-form
  - db-third-normal-form
  - db-denormalization
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - normalization
  - first-normal-form
  - 1NF
  - atomic-values
  - repeating-groups
  - primary-key
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/ddl-basics.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-first-normal-form/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# First Normal Form (1NF)`
- Quote: summarize 1NF in one sentence
- `## When to Use`: designing new tables, reviewing schema for normalization violations, refactoring CSV/array columns
- `## Instructions`: 3 rules of 1NF with PostgreSQL examples:
  - Rule 1: Every column holds atomic (indivisible) values. Show a BAD example with comma-separated tags in one column, then the GOOD normalized version with a junction table.
  - Rule 2: No repeating groups (no `phone1`, `phone2`, `phone3` columns). Show BAD example and GOOD normalized version.
  - Rule 3: Every table has a primary key that uniquely identifies each row. Show `CREATE TABLE` with `PRIMARY KEY`.
- `## Details`: Explain why 1NF matters (query correctness, indexing, constraint enforcement). Cover PostgreSQL arrays -- technically violate 1NF but are acceptable for specific use cases (tags, search vectors). Discuss `unnest()` as escape hatch. MySQL callout: MySQL lacks native array types, so 1NF violations manifest as comma-separated strings parsed with `FIND_IN_SET()` (always wrong). Anti-patterns subsection: storing JSON arrays as a normalization shortcut, using `TEXT` columns for structured data, missing primary keys.
- `## Source`: link to PostgreSQL DDL docs and Date's "Introduction to Database Systems"
- `## Process`: standard 3-step (read, apply, verify)
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point (patterns applied, anti-patterns avoided)

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-first-normal-form/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-first-normal-form knowledge skill`

---

### Task 2: Author db-second-normal-form skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1, 3-8)
**Files:** `agents/skills/claude-code/db-second-normal-form/skill.yaml`, `agents/skills/claude-code/db-second-normal-form/SKILL.md`

1. Create directory `agents/skills/claude-code/db-second-normal-form/`

2. Create `agents/skills/claude-code/db-second-normal-form/skill.yaml`:

```yaml
name: db-second-normal-form
version: '1.0.0'
description: Full functional dependency and eliminating partial dependencies for Second Normal Form (2NF)
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-first-normal-form
  - db-third-normal-form
  - db-denormalization
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - normalization
  - second-normal-form
  - 2NF
  - partial-dependency
  - functional-dependency
  - composite-key
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/ddl-constraints.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-second-normal-form/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Second Normal Form (2NF)`
- Quote: summarize 2NF in one sentence
- `## When to Use`: tables with composite primary keys, refactoring update anomalies, reviewing data redundancy
- `## Instructions`:
  - Prerequisite: table must already be in 1NF
  - Define functional dependency with concrete example (order_items table with composite key `(order_id, product_id)`)
  - Show a BAD table where `product_name` depends only on `product_id` (partial dependency on composite key)
  - Show the GOOD decomposition: split into `order_items` and `products` tables
  - Show the PostgreSQL `CREATE TABLE` statements for both
  - Explain: 2NF only applies to tables with composite keys. Tables with a single-column primary key that are in 1NF are automatically in 2NF.
- `## Details`: Explain update anomalies caused by 2NF violations (change product name, must update every order_items row). Discuss insertion anomalies (cannot add a product without an order) and deletion anomalies (deleting last order for a product loses product data). Anti-patterns: using surrogate keys to "hide" partial dependencies (the data redundancy remains even if the formal 2NF violation disappears), composite keys with too many columns (usually a sign of missing normalization).
- `## Source`: PostgreSQL constraints docs, Codd's original 1971 paper reference
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-second-normal-form/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-second-normal-form knowledge skill`

---

### Task 3: Author db-third-normal-form skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-2, 4-8)
**Files:** `agents/skills/claude-code/db-third-normal-form/skill.yaml`, `agents/skills/claude-code/db-third-normal-form/SKILL.md`

1. Create directory `agents/skills/claude-code/db-third-normal-form/`

2. Create `agents/skills/claude-code/db-third-normal-form/skill.yaml`:

```yaml
name: db-third-normal-form
version: '1.0.0'
description: Eliminating transitive dependencies and knowing when 3NF is sufficient for Third Normal Form (3NF)
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-first-normal-form
  - db-second-normal-form
  - db-denormalization
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - normalization
  - third-normal-form
  - 3NF
  - transitive-dependency
  - boyce-codd
  - BCNF
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/ddl-constraints.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-third-normal-form/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Third Normal Form (3NF)`
- Quote: Codd's memorable definition: "every non-key attribute must provide a fact about the key, the whole key, and nothing but the key"
- `## When to Use`: removing redundant data, fixing update anomalies that survive 2NF, deciding between 3NF and BCNF
- `## Instructions`:
  - Prerequisite: table must already be in 2NF
  - Define transitive dependency with example: `employees` table where `department_id -> department_name -> department_budget` (department_name and budget depend on department_id, not employee)
  - Show BAD table with employee + department fields mixed
  - Show GOOD decomposition into `employees` and `departments`
  - PostgreSQL `CREATE TABLE` with `REFERENCES` constraint
  - Explain when 3NF is sufficient: "For most OLTP applications, 3NF is the target. BCNF and higher normal forms solve edge cases that rarely appear in practice."
  - Brief BCNF comparison: 3NF allows some redundancy when a candidate key is part of a transitive dependency; BCNF eliminates it completely but can make some queries impossible without joins
- `## Details`: The "3NF is enough" heuristic with real-world justification. Discuss lookup tables pattern (status codes, country codes) as classic 3NF extraction. When to stop normalizing (OLTP vs OLAP tradeoff). Anti-patterns: over-normalizing lookup data that never changes independently, creating single-column lookup tables for boolean-like values.
- `## Source`: PostgreSQL docs, Codd 1971, Kent "A Simple Guide to Five Normal Forms"
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-third-normal-form/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-third-normal-form knowledge skill`

---

### Task 4: Author db-denormalization skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-3, 5-8)
**Files:** `agents/skills/claude-code/db-denormalization/skill.yaml`, `agents/skills/claude-code/db-denormalization/SKILL.md`

1. Create directory `agents/skills/claude-code/db-denormalization/`

2. Create `agents/skills/claude-code/db-denormalization/skill.yaml`:

```yaml
name: db-denormalization
version: '1.0.0'
description: When and how to intentionally denormalize for performance, read-heavy patterns, and materialized views
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-first-normal-form
  - db-second-normal-form
  - db-third-normal-form
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - denormalization
  - materialized-view
  - read-performance
  - redundant-data
  - caching
  - CQRS
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/rules-materializedviews.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-denormalization/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Denormalization`
- Quote: summary of intentional denormalization as a performance tradeoff
- `## When to Use`: optimizing read-heavy workloads, dashboard/reporting queries, reducing expensive joins, caching computed aggregates
- `## Instructions`:
  - Rule: normalize first, denormalize only when you have measured proof of a performance problem
  - Technique 1: Precomputed columns. Example: storing `order_total` on orders table instead of `SUM(line_items.price * line_items.quantity)` every read. Show PostgreSQL trigger to keep it consistent.
  - Technique 2: Materialized views. Show `CREATE MATERIALIZED VIEW monthly_sales AS ...` with `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Explain when to use vs. denormalized columns.
  - Technique 3: Duplicated columns for join avoidance. Example: copying `customer_name` into `orders` to avoid joining `customers` on every order list query. Show the consistency risk and mitigation (trigger or application-level sync).
  - Technique 4: Summary/aggregate tables for analytics. Show a `daily_metrics` table updated by a scheduled job.
- `## Details`: Decision framework: measure query latency, identify the join or aggregation bottleneck, choose the lightest denormalization that solves it. Discuss the consistency tax (every denormalized copy is a consistency obligation). PostgreSQL `MATERIALIZED VIEW` refresh strategies (manual, `pg_cron`, application-triggered). MySQL callout: MySQL lacks `CONCURRENTLY` refresh, requires full lock. Anti-patterns: denormalizing without measurement, denormalizing when an index would suffice, treating denormalization as the default rather than the exception.
- `## Source`: PostgreSQL materialized views docs, "Designing Data-Intensive Applications" (Kleppmann)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-denormalization/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-denormalization knowledge skill`

---

### Task 5: Author db-acid-properties skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-4, 6-8)
**Files:** `agents/skills/claude-code/db-acid-properties/skill.yaml`, `agents/skills/claude-code/db-acid-properties/SKILL.md`

1. Create directory `agents/skills/claude-code/db-acid-properties/`

2. Create `agents/skills/claude-code/db-acid-properties/skill.yaml`:

```yaml
name: db-acid-properties
version: '1.0.0'
description: Atomicity, consistency, isolation, and durability — practical implications and failure modes
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-acid-in-practice
  - db-cap-theorem
  - db-eventual-consistency
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - ACID
  - atomicity
  - consistency
  - isolation
  - durability
  - transactions
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/transaction-iso.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-acid-properties/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# ACID Properties`
- Quote: one-sentence summary of what ACID guarantees
- `## When to Use`: designing transactional workflows, evaluating database selection, debugging data inconsistencies, understanding failure modes
- `## Instructions`: Cover each property with a concrete PostgreSQL example:
  - **Atomicity**: Bank transfer example. Show `BEGIN; UPDATE accounts SET balance = balance - 100 WHERE id = 1; UPDATE accounts SET balance = balance + 100 WHERE id = 2; COMMIT;`. Explain what happens on failure (ROLLBACK undoes partial work). Show `SAVEPOINT` for partial rollback within a transaction.
  - **Consistency**: Constraints enforce invariants. Show `CHECK (balance >= 0)` constraint. Transaction that would violate it is rejected entirely. Distinguish database consistency (constraint satisfaction) from CAP theorem consistency (linearizability).
  - **Isolation**: Concurrent transactions see consistent snapshots. Show two concurrent sessions updating the same row -- PostgreSQL's default Read Committed behavior. Brief mention that isolation levels trade correctness for throughput (details in `db-isolation-levels`).
  - **Durability**: Once `COMMIT` returns, data survives crashes. Brief mention of WAL (details in `db-acid-in-practice`).
- `## Details`: What ACID does NOT guarantee (application-level invariants beyond CHECK constraints, cross-database consistency, network partition handling). Failure modes per property: atomicity failure (partial commit -- should never happen in PostgreSQL), consistency failure (constraint not defined), isolation failure (wrong isolation level chosen), durability failure (fsync disabled, battery-backed cache failure). MySQL callout: InnoDB is ACID-compliant; MyISAM is not (no transactions). Anti-patterns: auto-commit mode for multi-statement operations, assuming ACID means "no bugs", relying on application code for invariants that belong in CHECK constraints.
- `## Source`: PostgreSQL transaction docs, Gray & Reuter "Transaction Processing: Concepts and Techniques"
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-acid-properties/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-acid-properties knowledge skill`

---

### Task 6: Author db-acid-in-practice skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-5, 7-8)
**Files:** `agents/skills/claude-code/db-acid-in-practice/skill.yaml`, `agents/skills/claude-code/db-acid-in-practice/SKILL.md`

1. Create directory `agents/skills/claude-code/db-acid-in-practice/`

2. Create `agents/skills/claude-code/db-acid-in-practice/skill.yaml`:

```yaml
name: db-acid-in-practice
version: '1.0.0'
description: WAL, fsync, crash recovery, and durability guarantees across database engines
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-acid-properties
  - db-cap-theorem
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - WAL
  - write-ahead-log
  - fsync
  - crash-recovery
  - durability
  - checkpoint
  - redo-log
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/wal-intro.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-acid-in-practice/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# ACID in Practice`
- Quote: one-sentence summary focusing on implementation mechanisms
- `## When to Use`: tuning durability vs. performance, understanding crash recovery, debugging data loss after crash, configuring WAL settings
- `## Instructions`:
  - **Write-Ahead Logging (WAL)**: Explain the invariant -- changes written to WAL before data files. Show PostgreSQL WAL flow: client COMMIT -> WAL write -> fsync WAL -> return success to client -> (later) checkpoint writes dirty pages to data files. Show `SHOW wal_level;` and `SELECT pg_current_wal_lsn();`.
  - **fsync and durability**: Explain `fsync_at_checkpoint` and `synchronous_commit`. Show the tradeoff: `SET synchronous_commit = off;` gains ~5x throughput but risks losing last few milliseconds of committed transactions on crash. When this is acceptable (session data, analytics events) vs. not (financial transactions).
  - **Crash recovery**: PostgreSQL replays WAL from last checkpoint on startup. Show `pg_controldata` output excerpt showing last checkpoint location. Explain why recovery time is proportional to `checkpoint_timeout` and `max_wal_size`.
  - **Checkpoints**: Explain the checkpoint process (write dirty buffers, fsync, advance recovery point). Show `CHECKPOINT;` manual trigger and `log_checkpoints = on` for monitoring.
- `## Details`: MySQL callout: InnoDB uses redo log (analogous to WAL) and doublewrite buffer (protects against partial page writes -- PostgreSQL uses full-page writes for this). Cloud durability: AWS RDS/Aurora replicates WAL to 3 AZs before acknowledging commit (stronger than single-node fsync). The `full_page_writes` setting and why disabling it risks data corruption on power failure. Anti-patterns: disabling fsync for benchmarks and forgetting to re-enable, setting `synchronous_commit = off` globally, assuming cloud storage means durability is "free" (EBS can still lose in-flight writes).
- `## Source`: PostgreSQL WAL docs, "PostgreSQL 14 Internals" (Rogov)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-acid-in-practice/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-acid-in-practice knowledge skill`

---

### Task 7: Author db-cap-theorem skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-6, 8)
**Files:** `agents/skills/claude-code/db-cap-theorem/skill.yaml`, `agents/skills/claude-code/db-cap-theorem/SKILL.md`

1. Create directory `agents/skills/claude-code/db-cap-theorem/`

2. Create `agents/skills/claude-code/db-cap-theorem/skill.yaml`:

```yaml
name: db-cap-theorem
version: '1.0.0'
description: Consistency, availability, partition tolerance — practical meaning and common misunderstandings
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-eventual-consistency
  - db-acid-properties
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - CAP-theorem
  - consistency
  - availability
  - partition-tolerance
  - distributed-systems
  - CP
  - AP
metadata:
  author: community
  upstream: 'arxiv.org/abs/1509.05393'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-cap-theorem/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# CAP Theorem`
- Quote: one-sentence Brewer's theorem statement
- `## When to Use`: choosing between distributed database architectures, evaluating consistency vs. availability tradeoffs, designing systems that span multiple datacenters
- `## Instructions`:
  - **The three properties defined precisely**: Consistency (linearizability -- every read returns the most recent write), Availability (every non-failing node returns a response), Partition tolerance (system operates despite network splits). Emphasize: CAP consistency is NOT ACID consistency -- they are different concepts that share a name.
  - **The theorem**: During a network partition, you must choose between C and A. You cannot drop P because partitions are a fact of distributed systems. Show a concrete scenario: two PostgreSQL replicas, network splits, client writes to replica A -- does replica B serve stale reads (AP) or refuse reads (CP)?
  - **CP systems**: PostgreSQL with synchronous replication (refuses writes if replica unreachable). Show `synchronous_standby_names` config. Etcd, ZooKeeper, Consul.
  - **AP systems**: PostgreSQL with asynchronous replication (serves stale reads during partition). Cassandra, DynamoDB default mode, CouchDB.
  - **The spectrum**: In practice, you tune consistency on a per-operation basis, not per-system. Show DynamoDB example: strong consistency for account balance reads, eventual consistency for product catalog reads.
- `## Details`: Common misunderstandings debunked: "pick 2 of 3" is misleading (you always need P, so it is really C vs. A during partitions), CAP says nothing about latency, CAP applies only during partitions (during normal operation you can have all three). The PACELC extension: during Partition choose A or C; Else (no partition) choose Latency or Consistency. Kleppmann's criticism of CAP as too imprecise for engineering decisions. Anti-patterns: using CAP to justify eventual consistency when strong consistency is achievable, treating single-node PostgreSQL as a "CAP choice" (CAP only applies to distributed systems), claiming a system is "CA" (impossible in a network).
- `## Source`: Brewer 2000 conjecture, Gilbert & Lynch 2002 proof, Kleppmann "Please stop calling databases CP or AP" (2015), arxiv.org/abs/1509.05393
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-cap-theorem/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-cap-theorem knowledge skill`

---

### Task 8: Author db-eventual-consistency skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-7)
**Files:** `agents/skills/claude-code/db-eventual-consistency/skill.yaml`, `agents/skills/claude-code/db-eventual-consistency/SKILL.md`

1. Create directory `agents/skills/claude-code/db-eventual-consistency/`

2. Create `agents/skills/claude-code/db-eventual-consistency/skill.yaml`:

```yaml
name: db-eventual-consistency
version: '1.0.0'
description: BASE properties, convergence strategies, and conflict resolution patterns for eventually consistent systems
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-cap-theorem
  - db-acid-properties
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - eventual-consistency
  - BASE
  - conflict-resolution
  - CRDTs
  - last-write-wins
  - convergence
  - replication-lag
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/warm-standby.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-eventual-consistency/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Eventual Consistency`
- Quote: one-sentence summary of eventual consistency guarantee
- `## When to Use`: designing systems with read replicas, understanding replication lag behavior, choosing conflict resolution strategies, working with distributed caches or queues
- `## Instructions`:
  - **BASE defined**: Basically Available (system appears to work), Soft state (state may change without input due to convergence), Eventually consistent (reads converge to latest write given enough time). Contrast with ACID point by point.
  - **Replication lag in PostgreSQL**: Show `SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;` on a replica. Explain: async replication means the replica is always slightly behind. Show a real-world scenario: user writes profile update, immediately reads from replica, sees stale data.
  - **Convergence strategies**:
    - Last-Write-Wins (LWW): Simplest. Timestamp-based. Show the problem: clock skew can discard valid writes.
    - Version vectors: Each node tracks a version per other node. Detect concurrent writes instead of silently discarding.
    - CRDTs (Conflict-free Replicated Data Types): Data structures that merge automatically (G-Counter, OR-Set). Show a G-Counter example for distributed page view counting.
    - Application-level resolution: When business logic determines the merge (e.g., shopping cart -- union of items).
  - **Read-your-writes consistency**: Pattern where the writing session reads from the primary (or waits for replica catch-up). Show PostgreSQL `synchronous_commit = remote_apply` as one mechanism.
- `## Details`: The consistency spectrum (strong -> sequential -> causal -> eventual). When eventual consistency is safe (read-heavy, tolerance for staleness) vs. dangerous (account balances, inventory counts). PostgreSQL logical replication and its conflict handling (last-write-wins by default). MySQL callout: MySQL Group Replication offers "virtually synchronous" mode as a middle ground. Anti-patterns: assuming eventual means "consistent soon enough" without measuring actual lag, using eventual consistency for operations that require read-your-writes, ignoring conflict resolution strategy and hoping conflicts do not happen.
- `## Source`: PostgreSQL replication docs, Vogels "Eventually Consistent" (2008), Shapiro et al. CRDT survey (2011)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: standard 2-point

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-eventual-consistency/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-eventual-consistency knowledge skill`

---

### Task 9: Validate all 8 skills

**Depends on:** Tasks 1-8
**Parallelizable:** no
**Files:** none (validation only)

[checkpoint:human-verify] -- Verify all 8 skills are authored before running validation.

1. Verify all 8 directories exist:

   ```bash
   ls -d agents/skills/claude-code/db-first-normal-form agents/skills/claude-code/db-second-normal-form agents/skills/claude-code/db-third-normal-form agents/skills/claude-code/db-denormalization agents/skills/claude-code/db-acid-properties agents/skills/claude-code/db-acid-in-practice agents/skills/claude-code/db-cap-theorem agents/skills/claude-code/db-eventual-consistency
   ```

2. Verify line counts (150-250 each):

   ```bash
   wc -l agents/skills/claude-code/db-*/SKILL.md
   ```

3. Run structure tests:

   ```bash
   npx vitest run agents/skills/tests/structure.test.ts
   ```

4. Run schema tests:

   ```bash
   npx vitest run agents/skills/tests/schema.test.ts
   ```

5. Verify no ORM syntax leaked into any skill:

   ```bash
   grep -r -i "prisma\|drizzle\|typeorm\|sequelize" agents/skills/claude-code/db-*/SKILL.md
   ```

   Expected: no matches.

6. Verify all skill.yaml files have required fields:

   ```bash
   grep -l "cognitive_mode: advisory-guide" agents/skills/claude-code/db-*/skill.yaml | wc -l
   ```

   Expected: 8.

7. Run: `harness validate`

8. If all pass, commit any remaining changes: `chore(skills): validate phase 1 core theory skills`
