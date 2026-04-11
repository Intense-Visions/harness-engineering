# Composite Indexes

> Multi-column indexes that accelerate queries filtering on column combinations, governed by the leftmost prefix rule and the ESR (Equality, Sort, Range) column ordering strategy.

## When to Use

- Queries filtering on multiple columns together in WHERE clauses
- Multi-column ORDER BY optimization
- Queries combining WHERE conditions and ORDER BY on different columns
- Replacing multiple single-column indexes with one efficient composite

## Instructions

### Key Concepts

A composite index stores entries sorted by multiple columns in declaration order. Think of it like a phone book sorted by (last_name, first_name) -- you can look up by last name alone, or by last name and first name together, but not by first name alone.

**Syntax:**

```sql
CREATE INDEX idx_orders_status_date ON orders (status, created_at);
```

**The leftmost prefix rule.** An index on (a, b, c) supports queries on:

- (a) -- uses the index
- (a, b) -- uses the index
- (a, b, c) -- uses the full index

But NOT:

- (b) alone -- cannot skip the leading column
- (c) alone -- cannot skip leading columns
- (b, c) -- cannot skip the leading column

**The ESR rule** for column ordering -- Equality, Sort, Range:

1. **Equality columns first** -- columns compared with `=`
2. **Sort columns next** -- columns in ORDER BY
3. **Range columns last** -- columns with `<`, `>`, `BETWEEN`

This order maximizes the portion of the index the planner can use in a single scan.

```sql
-- ESR-optimized for: WHERE tenant_id = ? AND status = ? ORDER BY created_at
CREATE INDEX idx_orders_esr ON orders (tenant_id, status, created_at);
```

### Worked Example

Multi-tenant SaaS orders table with 50M rows:

```sql
CREATE TABLE orders (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL,
  status     TEXT NOT NULL,
  total      NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_composite ON orders (tenant_id, status, created_at);
```

**Query 1 -- full index usage (all three columns):**

```sql
EXPLAIN ANALYZE
SELECT id, total FROM orders
WHERE tenant_id = 5 AND status = 'active' AND created_at > '2024-01-01';
```

```
Index Scan using idx_orders_composite on orders
  (cost=0.56..1245.32 rows=4521 width=14)
  (actual time=0.028..3.412 rows=4380 loops=1)
  Index Cond: (tenant_id = 5 AND status = 'active' AND created_at > '2024-01-01')
Execution Time: 3.891 ms
```

**Query 2 -- partial index usage (first column only):**

```sql
EXPLAIN ANALYZE
SELECT id, total FROM orders
WHERE tenant_id = 5 AND created_at > '2024-01-01';
```

```
Index Scan using idx_orders_composite on orders
  (cost=0.56..8923.12 rows=45210 width=14)
  (actual time=0.031..89.452 rows=43800 loops=1)
  Index Cond: (tenant_id = 5)
  Filter: (created_at > '2024-01-01')
  Rows Removed by Filter: 6200
```

The index is used for `tenant_id` but `created_at` is applied as a filter after fetching rows, because `status` (the second column) was skipped.

**Query 3 -- index not usable (skips leading column):**

```sql
EXPLAIN ANALYZE
SELECT id, total FROM orders
WHERE status = 'active';
```

```
Seq Scan on orders
  (cost=0.00..1234567.00 rows=5000000 width=14)
  (actual time=0.021..4521.330 rows=4980000 loops=1)
  Filter: (status = 'active')
```

The composite index cannot be used because the query skips `tenant_id` (the leftmost column).

### Anti-Patterns

1. **Separate single-column indexes instead of one composite.** The planner can combine single-column indexes via Bitmap AND, but this is significantly slower than a single composite index scan. One well-designed composite outperforms multiple singles.

2. **Wrong column order -- range before equality.**
   BAD: `CREATE INDEX ON orders (created_at, tenant_id)` for `WHERE tenant_id = ? AND created_at > ?`
   GOOD: `CREATE INDEX ON orders (tenant_id, created_at)` -- equality first, range second.

3. **Too many columns.** Each additional column increases index size and write overhead with diminishing returns. Most composites should have 2-4 columns.

4. **Duplicating the leading column.** If you have an index on `(tenant_id, status)`, a separate index on `(tenant_id)` alone is redundant -- the composite already supports queries on just `tenant_id`.

### PostgreSQL Specifics

PostgreSQL can use a composite index on (a, b) for `WHERE a = 1 ORDER BY b` without a separate sort step -- the index already produces results in the correct order.

**Monitoring composite index usage:**

```sql
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_orders_composite';
```

**Index-only scans with composites.** If the composite index contains all columns in the SELECT list, PostgreSQL performs an Index Only Scan. See db-covering-index for details.

## Details

### Advanced Topics

**Index skip scan (PostgreSQL 16+).** In some cases, PostgreSQL can skip over distinct values of the leading column, allowing the index on (a, b) to be used for queries on just (b). This is not yet as mature as Oracle's skip scan but is improving with each release.

**Mixed ASC/DESC ordering.** For queries with `ORDER BY a ASC, b DESC`, create:

```sql
CREATE INDEX idx_mixed ON orders (a ASC, b DESC);
```

Without matching sort directions, PostgreSQL must perform a separate sort step.

**Index size growth.** Each additional column increases the index size roughly in proportion to the column's average width. Monitor with `pg_relation_size()`.

### Engine Differences

MySQL InnoDB applies the same leftmost prefix rule for composite indexes. Key differences:

- **No index skip scan.** MySQL cannot skip leading columns at all -- the leftmost prefix rule is strictly enforced.
- **Index merge optimization.** MySQL may combine single-column indexes using "index merge" as an alternative to composites. This is almost always slower than a well-designed composite.
- **Column limit.** MySQL supports up to 16 columns in a composite index (PostgreSQL allows 32).
- **Clustered index impact.** In InnoDB, secondary composite indexes store the primary key at each leaf. This means wider primary keys inflate all secondary indexes.

### Real-World Case Studies

**E-commerce dashboard with 100M orders.** The dashboard query was `WHERE merchant_id = ? AND status = ? AND created_at BETWEEN ? AND ?`. The system had three separate single-column indexes on `merchant_id`, `status`, and `created_at`. The planner used Bitmap AND to combine them, taking 800ms per query.

Replacing all three with one composite `(merchant_id, status, created_at)` following ESR ordering:

- Query time dropped from 800ms to 5ms (160x improvement)
- Three indexes (4.5GB total) replaced by one (1.5GB) -- saved 3GB of storage
- Write throughput improved 12% due to maintaining one index instead of three

## Source

- [PostgreSQL Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
- [Use The Index, Luke -- Concatenated Index](https://use-the-index-luke.com/sql/where-clause/the-equals-operator/concatenated-keys)

## Process

1. Read the key concepts to understand the leftmost prefix rule and ESR ordering.
2. Apply composite indexes following ESR order for your actual query patterns, consolidating single-column indexes where possible.
3. Verify with EXPLAIN ANALYZE that the planner uses the composite index and that column ordering matches your query workload.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-btree-index, db-covering-index, db-partial-index, db-explain-reading, db-scan-types

## Success Criteria

- Composite indexes follow ESR column ordering for the target query workload.
- The leftmost prefix rule is respected -- no queries depend on skipping leading columns.
- Redundant single-column indexes on leading columns are identified and removed.
