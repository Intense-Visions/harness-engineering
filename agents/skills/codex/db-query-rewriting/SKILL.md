# Query Rewriting for Performance

> Structural query transformations that help the planner choose better execution plans without changing results.

## When to Use

- Slow queries that already have appropriate indexes but still perform poorly
- Queries where EXPLAIN shows suboptimal plan choices (wrong join type, unnecessary sorts)
- Converting application-layer filtering to database-layer filtering
- Optimizing ORM-generated queries that use non-sargable patterns
- Replacing OFFSET-based pagination with keyset pagination on large tables

## Instructions

### Key Concepts

**1. Sargable predicates** -- predicates that can use indexes.

The indexed column must appear bare on one side of the operator, untransformed by functions or casts:

```sql
-- BAD (non-sargable): function wrapping prevents index use
SELECT * FROM orders WHERE YEAR(created_at) = 2024;
SELECT * FROM orders WHERE EXTRACT(month FROM created_at) = 3;
SELECT * FROM users WHERE col::text = '5';

-- GOOD (sargable): column is bare, index can be used
SELECT * FROM orders
WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
SELECT * FROM orders
WHERE created_at >= '2024-03-01' AND created_at < '2024-04-01';
```

**2. EXISTS vs IN**

```sql
-- IN materializes the full subquery result:
SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE region = 'us');

-- EXISTS short-circuits at first match:
SELECT * FROM orders o
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.region = 'us');
```

EXISTS stops scanning once it finds one match. IN builds the full result set. For large subquery results, EXISTS is usually faster. The planner may optimize both identically, but not always.

**3. CTEs vs subqueries**

Before PostgreSQL 12, CTEs were always materialized (optimization fence). PostgreSQL 12+ can inline CTEs automatically:

```sql
-- PostgreSQL 12+: planner may inline this CTE
WITH active AS (
  SELECT * FROM orders WHERE status = 'active'
)
SELECT * FROM active WHERE created_at > '2024-01-01';

-- Force materialization (useful when the CTE result is reused many times):
WITH active AS MATERIALIZED (
  SELECT * FROM orders WHERE status = 'active'
)
SELECT * FROM active WHERE created_at > '2024-01-01';

-- Force inlining:
WITH active AS NOT MATERIALIZED (
  SELECT * FROM orders WHERE status = 'active'
)
SELECT * FROM active WHERE created_at > '2024-01-01';
```

**4. LATERAL joins** replace correlated subqueries for better planner visibility:

```sql
-- BAD: correlated subquery in SELECT (executed per row)
SELECT o.*,
  (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
FROM orders o;

-- GOOD: LATERAL join (planner can optimize the join strategy)
SELECT o.*, li.cnt AS item_count
FROM orders o
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt FROM order_items WHERE order_id = o.id
) li ON true;
```

### Worked Example

**Rewriting a non-sargable query:**

Original slow query:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE EXTRACT(month FROM created_at) = 3
  AND EXTRACT(year FROM created_at) = 2024;
```

```
Seq Scan on orders (cost=0.00..298765.00 rows=50000 width=52)
  (actual time=0.031..2341.567 rows=48500 loops=1)
  Filter: (EXTRACT(month FROM created_at) = 3 AND EXTRACT(year FROM created_at) = 2024)
  Rows Removed by Filter: 9951500
Execution Time: 2345.123 ms
```

The index on `created_at` is ignored because the column is wrapped in EXTRACT().

Rewritten sargable version:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE created_at >= '2024-03-01' AND created_at < '2024-04-01';
```

```
Index Scan using idx_orders_created_at on orders
  (cost=0.43..4521.23 rows=48200 width=52)
  (actual time=0.025..34.567 rows=48500 loops=1)
  Index Cond: (created_at >= '2024-03-01' AND created_at < '2024-04-01')
Execution Time: 35.891 ms
```

Query time dropped from 2.3 seconds to 36 milliseconds -- a 65x improvement.

**Rewriting a correlated subquery to LATERAL join:**

```sql
-- Before: correlated subquery (2.1s)
SELECT o.id, o.total,
  (SELECT count(*) FROM order_items WHERE order_id = o.id)
FROM orders o WHERE o.status = 'active';

-- After: LATERAL join (180ms)
SELECT o.id, o.total, li.cnt
FROM orders o
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt FROM order_items WHERE order_id = o.id
) li ON true
WHERE o.status = 'active';
```

### Anti-Patterns

1. **Wrapping indexed columns in functions or casts.** `WHERE col::text = '5'` or `WHERE UPPER(name) = 'ALICE'` prevents index use. Use expression indexes or rewrite the predicate.

2. **OR chains instead of IN lists.** `WHERE status = 'a' OR status = 'b' OR status = 'c'` is harder for the planner to optimize than `WHERE status IN ('a', 'b', 'c')`.

