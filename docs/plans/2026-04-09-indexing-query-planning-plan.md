# Plan: Database Design Skills -- Phase 2: Indexing and Query Planning

**Date:** 2026-04-09
**Spec:** docs/changes/database-design-skills/proposal.md
**Estimated tasks:** 11
**Estimated time:** ~55 minutes

## Goal

Author 10 database knowledge skills covering Indexing (6) and Query Planning (4) that teach durable index and query-planner concepts independent of any ORM.

## Observable Truths (Acceptance Criteria)

1. When `ls agents/skills/claude-code/ | grep "^db-"` is run, 18 directories are listed (8 from Phase 1 + 10 new: `db-btree-index`, `db-hash-index`, `db-composite-index`, `db-partial-index`, `db-covering-index`, `db-expression-index`, `db-explain-reading`, `db-scan-types`, `db-query-statistics`, `db-query-rewriting`).
2. Each new skill.yaml passes schema validation: `type: knowledge`, empty `tools: []`, `cognitive_mode: advisory-guide`, `tier: 3`, `state.persistent: false`, `platforms: [claude-code, gemini-cli, cursor, codex]`, and a `metadata.upstream` provenance link.
3. Each new SKILL.md contains all required sections: `## When to Use`, `## Instructions` (with `### Key Concepts`, `### Worked Example`, `### Anti-Patterns`, `### PostgreSQL Specifics`), `## Details` (with `### Advanced Topics`, `### Engine Differences`, `### Real-World Case Studies`), `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
4. Each SKILL.md is 150-250 lines with PostgreSQL-primary examples and at least one MySQL callout where behavior differs materially.
5. No SKILL.md contains ORM-specific syntax (no Prisma/Drizzle code).
6. Each skill.yaml has `related_skills` cross-referencing other `db-*` skills (both Phase 1 and Phase 2) and relevant ORM skills where applicable.
7. When `harness validate` is run, validation passes.

## File Map

```
CREATE agents/skills/claude-code/db-btree-index/skill.yaml
CREATE agents/skills/claude-code/db-btree-index/SKILL.md
CREATE agents/skills/claude-code/db-hash-index/skill.yaml
CREATE agents/skills/claude-code/db-hash-index/SKILL.md
CREATE agents/skills/claude-code/db-composite-index/skill.yaml
CREATE agents/skills/claude-code/db-composite-index/SKILL.md
CREATE agents/skills/claude-code/db-partial-index/skill.yaml
CREATE agents/skills/claude-code/db-partial-index/SKILL.md
CREATE agents/skills/claude-code/db-covering-index/skill.yaml
CREATE agents/skills/claude-code/db-covering-index/SKILL.md
CREATE agents/skills/claude-code/db-expression-index/skill.yaml
CREATE agents/skills/claude-code/db-expression-index/SKILL.md
CREATE agents/skills/claude-code/db-explain-reading/skill.yaml
CREATE agents/skills/claude-code/db-explain-reading/SKILL.md
CREATE agents/skills/claude-code/db-scan-types/skill.yaml
CREATE agents/skills/claude-code/db-scan-types/SKILL.md
CREATE agents/skills/claude-code/db-query-statistics/skill.yaml
CREATE agents/skills/claude-code/db-query-statistics/SKILL.md
CREATE agents/skills/claude-code/db-query-rewriting/skill.yaml
CREATE agents/skills/claude-code/db-query-rewriting/SKILL.md
```

_Skeleton not produced -- rigor level is fast._

## Tasks

All 10 skill-authoring tasks (Tasks 1-10) are **parallelizable** -- they have no dependencies on each other. Task 11 (validation) depends on all 10 completing.

---

### Task 1: Author db-btree-index skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 2-10)
**Files:** `agents/skills/claude-code/db-btree-index/skill.yaml`, `agents/skills/claude-code/db-btree-index/SKILL.md`

1. Create directory `agents/skills/claude-code/db-btree-index/`

2. Create `agents/skills/claude-code/db-btree-index/skill.yaml`:

```yaml
name: db-btree-index
version: '1.0.0'
description: B-tree index structure, range queries, ordering, and default index type behavior
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
  - db-hash-index
  - db-composite-index
  - db-covering-index
  - db-expression-index
  - db-explain-reading
  - db-scan-types
  - prisma-performance-patterns
  - drizzle-performance-patterns
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - b-tree
  - index
  - range-query
  - ordering
  - CREATE-INDEX
  - index-scan
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/indexes-types.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-btree-index/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# B-Tree Indexes`
- Quote: one-sentence summary -- default index type, supports equality and range queries on ordered data
- `## When to Use`: adding indexes for WHERE clauses, ORDER BY optimization, range filtering (BETWEEN, <, >), columns used in joins
- `## Instructions`:
  - `### Key Concepts`: B-tree structure (balanced tree, O(log n) lookups), default index type in PostgreSQL and MySQL, supports equality (=), range (<, >, BETWEEN), ORDER BY, and IS NULL. Show `CREATE INDEX idx_users_email ON users (email);` and explain why the planner chooses this index for `WHERE email = 'x'` and `WHERE email LIKE 'x%'` but NOT `LIKE '%x'`.
  - `### Worked Example`: E-commerce orders table. Show creating a B-tree index on `created_at`, then demonstrate EXPLAIN ANALYZE output for a range query `WHERE created_at BETWEEN '2024-01-01' AND '2024-01-31'` showing Index Scan. Contrast with a query on an unindexed column showing Seq Scan.
  - `### Anti-Patterns`: indexing every column (write overhead, bloat), indexing low-cardinality boolean columns (Seq Scan is cheaper), using B-tree for array containment (use GIN instead), indexing columns never used in WHERE/ORDER BY/JOIN.
  - `### PostgreSQL Specifics`: `CREATE INDEX CONCURRENTLY` for zero-downtime creation, `pg_stat_user_indexes` for usage monitoring, fillfactor setting for write-heavy tables.
