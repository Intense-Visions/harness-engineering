# Partial Indexes

> Indexes with a WHERE clause that index only a subset of rows, reducing size and improving performance for targeted query patterns.

## When to Use

- Queries that always filter on a known condition (e.g., `WHERE deleted_at IS NULL`)
- Soft-delete patterns where only non-deleted rows are queried
- Status columns where one specific status dominates the workload (e.g., `WHERE status = 'pending'`)
- Enforcing unique constraints on a subset of rows
- Large tables where only a small fraction of rows are actively queried

## Instructions

### Key Concepts

A partial index includes a WHERE clause in the CREATE INDEX statement. Only rows matching the condition are stored in the index.

**Syntax:**

```sql
CREATE INDEX idx_active_orders ON orders (created_at) WHERE status = 'active';
```

This index only contains rows where `status = 'active'`. The planner uses this index only when the query's WHERE clause matches or logically implies the index predicate.

**Partial unique index** -- enforces uniqueness on a subset:

```sql
CREATE UNIQUE INDEX idx_unique_active_email
ON users (email)
WHERE deleted_at IS NULL;
```

This allows multiple deleted users with the same email while enforcing uniqueness for active users -- a common requirement in soft-delete systems.

**Size advantage:** When the filtered subset is small relative to the full table, the partial index is dramatically smaller. An index covering 1% of rows is roughly 1% the size of a full index.

### Worked Example

SaaS task queue with 10M rows where 99% of tasks are completed:

```sql
CREATE TABLE tasks (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full index on status (indexes all 10M rows):
CREATE INDEX idx_tasks_status_full ON tasks (created_at) WHERE true;

-- Partial index on only pending tasks (~100K rows):
CREATE INDEX idx_tasks_pending ON tasks (created_at) WHERE status = 'pending';
```

**Query using the partial index:**

```sql
EXPLAIN ANALYZE
SELECT id, payload
FROM tasks
WHERE status = 'pending' AND created_at > '2024-01-01'
ORDER BY created_at;
```

```
Index Scan using idx_tasks_pending on tasks
  (cost=0.29..245.12 rows=523 width=156)
  (actual time=0.021..1.832 rows=498 loops=1)
  Index Cond: (created_at > '2024-01-01')
Execution Time: 2.104 ms
```

**Size comparison:**

```sql
SELECT
  pg_size_pretty(pg_relation_size('idx_tasks_status_full')) AS full_size,
  pg_size_pretty(pg_relation_size('idx_tasks_pending'))     AS partial_size;
```

```
 full_size | partial_size
-----------+--------------
 250 MB    | 2.5 MB
```

The partial index is 100x smaller and produces faster scans because it has fewer pages to traverse.

### Anti-Patterns

1. **Partial index with a condition matching most rows.** `WHERE status != 'archived'` on a table where 95% of rows are non-archived provides minimal size benefit. The predicate should filter to a small fraction of the table.

2. **Forgetting the predicate in queries.** If the index is `WHERE status = 'pending'` but your query is `WHERE created_at > '2024-01-01'` without mentioning status, the planner cannot use the partial index.

3. **Overly complex predicates.** The planner matches partial index predicates using implication logic, but complex expressions with OR, NOT, or function calls may not be recognized. Keep predicates simple.

4. **Partial indexes on frequently changing conditions.** If rows transition through status values rapidly, the index must constantly add and remove entries. This generates excessive write amplification.

### PostgreSQL Specifics

**Predicate implication.** PostgreSQL's planner uses logical implication to match queries to partial indexes. A query `WHERE status = 'pending' AND created_at > '2024-01-01'` implies the predicate `WHERE status = 'pending'`, so the index is used.

**Monitoring usage:**

```sql
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_tasks_pending';
```

**Partial indexes with UNIQUE constraints** are fully supported. This is one of PostgreSQL's most powerful features for soft-delete patterns:

```sql
-- Allow reuse of usernames after account deletion:
CREATE UNIQUE INDEX idx_unique_username
ON users (username)
WHERE deleted_at IS NULL;
```

## Details

### Advanced Topics

**Combining partial with composite indexes.** You can create a partial composite index for highly targeted access patterns:

```sql
CREATE INDEX idx_pending_by_tenant
ON tasks (tenant_id, created_at)
WHERE status = 'pending';
```

**Partial GIN indexes on JSONB.** Index only JSONB rows matching a condition:

```sql
CREATE INDEX idx_events_purchase_gin
ON events USING GIN (metadata)
WHERE event_type = 'purchase';
```

**Partial indexes for multi-tenant isolation.** For a tenant that generates 50% of the workload, a tenant-specific partial index can be highly effective:

```sql
CREATE INDEX idx_tenant_5_orders
ON orders (created_at)
WHERE tenant_id = 5;
```

**Predicate complexity limits.** PostgreSQL can match simple predicates involving `=`, `<`, `>`, `IS NULL`, `IS NOT NULL`, and boolean AND combinations. Predicates using OR, NOT, or function calls are less likely to be matched automatically.

### Engine Differences

**MySQL does not support partial indexes.** Workarounds include:

1. **Generated columns with indexes.** Create a stored generated column that computes a value only for the target subset, then index it:

```sql
ALTER TABLE tasks ADD COLUMN is_pending TINYINT
  GENERATED ALWAYS AS (IF(status = 'pending', 1, NULL)) STORED;
CREATE INDEX idx_pending ON tasks (is_pending, created_at);
```

2. **Covering the condition in a composite index.** Put the filtered column first in a composite index: `CREATE INDEX idx_status_date ON tasks (status, created_at)`. This does not reduce index size but at least narrows the scan.

**SQL Server** supports "filtered indexes" with identical syntax to PostgreSQL partial indexes.

**MySQL 8.0 functional indexes** can approximate some partial index use cases but without the size reduction benefit.

### Real-World Case Studies

**Social media platform with 500M posts.** A moderation system needed to query the 0.1% of posts flagged for review. Without a partial index, the moderation queue query scanned 500M rows (Seq Scan, 4.2 seconds). Adding `CREATE INDEX idx_flagged ON posts (created_at) WHERE flagged = true` reduced the query to 3ms (Index Scan on ~500K rows). Index size: 12MB instead of the 12GB a full index would have consumed. The 1000x size reduction also meant the partial index stayed entirely in the buffer cache.

## Source

- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)

## Process

1. Read the key concepts to understand when partial indexes provide significant benefits.
2. Apply partial indexes to queries that consistently filter on a known condition targeting a small subset of rows.
3. Verify with EXPLAIN ANALYZE that the planner uses the partial index and compare index sizes with `pg_relation_size`.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-btree-index, db-composite-index, db-expression-index, db-explain-reading, db-scan-types

## Success Criteria

- Partial indexes target high-selectivity conditions where the indexed subset is a small fraction of the table.
- Query predicates match or imply the index predicate so the planner can use the index.
- Partial unique indexes are used for soft-delete uniqueness constraints where appropriate.