3. **SELECT DISTINCT to mask a bad join.** If DISTINCT is needed only because the join produces duplicates, fix the join (usually by changing to EXISTS or adding a proper GROUP BY) instead of deduplicating after the fact.

4. **CTEs for "readability" when they prevent optimization (pre-PG12).** On PostgreSQL 11 and earlier, every CTE is an optimization fence. The planner cannot push filters from the outer query into the CTE.

5. **OFFSET for pagination on large tables.** `OFFSET 100000 LIMIT 20` must scan and discard 100K rows. Use keyset pagination instead:

```sql
-- BAD: OFFSET-based (slow for deep pages)
SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 100000;

-- GOOD: keyset pagination (constant speed regardless of page depth)
SELECT * FROM orders WHERE id > 100000 ORDER BY id LIMIT 20;
```

### PostgreSQL Specifics

**enable\_\* GUC flags** for testing plan alternatives (development only, never in production):

```sql
SET enable_seqscan = off;   -- force index usage to test
SET enable_nestloop = off;   -- force hash or merge join
```

**pg_hint_plan extension** provides query hints when the planner cannot be convinced:

```sql
/*+ IndexScan(orders idx_orders_status) */ SELECT * FROM orders WHERE status = 'active';
```

**EXPLAIN (ANALYZE, SETTINGS)** in PostgreSQL 15+ shows non-default settings affecting the plan, helping identify configuration-driven plan choices.

## Details

### Advanced Topics

**Keyset pagination** for efficient deep pagination:

```sql
-- First page:
SELECT * FROM orders ORDER BY created_at, id LIMIT 20;

-- Next page (using last row's values):
SELECT * FROM orders
WHERE (created_at, id) > ('2024-01-15 10:30:00', 12345)
ORDER BY created_at, id LIMIT 20;
```

Keyset pagination runs in constant time regardless of page depth, unlike OFFSET which degrades linearly.

**Materialized views** for expensive aggregations that are read frequently but can tolerate staleness:

```sql
CREATE MATERIALIZED VIEW monthly_sales AS
SELECT date_trunc('month', created_at) AS month, sum(total) AS revenue
FROM orders GROUP BY 1;

REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_sales;
```

**UNION ALL vs UNION.** UNION implies DISTINCT, requiring a sort or hash to deduplicate. Use UNION ALL when duplicates are acceptable or impossible.

**Join elimination.** PostgreSQL can eliminate unused LEFT JOINs when the joined table's columns are not referenced in SELECT, WHERE, or ORDER BY. This optimization applies only when the join has a UNIQUE or PRIMARY KEY constraint.

### Engine Differences

**MySQL CTEs (8.0+)** are derived tables that the optimizer may merge or materialize automatically. MySQL has no `MATERIALIZED` / `NOT MATERIALIZED` keywords -- you cannot control CTE materialization.

**MySQL lacks LATERAL joins.** Use correlated subqueries instead. For complex cases, rewrite as derived tables with join conditions.

**MySQL IN-to-EXISTS optimization.** MySQL's optimizer automatically converts `IN (subquery)` to EXISTS in many cases, making the performance difference less pronounced than in PostgreSQL.

**MySQL STRAIGHT_JOIN** forces join order, equivalent to PostgreSQL's approach of setting `join_collapse_limit = 1`. Use when the optimizer consistently chooses the wrong join order.

### Real-World Case Studies

**E-commerce API with 200ms p99 latency target.** The top slow query used `WHERE LOWER(email) = lower(?)` on a 50M users table. An expression index `CREATE INDEX ON users (lower(email))` combined with the sargable predicate `WHERE lower(email) = lower(?)` dropped the query from 1.2 seconds to 2ms. A second optimization replaced `OFFSET 10000 LIMIT 20` pagination in the order listing endpoint with keyset pagination using `WHERE id > ? ORDER BY id LIMIT 20`, reducing paginated queries from 400ms to 4ms regardless of page depth.

## Source

- [PostgreSQL Queries Documentation](https://www.postgresql.org/docs/current/queries.html)
- [Use The Index, Luke -- WHERE Clause](https://use-the-index-luke.com/sql/where-clause)

## Process

1. Read the key concepts to understand sargable predicates, EXISTS vs IN, CTE behavior, and LATERAL joins.
2. Apply these transformations to slow queries, rewriting non-sargable predicates and replacing problematic patterns.
3. Verify with EXPLAIN ANALYZE that the rewritten query uses a better execution plan and confirm the performance improvement.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-explain-reading, db-scan-types, db-query-statistics, db-btree-index, db-composite-index, db-denormalization

## Success Criteria

- Queries use sargable predicates with indexed columns bare and untransformed.
- EXPLAIN ANALYZE confirms improved plan choice (Index Scan instead of Seq Scan, Hash Join instead of Nested Loop).
- Keyset pagination replaces OFFSET for large-table pagination.