- `## Details`:
  - `### Advanced Topics`: index bloat and REINDEX, index-only scans (pointer to db-covering-index), multi-column B-tree (pointer to db-composite-index), correlation and physical ordering.
  - `### Engine Differences`: MySQL InnoDB uses clustered B-tree (primary key IS the table), secondary indexes store PK values not row pointers. PostgreSQL uses heap tables with separate B-tree indexes pointing to ctid. Impact: MySQL secondary index lookups do a double lookup (index -> PK -> clustered index).
  - `### Real-World Case Studies`: SaaS platform with 50M rows, added B-tree on `(tenant_id, created_at)`, query latency dropped from 2.1s to 12ms.
- `## Source`: PostgreSQL indexes-types docs, Use The Index Luke (use-the-index-luke.com)
- `## Process`: standard 3-step (read, apply, verify)
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: indexes created for correct query patterns, anti-patterns avoided

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-btree-index/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-btree-index knowledge skill`

---

### Task 2: Author db-hash-index skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1, 3-10)
**Files:** `agents/skills/claude-code/db-hash-index/skill.yaml`, `agents/skills/claude-code/db-hash-index/SKILL.md`

1. Create directory `agents/skills/claude-code/db-hash-index/`

2. Create `agents/skills/claude-code/db-hash-index/skill.yaml`:

```yaml
name: db-hash-index
version: '1.0.0'
description: Hash indexes for equality-only lookups and when to prefer them over B-tree
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
  - db-btree-index
  - db-composite-index
  - db-explain-reading
  - db-scan-types
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - hash-index
  - equality-lookup
  - hash-function
  - index-type
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/indexes-types.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-hash-index/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Hash Indexes`
- Quote: one-sentence summary -- optimized for equality-only lookups, smaller than B-tree for this use case
- `## When to Use`: equality-only lookups (`WHERE uuid = 'x'`), columns never used in range queries or ORDER BY, high-cardinality columns with only `=` comparisons
- `## Instructions`:
  - `### Key Concepts`: Hash function maps values to buckets (O(1) average lookup). Only supports `=` operator -- cannot do range, ordering, or IS NULL. Syntax: `CREATE INDEX idx_sessions_token ON sessions USING hash (token);`. PostgreSQL hash indexes became WAL-logged and crash-safe in v10 (before that they were unsafe). Smaller than B-tree for pure equality workloads.
  - `### Worked Example`: Session lookup table. Show creating hash index on `session_token` (UUID column). EXPLAIN ANALYZE showing Index Scan using hash index for `WHERE session_token = 'abc-123'`. Compare size with equivalent B-tree: `SELECT pg_size_pretty(pg_relation_size('idx_hash')) vs pg_size_pretty(pg_relation_size('idx_btree'))`.
  - `### Anti-Patterns`: using hash index on columns that also appear in ORDER BY (hash cannot sort), using hash index on low-cardinality columns (waste), using hash index in PostgreSQL < 10 (not crash-safe), choosing hash over B-tree when the size difference is negligible.
  - `### PostgreSQL Specifics`: WAL-logged since PG 10, not replicated in streaming replication before PG 10. `pg_stat_user_indexes` to verify the hash index is actually being used.
- `## Details`:
  - `### Advanced Topics`: hash collisions and bucket overflow pages, hash index internal structure (meta page, bucket pages, overflow pages, bitmap pages), REINDEX for bloated hash indexes.
  - `### Engine Differences`: MySQL InnoDB does not support explicit hash indexes. The Adaptive Hash Index (AHI) is an internal optimization that InnoDB manages automatically -- you cannot create one manually. MySQL MEMORY/HEAP engine supports hash indexes but is rarely used in production.
  - `### Real-World Case Studies`: API gateway with 200M session tokens. Switching from B-tree to hash index on `token` column reduced index size by 40% and lookup latency by 15% for pure equality checks.
- `## Source`: PostgreSQL indexes-types docs, PostgreSQL v10 release notes (hash index durability)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: hash indexes used only for equality-only columns, B-tree preferred when any range/ordering is needed

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-hash-index/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-hash-index knowledge skill`

---

### Task 3: Author db-composite-index skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-2, 4-10)
**Files:** `agents/skills/claude-code/db-composite-index/skill.yaml`, `agents/skills/claude-code/db-composite-index/SKILL.md`

1. Create directory `agents/skills/claude-code/db-composite-index/`

2. Create `agents/skills/claude-code/db-composite-index/skill.yaml`:

```yaml
name: db-composite-index
version: '1.0.0'
description: Multi-column indexes, column ordering strategy, and the leftmost prefix rule
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
  - db-btree-index
  - db-covering-index
  - db-partial-index
  - db-explain-reading
  - db-scan-types
  - prisma-performance-patterns
  - drizzle-performance-patterns
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - composite-index
  - multi-column-index
  - leftmost-prefix
  - column-ordering
  - compound-index
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/indexes-multicolumn.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-composite-index/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Composite Indexes`
- Quote: one-sentence summary -- multi-column indexes that accelerate queries filtering on column combinations, governed by the leftmost prefix rule
- `## When to Use`: queries filtering on multiple columns together, multi-column ORDER BY, queries combining WHERE and ORDER BY on different columns
- `## Instructions`:
  - `### Key Concepts`: Composite index stores entries sorted by (col1, col2, col3) -- like a phone book sorted by (last_name, first_name). The **leftmost prefix rule**: an index on (a, b, c) supports queries on (a), (a, b), and (a, b, c) but NOT (b), (c), or (b, c) alone. Column ordering strategy: put equality columns first, then range columns, then ORDER BY columns (the "ESR" rule: Equality, Sort, Range). Show `CREATE INDEX idx_orders_status_date ON orders (status, created_at);` and explain which queries use it vs which do not.
  - `### Worked Example`: Multi-tenant SaaS orders table. Show index on `(tenant_id, status, created_at)`. Demonstrate with EXPLAIN ANALYZE: Query 1 `WHERE tenant_id = 5 AND status = 'active' AND created_at > '2024-01-01'` -- uses full index. Query 2 `WHERE tenant_id = 5 AND created_at > '2024-01-01'` -- uses first column only. Query 3 `WHERE status = 'active'` -- Seq Scan, cannot use index (skips leftmost column).
  - `### Anti-Patterns`: creating separate single-column indexes instead of one composite (bitmap AND is slower), wrong column order (range column before equality column), too many columns in one index (diminishing returns, write overhead), duplicating the leading column as a separate single-column index (the composite already covers it).
  - `### PostgreSQL Specifics`: PostgreSQL can use an index on (a, b) for `WHERE a = 1 ORDER BY b` without a separate sort step. `pg_stat_user_indexes` to check if composite indexes are being used. Index-only scans with composite indexes (pointer to db-covering-index).
- `## Details`:
  - `### Advanced Topics`: Index skip scan (PostgreSQL 16+ can sometimes skip leading columns), composite indexes with mixed ASC/DESC for complex ORDER BY, index size growth with additional columns.
  - `### Engine Differences`: MySQL InnoDB applies the same leftmost prefix rule but lacks index skip scan. MySQL's query optimizer may use "index merge" to combine single-column indexes as an alternative to composites -- this is usually slower than a well-designed composite. MySQL composite indexes limited to 16 columns (vs PostgreSQL's 32).
  - `### Real-World Case Studies`: E-commerce dashboard with 100M orders. Replacing 3 single-column indexes with one composite `(merchant_id, status, created_at)` reduced query time from 800ms (bitmap AND of 3 indexes) to 5ms (single index scan) and saved 2GB of index storage.
- `## Source`: PostgreSQL multicolumn index docs, Use The Index Luke (concatenated index chapter)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: composite indexes follow ESR column ordering, leftmost prefix rule applied correctly

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-composite-index/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-composite-index knowledge skill`

---

### Task 4: Author db-partial-index skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-3, 5-10)
**Files:** `agents/skills/claude-code/db-partial-index/skill.yaml`, `agents/skills/claude-code/db-partial-index/SKILL.md`

1. Create directory `agents/skills/claude-code/db-partial-index/`

2. Create `agents/skills/claude-code/db-partial-index/skill.yaml`:

```yaml
name: db-partial-index
version: '1.0.0'
description: Filtered indexes with WHERE clauses to reduce index size and target specific query patterns
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
  - db-btree-index
  - db-composite-index
  - db-expression-index
  - db-explain-reading
  - db-scan-types
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - partial-index
  - filtered-index
  - conditional-index
  - WHERE-clause-index
  - index-size
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/indexes-partial.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-partial-index/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Partial Indexes`
- Quote: one-sentence summary -- indexes with a WHERE clause that index only a subset of rows, reducing size and improving performance for targeted queries
- `## When to Use`: queries that always filter on a known condition (e.g., `WHERE deleted_at IS NULL`), soft-delete patterns, status columns where only one status is queried, unique constraints on a subset of rows
- `## Instructions`:
  - `### Key Concepts`: A partial index includes a WHERE clause in the CREATE INDEX statement. Only rows matching the condition are indexed. Syntax: `CREATE INDEX idx_active_orders ON orders (created_at) WHERE status = 'active';`. The planner uses this index only when the query's WHERE clause matches or implies the index predicate. Dramatically smaller than a full index when the filtered subset is small. Partial unique index: `CREATE UNIQUE INDEX idx_unique_active_email ON users (email) WHERE deleted_at IS NULL;` -- enforces uniqueness only for non-deleted users.
  - `### Worked Example`: SaaS task queue with 10M rows, 99% completed. Show creating a partial index `WHERE status = 'pending'` on only the 1% pending rows. EXPLAIN ANALYZE showing Index Scan on partial index vs full-table B-tree. Show index size comparison: full index ~250MB, partial index ~2.5MB.
  - `### Anti-Patterns`: partial index with a condition that matches most rows (no size benefit), forgetting to include the filter predicate in queries (planner cannot use the index), using partial indexes for conditions that change frequently (constant reindexing), overly complex predicates that the planner cannot match.
  - `### PostgreSQL Specifics`: PostgreSQL's planner matches partial index predicates using implication logic -- `WHERE status = 'active' AND created_at > '2024-01-01'` will use an index with `WHERE status = 'active'` because the query implies the predicate. `pg_stat_user_indexes` to verify usage. Partial indexes support UNIQUE constraint.
- `## Details`:
  - `### Advanced Topics`: combining partial with composite indexes, partial GIN indexes on JSONB, partial indexes for multi-tenant isolation (`WHERE tenant_id = 5`), predicate complexity limits.
  - `### Engine Differences`: MySQL does not support partial indexes natively. Workarounds include: (1) generated columns with indexes, (2) covering the condition in a composite index. SQL Server supports "filtered indexes" with identical syntax. MySQL 8.0 functional indexes can approximate some partial index use cases.
  - `### Real-World Case Studies`: Social media platform with 500M posts, 0.1% flagged for review. Partial index `WHERE flagged = true` reduced the moderation queue query from 4.2s (Seq Scan on 500M rows) to 3ms (Index Scan on 500K rows). Index size: 12MB vs 12GB full index.
- `## Source`: PostgreSQL indexes-partial docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: partial indexes target high-selectivity conditions, query predicates match index predicates

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-partial-index/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-partial-index knowledge skill`

---

### Task 5: Author db-covering-index skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-4, 6-10)
**Files:** `agents/skills/claude-code/db-covering-index/skill.yaml`, `agents/skills/claude-code/db-covering-index/SKILL.md`

1. Create directory `agents/skills/claude-code/db-covering-index/`

2. Create `agents/skills/claude-code/db-covering-index/skill.yaml`:

```yaml
name: db-covering-index
version: '1.0.0'
description: Index-only scans using INCLUDE columns to avoid heap table lookups
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
  - db-btree-index
  - db-composite-index
  - db-scan-types
  - db-explain-reading
  - prisma-performance-patterns
  - drizzle-performance-patterns
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - covering-index
  - index-only-scan
  - INCLUDE
  - heap-lookup
  - visibility-map
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/indexes-index-only-scans.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-covering-index/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Covering Indexes`
- Quote: one-sentence summary -- indexes that contain all columns needed by a query, enabling index-only scans that skip heap table access entirely
- `## When to Use`: high-frequency queries selecting a small set of columns, dashboards/reports with predictable SELECT lists, queries bottlenecked by heap random I/O
- `## Instructions`:
  - `### Key Concepts`: A covering index contains every column the query needs (WHERE, SELECT, ORDER BY). When all columns are in the index, PostgreSQL performs an "Index Only Scan" -- it reads only the index, never touching the heap table. The `INCLUDE` clause (PostgreSQL 11+) adds non-searchable payload columns to the index: `CREATE INDEX idx_orders_covering ON orders (status) INCLUDE (total, created_at);`. INCLUDE columns are stored in the index leaf pages but are not part of the search key -- they do not affect sort order or index size as much as adding them as regular index columns.
  - `### Worked Example`: Dashboard query `SELECT status, count(*), sum(total) FROM orders WHERE created_at > '2024-01-01' GROUP BY status`. Show: (1) without covering index -- Index Scan + heap fetches, (2) with `CREATE INDEX idx_orders_cover ON orders (created_at, status) INCLUDE (total)` -- Index Only Scan. EXPLAIN ANALYZE showing "Heap Fetches: 0" (or low number due to visibility map).
  - `### Anti-Patterns`: including too many columns in INCLUDE (bloated index that defeats the purpose), using covering indexes for queries that change SELECT lists frequently, ignoring the visibility map (VACUUM must run for index-only scans to work), putting INCLUDE columns as regular index keys (wastes sort/search overhead).
  - `### PostgreSQL Specifics`: Visibility map: PostgreSQL can only do Index Only Scan for pages marked all-visible. If VACUUM has not run recently, you see "Heap Fetches: N" in EXPLAIN. `VACUUM` and autovacuum are critical for covering index effectiveness. The `INCLUDE` clause is PostgreSQL 11+.
- `## Details`:
  - `### Advanced Topics`: covering indexes with unique constraints (`CREATE UNIQUE INDEX ... INCLUDE (...)`), trade-off analysis (index size vs heap I/O savings), monitoring with `pg_stat_user_indexes.idx_tup_fetch` vs `idx_tup_read`.
  - `### Engine Differences`: MySQL InnoDB's clustered index means all secondary index lookups already "cover" the primary key columns. MySQL uses the term "covering index" when the index contains all columns in the query (no InnoDB "INCLUDE" syntax -- you must add all columns as regular index keys). MySQL EXPLAIN shows "Using index" in Extra column for covering index usage.
  - `### Real-World Case Studies`: Analytics platform reading 20M rows for daily reports. Adding a covering index eliminated 20M random heap reads per query, reducing report generation from 45s to 3s. Trade-off: index size increased by 800MB but total I/O dropped 90%.
- `## Source`: PostgreSQL index-only scans docs, Use The Index Luke
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: covering indexes target high-frequency queries with stable SELECT lists, VACUUM frequency verified

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-covering-index/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-covering-index knowledge skill`

---

### Task 6: Author db-expression-index skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-5, 7-10)
**Files:** `agents/skills/claude-code/db-expression-index/skill.yaml`, `agents/skills/claude-code/db-expression-index/SKILL.md`

1. Create directory `agents/skills/claude-code/db-expression-index/`

2. Create `agents/skills/claude-code/db-expression-index/skill.yaml`:

```yaml
name: db-expression-index
version: '1.0.0'
description: Indexes on computed expressions, functional indexes, and specialized index types (GIN, GiST)
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
  - db-btree-index
  - db-partial-index
  - db-composite-index
  - db-explain-reading
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - expression-index
  - functional-index
  - GIN
  - GiST
  - computed-index
  - jsonb-index
  - full-text-search
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/indexes-expressional.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-expression-index/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Expression and Specialized Indexes`
- Quote: one-sentence summary -- indexes on computed expressions and specialized index types (GIN, GiST) for non-scalar data
- `## When to Use`: case-insensitive searches (`lower(email)`), JSONB key lookups, full-text search, array containment queries, geometric/spatial data
- `## Instructions`:
  - `### Key Concepts`: An expression index indexes the result of a function or expression, not the raw column value. Syntax: `CREATE INDEX idx_users_lower_email ON users (lower(email));`. The query must use the exact same expression for the planner to use the index: `WHERE lower(email) = 'user@example.com'`. **GIN (Generalized Inverted Index)**: designed for values containing multiple elements (arrays, JSONB, full-text). `CREATE INDEX idx_posts_tags ON posts USING GIN (tags);` for `WHERE tags @> ARRAY['postgresql']`. **GiST (Generalized Search Tree)**: for geometric, range, and full-text data. Supports operators like `&&` (overlap), `@>` (contains), `<->` (distance).
  - `### Worked Example`: JSONB metadata search. Table with `metadata JSONB` column. Show: (1) `CREATE INDEX idx_metadata_gin ON events USING GIN (metadata);` for `WHERE metadata @> '{"type": "purchase"}'`. (2) Expression index for specific key: `CREATE INDEX idx_metadata_type ON events ((metadata->>'type'));` for `WHERE metadata->>'type' = 'purchase'`. EXPLAIN ANALYZE comparing GIN path vs expression index path. When to use which: GIN for ad-hoc key queries, expression index for a single known key queried frequently.
  - `### Anti-Patterns`: expression index that does not match the query expression exactly (e.g., index on `lower(email)` but query uses `UPPER(email)`), GIN index on small scalar columns (overkill), forgetting that expression indexes must be maintained on every write (expensive expressions hurt write performance), using GiST when B-tree suffices.
  - `### PostgreSQL Specifics`: `pg_trgm` extension enables trigram GIN indexes for `LIKE '%pattern%'` queries. `CREATE INDEX idx_trgm ON users USING GIN (name gin_trgm_ops);`. Full-text search with `tsvector` and GIN. GIN `fastupdate` setting trades write speed for read speed.
- `## Details`:
  - `### Advanced Topics`: GIN pending list and `gin_pending_list_limit`, GiST vs SP-GiST for different data distributions, BRIN indexes for naturally ordered data (time-series), RUM indexes (extension) for full-text with ordering.
  - `### Engine Differences`: MySQL 8.0 supports functional indexes with similar syntax: `CREATE INDEX idx_lower ON t ((LOWER(col)));`. MySQL has no GIN equivalent -- full-text search uses FULLTEXT indexes with different syntax and capabilities. MySQL spatial indexes use R-tree (similar to GiST) but with more limited operator support.
  - `### Real-World Case Studies`: Multi-tenant SaaS storing tenant config in JSONB. GIN index on config column enabled ad-hoc queries across all config keys without schema changes. Query for `WHERE config @> '{"feature_flags": {"beta": true}}'` went from 12s full scan to 15ms.
- `## Source`: PostgreSQL expressional index docs, PostgreSQL GIN/GiST docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: expression indexes match query expressions exactly, GIN/GiST chosen for appropriate data types

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-expression-index/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-expression-index knowledge skill`

---

### Task 7: Author db-explain-reading skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-6, 8-10)
**Files:** `agents/skills/claude-code/db-explain-reading/skill.yaml`, `agents/skills/claude-code/db-explain-reading/SKILL.md`

1. Create directory `agents/skills/claude-code/db-explain-reading/`

2. Create `agents/skills/claude-code/db-explain-reading/skill.yaml`:

```yaml
name: db-explain-reading
version: '1.0.0'
description: Reading EXPLAIN and EXPLAIN ANALYZE output, understanding cost estimation, and comparing actual vs estimated rows
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
  - db-scan-types
  - db-query-statistics
  - db-query-rewriting
  - db-btree-index
  - db-composite-index
  - db-covering-index
  - prisma-performance-patterns
  - drizzle-performance-patterns
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - EXPLAIN
  - EXPLAIN-ANALYZE
  - query-plan
  - cost-estimation
  - actual-rows
  - execution-time
  - planner
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/using-explain.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-explain-reading/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Reading EXPLAIN Output`
- Quote: one-sentence summary -- how to read query execution plans to identify performance bottlenecks, misestimations, and missing indexes
- `## When to Use`: diagnosing slow queries, verifying index usage, comparing query alternatives, validating schema changes, performance regression investigation
- `## Instructions`:
  - `### Key Concepts`: `EXPLAIN` shows the plan without executing. `EXPLAIN ANALYZE` executes and shows actual timing/rows. Key fields: `cost=startup..total` (arbitrary units based on seq_page_cost), `rows` (estimated), `width` (average row bytes). With ANALYZE: `actual time=startup..total`, `rows` (actual), `loops`. Read plans bottom-up and inside-out (deepest indent executes first). `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` adds shared/local buffer hit/read counts -- essential for I/O diagnosis.
  - `### Worked Example`: Show a complete EXPLAIN ANALYZE output for a JOIN query with a Nested Loop, Index Scan, and Seq Scan. Annotate each line: what the node type means, what the cost numbers mean, where the bottleneck is. Show the "estimated rows: 1, actual rows: 50000" misestimation pattern and explain why it causes nested loop to be chosen over hash join. Then show the fix: `ANALYZE tablename;` to update statistics, re-run EXPLAIN ANALYZE showing corrected plan.
  - `### Anti-Patterns`: using EXPLAIN without ANALYZE (you only see estimates, not reality), ignoring the `rows` discrepancy (estimated vs actual), focusing only on total cost (missing that a child node is the bottleneck), running EXPLAIN ANALYZE on destructive queries without wrapping in a transaction (`BEGIN; EXPLAIN ANALYZE DELETE ...; ROLLBACK;`).
  - `### PostgreSQL Specifics`: `EXPLAIN (FORMAT JSON)` for programmatic parsing. `auto_explain` extension logs slow query plans automatically. `EXPLAIN (ANALYZE, BUFFERS, WAL)` in PG 13+ shows WAL usage. `pg_stat_statements` for identifying which queries need EXPLAIN.
- `## Details`:
  - `### Advanced Topics`: JIT compilation indicators in EXPLAIN, parallel query plans (Workers Planned/Launched), CTEscan nodes and materialization, SubPlan vs InitPlan, understanding "never executed" nodes in conditional plans.
  - `### Engine Differences`: MySQL uses `EXPLAIN` and `EXPLAIN ANALYZE` (MySQL 8.0.18+) with different output format. MySQL shows `type` column (ALL, index, range, ref, const) instead of node names. MySQL `EXPLAIN FORMAT=TREE` is closest to PostgreSQL's output. MySQL lacks BUFFERS equivalent. Key MySQL columns: `type`, `possible_keys`, `key`, `rows`, `filtered`, `Extra`.
  - `### Real-World Case Studies`: API endpoint taking 8s. EXPLAIN ANALYZE revealed a Nested Loop with estimated 10 rows but actual 200K rows due to stale statistics. Running `ANALYZE orders;` updated statistics, planner switched to Hash Join, query dropped to 50ms.
- `## Source`: PostgreSQL using-explain docs, pgMustard (explain analysis tool)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: EXPLAIN ANALYZE output interpreted correctly, misestimations identified and resolved

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-explain-reading/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-explain-reading knowledge skill`

---

### Task 8: Author db-scan-types skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-7, 9-10)
**Files:** `agents/skills/claude-code/db-scan-types/skill.yaml`, `agents/skills/claude-code/db-scan-types/SKILL.md`

1. Create directory `agents/skills/claude-code/db-scan-types/`

2. Create `agents/skills/claude-code/db-scan-types/skill.yaml`:

```yaml
name: db-scan-types
version: '1.0.0'
description: Sequential scan, index scan, bitmap scan, and index-only scan -- when the planner chooses each
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
  - db-explain-reading
  - db-btree-index
  - db-covering-index
  - db-query-statistics
  - db-query-rewriting
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - sequential-scan
  - index-scan
  - bitmap-scan
  - index-only-scan
  - scan-type
  - table-access
  - planner
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/using-explain.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-scan-types/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Scan Types`
- Quote: one-sentence summary -- understanding when the planner chooses sequential scan, index scan, bitmap scan, or index-only scan and why
- `## When to Use`: interpreting EXPLAIN output, understanding why an index is not being used, choosing between adding an index vs accepting a sequential scan, tuning `random_page_cost` and `seq_page_cost`
- `## Instructions`:
  - `### Key Concepts`: Four primary scan types in PostgreSQL:
    1. **Seq Scan**: reads every row in the table. Chosen when: no applicable index, query returns a large fraction of the table (>5-10%), or table is small enough that sequential I/O beats random I/O.
    2. **Index Scan**: traverses the B-tree to find matching rows, then fetches each row from the heap. Chosen for highly selective queries (<5% of rows). Random I/O pattern.
    3. **Bitmap Index Scan / Bitmap Heap Scan**: two-phase approach. Phase 1: scan the index and build a bitmap of matching page locations. Phase 2: fetch pages in physical order (sequential I/O). Chosen for medium selectivity (5-20% of rows) or when combining multiple indexes.
    4. **Index Only Scan**: reads all needed columns from the index, no heap access. Chosen when the index covers all columns in the query and the visibility map confirms pages are all-visible.
       Show the selectivity spectrum: Seq Scan (high %) <-> Bitmap Scan (medium %) <-> Index Scan (low %) <-> Index Only Scan (low % + covering).
  - `### Worked Example`: Single table, same query with different WHERE clause selectivities. Show EXPLAIN ANALYZE for: (1) `WHERE id = 5` -- Index Scan, (2) `WHERE created_at > '2024-06-01'` returning 15% of rows -- Bitmap Heap Scan, (3) `WHERE 1=1` -- Seq Scan, (4) `SELECT id, status FROM orders WHERE status = 'active'` with covering index -- Index Only Scan. Annotate why the planner chose each.
  - `### Anti-Patterns`: forcing index usage with `SET enable_seqscan = off` in production (hides the real problem), assuming Seq Scan is always bad (it is optimal for small tables and low-selectivity queries), ignoring bitmap scan as a warning sign (often means the index is not selective enough or the query returns too many rows).
  - `### PostgreSQL Specifics`: `random_page_cost` (default 4.0) and `seq_page_cost` (default 1.0) control the planner's preference. On SSDs, lower `random_page_cost` to 1.1-1.5. `effective_cache_size` influences whether the planner expects data to be in memory. TID Scan for direct ctid access.
- `## Details`:
  - `### Advanced Topics`: Parallel Seq Scan (PostgreSQL 9.6+), parallel bitmap heap scan, custom scan providers, Bitmap AND/OR for combining multiple indexes, Recheck Condition in bitmap scans (lossy pages).
  - `### Engine Differences`: MySQL InnoDB scan types shown in EXPLAIN `type` column: `ALL` (full table scan = Seq Scan), `index` (full index scan), `range` (index range scan), `ref` (index lookup), `const` (single-row lookup). MySQL lacks bitmap scan -- it uses "index merge" optimization instead. MySQL EXPLAIN `Extra: Using index` = index-only scan.
  - `### Real-World Case Studies`: Microservice with 50M-row events table. Queries returning 2% of rows used Index Scan (random I/O, 3.2s). After lowering `random_page_cost` to 1.1 (SSD storage), planner kept Index Scan but with more accurate cost estimates. Adding a covering index converted to Index Only Scan (180ms).
- `## Source`: PostgreSQL EXPLAIN docs, PostgreSQL planner/optimizer internals
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: scan types identified correctly in EXPLAIN output, planner decisions understood

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-scan-types/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-scan-types knowledge skill`

---

### Task 9: Author db-query-statistics skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-8, 10)
**Files:** `agents/skills/claude-code/db-query-statistics/skill.yaml`, `agents/skills/claude-code/db-query-statistics/SKILL.md`

1. Create directory `agents/skills/claude-code/db-query-statistics/`

2. Create `agents/skills/claude-code/db-query-statistics/skill.yaml`:

```yaml
name: db-query-statistics
version: '1.0.0'
description: pg_stats, histogram bounds, selectivity estimation, and the ANALYZE command
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
  - db-explain-reading
  - db-scan-types
  - db-query-rewriting
  - db-btree-index
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - pg_stats
  - histogram
  - selectivity
  - ANALYZE
  - statistics
  - n_distinct
  - most_common_vals
  - cardinality-estimation
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/planner-stats.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-query-statistics/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Query Statistics and Selectivity`
- Quote: one-sentence summary -- how the planner uses table statistics (pg_stats, histograms, most-common-values) to estimate row counts and choose execution plans
- `## When to Use`: diagnosing planner misestimations, understanding why the planner chose a bad plan, tuning statistics targets, after bulk data loads
- `## Instructions`:
  - `### Key Concepts`: The planner does not look at actual data -- it uses pre-computed statistics stored in `pg_statistic` (accessed via `pg_stats` view). Key statistics: `n_distinct` (estimated distinct values), `most_common_vals` + `most_common_freqs` (top N values and their frequencies), `histogram_bounds` (distribution of non-MCV values in equal-frequency buckets), `null_frac` (fraction of NULL values), `correlation` (physical vs logical ordering). The `ANALYZE` command samples the table and updates these statistics. Autovacuum runs ANALYZE automatically but may lag behind large data changes.
  - `### Worked Example`: Show `SELECT * FROM pg_stats WHERE tablename = 'orders' AND attname = 'status';` with actual output showing `most_common_vals: {active, completed, cancelled}`, `most_common_freqs: {0.85, 0.12, 0.03}`, `n_distinct: 3`. Explain how the planner uses this: for `WHERE status = 'active'`, estimated rows = total_rows \* 0.85. Then show a misestimation scenario: after a data migration that changed the distribution, statistics are stale. `ANALYZE orders;` fixes it. Show `ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;` to increase sample size for skewed distributions.
  - `### Anti-Patterns`: never running ANALYZE after bulk operations (stale stats = bad plans), setting `default_statistics_target` too low for skewed distributions, ignoring `n_distinct` misestimates for high-cardinality columns, disabling autovacuum (also disables auto-ANALYZE).
  - `### PostgreSQL Specifics`: `default_statistics_target` (default 100, max 10000) controls histogram bucket count. Extended statistics for correlated columns: `CREATE STATISTICS stat_name (dependencies) ON col1, col2 FROM table;` (PostgreSQL 10+). `pg_stat_user_tables.last_analyze` shows when ANALYZE last ran.
- `## Details`:
  - `### Advanced Topics`: multivariate statistics (PostgreSQL 10+: dependencies, 12+: MCV lists, 14+: expressions), selectivity estimation for complex predicates (AND/OR/NOT), join selectivity estimation, the 1/n_distinct fallback for unknown values, `pg_statistic_ext` for extended statistics.
  - `### Engine Differences`: MySQL uses `ANALYZE TABLE` (not just `ANALYZE`) and stores statistics in `mysql.innodb_index_stats` and `mysql.innodb_table_stats`. MySQL `innodb_stats_persistent` controls whether stats survive restart. MySQL histogram support added in 8.0: `ANALYZE TABLE t UPDATE HISTOGRAM ON col;`. MySQL's optimizer uses a simpler statistics model -- no extended/multivariate statistics.
  - `### Real-World Case Studies`: Reporting system with daily batch inserts of 5M rows. After each batch, queries degraded because autovacuum had not yet analyzed the new data. Adding `ANALYZE reporting_events;` to the batch job's post-load step kept plans optimal. Selectivity estimation error dropped from 100x to under 2x.
- `## Source`: PostgreSQL planner-stats docs, PostgreSQL row estimation examples docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: statistics freshness verified, misestimations diagnosed via pg_stats

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-query-statistics/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-query-statistics knowledge skill`

---

### Task 10: Author db-query-rewriting skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-9)
**Files:** `agents/skills/claude-code/db-query-rewriting/skill.yaml`, `agents/skills/claude-code/db-query-rewriting/SKILL.md`

1. Create directory `agents/skills/claude-code/db-query-rewriting/`

2. Create `agents/skills/claude-code/db-query-rewriting/skill.yaml`:

```yaml
name: db-query-rewriting
version: '1.0.0'
description: Rewriting queries for planner efficiency -- CTEs vs subqueries, EXISTS vs IN, and sargable predicates
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
  - db-explain-reading
  - db-scan-types
  - db-query-statistics
  - db-btree-index
  - db-composite-index
  - db-denormalization
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - query-rewriting
  - sargable
  - CTE
  - subquery
  - EXISTS
  - IN
  - query-optimization
  - lateral-join
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/queries.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-query-rewriting/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Query Rewriting for Performance`
- Quote: one-sentence summary -- structural query transformations that help the planner choose better execution plans without changing results
- `## When to Use`: slow queries that already have appropriate indexes, queries where EXPLAIN shows suboptimal plan choices, converting application-layer filtering to database-layer filtering, optimizing ORM-generated queries
- `## Instructions`:
  - `### Key Concepts`:
    1. **Sargable predicates**: Predicates that can use indexes. BAD: `WHERE YEAR(created_at) = 2024` (function wrapping prevents index use). GOOD: `WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'`. Rule: keep the indexed column on one side of the operator, bare and untransformed.
    2. **EXISTS vs IN**: `WHERE id IN (SELECT id FROM other)` vs `WHERE EXISTS (SELECT 1 FROM other WHERE other.id = main.id)`. EXISTS short-circuits (stops at first match). IN materializes the full subquery result. For large subquery results, EXISTS is usually faster. The planner may optimize both to the same plan, but not always.
    3. **CTEs vs subqueries**: Before PostgreSQL 12, CTEs were always materialized (optimization fence). PostgreSQL 12+ can inline CTEs. Use `WITH cte AS MATERIALIZED (...)` or `NOT MATERIALIZED` to control. MySQL 8.0 CTEs are always merged (opposite behavior).
    4. **LATERAL joins**: Replace correlated subqueries in SELECT lists with LATERAL joins for better planner visibility and parallelization.
  - `### Worked Example`: Show a slow query using `WHERE EXTRACT(month FROM created_at) = 3 AND EXTRACT(year FROM created_at) = 2024`. Rewrite to sargable form. Show EXPLAIN ANALYZE before (Seq Scan) and after (Index Scan). Then show a correlated subquery `SELECT *, (SELECT count(*) FROM order_items WHERE order_items.order_id = o.id) FROM orders o` rewritten as `SELECT o.*, li.cnt FROM orders o LEFT JOIN LATERAL (SELECT count(*) as cnt FROM order_items WHERE order_id = o.id) li ON true`. Show EXPLAIN improvement.
  - `### Anti-Patterns`: wrapping indexed columns in functions or casts (`WHERE col::text = '5'`), using `OR` chains instead of `IN` lists, `SELECT DISTINCT` to mask a bad join (fix the join instead), using CTEs for "readability" when they prevent optimization (pre-PG12), `OFFSET` for pagination on large tables (use keyset pagination instead).
  - `### PostgreSQL Specifics`: `enable_*` GUC flags to test plan alternatives (never in production). `pg_hint_plan` extension for hinting when the planner cannot be convinced. `EXPLAIN (ANALYZE, SETTINGS)` in PG 15+ shows non-default settings affecting the plan.
- `## Details`:
  - `### Advanced Topics`: keyset pagination (`WHERE id > last_seen_id ORDER BY id LIMIT N`) vs OFFSET, materialized views for expensive aggregations, `UNION ALL` vs `UNION` (UNION implies DISTINCT sort), subquery flattening and when it fails, join elimination for unused LEFT JOINs.
  - `### Engine Differences`: MySQL CTEs (8.0+) are always derived tables (merged or materialized automatically -- no `MATERIALIZED` keyword). MySQL lacks LATERAL joins (use correlated subqueries instead). MySQL's optimizer handles IN-to-EXISTS transformation automatically in most cases. MySQL `STRAIGHT_JOIN` forces join order (equivalent to PostgreSQL `SET join_collapse_limit = 1`).
  - `### Real-World Case Studies`: E-commerce API with 200ms p99 latency target. Top slow query used `WHERE LOWER(email) = lower(?)` on 50M users table. Rewriting to use an expression index `CREATE INDEX ON users (lower(email))` plus sargable predicate `WHERE lower(email) = lower(?)` dropped latency from 1.2s to 2ms. Second optimization: replacing `OFFSET 10000 LIMIT 20` pagination with keyset pagination reduced paginated queries from 400ms to 4ms.
- `## Source`: PostgreSQL queries docs, Use The Index Luke (WHERE clause chapter)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: queries use sargable predicates, EXPLAIN confirms improved plan after rewrite

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-query-rewriting/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-query-rewriting knowledge skill`

---

### Task 11: Validate all 10 skills and update arch baseline

**Depends on:** Tasks 1-10
**Parallelizable:** no
**Files:** none created -- validation only

1. Verify all 10 directories exist:

   ```bash
   ls agents/skills/claude-code/ | grep "^db-" | wc -l
   ```

   Expected: 18 (8 from Phase 1 + 10 new)

2. Verify every SKILL.md is 150-250 lines:

   ```bash
   for skill in db-btree-index db-hash-index db-composite-index db-partial-index db-covering-index db-expression-index db-explain-reading db-scan-types db-query-statistics db-query-rewriting; do
     echo "$skill: $(wc -l < agents/skills/claude-code/$skill/SKILL.md) lines"
   done
   ```

3. Verify required sections in each SKILL.md:

   ```bash
   for skill in db-btree-index db-hash-index db-composite-index db-partial-index db-covering-index db-expression-index db-explain-reading db-scan-types db-query-statistics db-query-rewriting; do
     echo "=== $skill ==="
     grep -c "## When to Use\|## Instructions\|## Details\|## Source\|## Process\|## Harness Integration\|## Success Criteria" agents/skills/claude-code/$skill/SKILL.md
   done
   ```

   Expected: 7 for each skill

4. Verify no ORM syntax:

   ```bash
   grep -rli "prisma\.\|drizzle\.\|findMany\|findFirst\|schema\.prisma\|drizzle(" agents/skills/claude-code/db-btree-index/SKILL.md agents/skills/claude-code/db-hash-index/SKILL.md agents/skills/claude-code/db-composite-index/SKILL.md agents/skills/claude-code/db-partial-index/SKILL.md agents/skills/claude-code/db-covering-index/SKILL.md agents/skills/claude-code/db-expression-index/SKILL.md agents/skills/claude-code/db-explain-reading/SKILL.md agents/skills/claude-code/db-scan-types/SKILL.md agents/skills/claude-code/db-query-statistics/SKILL.md agents/skills/claude-code/db-query-rewriting/SKILL.md
   ```

   Expected: no output (no matches)

5. Update arch baseline (learned from Phase 1 -- pre-commit hook rejects regressions):

   ```bash
   npx harness arch baseline
   ```

6. Run: `harness validate`

7. Commit: `feat(skills): validate Phase 2 indexing and query planning skills`

[checkpoint:human-verify] -- verify all 10 skills render correctly and content is accurate before proceeding to Phase 3.
