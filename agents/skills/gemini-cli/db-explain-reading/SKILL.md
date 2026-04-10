# Reading EXPLAIN Output

> How to read query execution plans to identify performance bottlenecks, row count misestimations, and missing indexes.

## When to Use

- Diagnosing slow queries in development or production
- Verifying that indexes are being used as expected
- Comparing alternative query formulations
- Validating performance impact of schema changes
- Investigating performance regressions after deployments or data migrations

## Instructions

### Key Concepts

**EXPLAIN** shows the query plan without executing the query. **EXPLAIN ANALYZE** executes the query and shows actual timing and row counts alongside estimates.

```sql
-- Plan only (no execution):
EXPLAIN SELECT * FROM orders WHERE status = 'active';

-- Plan with actual execution metrics:
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'active';

-- Full diagnostic output (recommended):
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE status = 'active';
```

**Key fields in EXPLAIN output:**

- `cost=startup..total` -- estimated cost in arbitrary units (based on `seq_page_cost`). Startup cost is the work before the first row is returned. Total cost is the work for all rows.
- `rows` -- estimated number of rows the node will produce
- `width` -- estimated average row width in bytes

**Additional fields with ANALYZE:**

- `actual time=startup..total` -- real milliseconds
- `rows` -- actual number of rows produced
- `loops` -- how many times this node executed (important for nested loops)

**Reading order:** Plans read bottom-up and inside-out. The deepest-indented node executes first. Each parent node consumes the output of its children.

**BUFFERS** adds I/O detail:

- `shared hit` -- pages found in the buffer cache (fast)
- `shared read` -- pages read from disk (slow)

### Worked Example

A JOIN query with performance issues:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.total, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'pending' AND c.region = 'us-east';
```

```
Nested Loop (cost=1.00..45231.21 rows=10 width=28)
           (actual time=0.082..4521.340 rows=48500 loops=1)
  Buffers: shared hit=12340 read=89012
  ->  Index Scan using idx_orders_status on orders o
        (cost=0.43..8234.12 rows=10 width=16)
        (actual time=0.031..234.120 rows=48500 loops=1)
        Index Cond: (status = 'pending')
        Buffers: shared hit=5234 read=3421
  ->  Index Scan using customers_pkey on customers c
        (cost=0.29..3.71 rows=1 width=20)
        (actual time=0.085..0.086 rows=1 loops=48500)
        Index Cond: (id = o.customer_id)
        Filter: (region = 'us-east')
        Rows Removed by Filter: 0
        Buffers: shared hit=7106 read=85591
Planning Time: 0.342 ms
Execution Time: 4523.891 ms
```

**Diagnosis:**

1. The planner estimated 10 rows from orders but got 48,500 -- a **4,850x misestimation**
2. Because it expected 10 rows, it chose Nested Loop (good for few rows) instead of Hash Join (better for many rows)
3. The inner loop executes 48,500 times (`loops=48500`), each doing an index scan on customers
4. `shared read=85591` on customers shows heavy disk I/O

**Fix:** Update statistics to correct the misestimation:

```sql
ANALYZE orders;
```

After ANALYZE, the planner sees the correct row count and switches to Hash Join:

```
Hash Join (cost=1234.56..9876.54 rows=48200 width=28)
          (actual time=12.340..89.120 rows=48500 loops=1)
  Buffers: shared hit=8923 read=1234
Execution Time: 91.234 ms
```

Query time dropped from 4.5 seconds to 91 milliseconds.

### Anti-Patterns

1. **Using EXPLAIN without ANALYZE.** You only see estimated costs and rows -- not reality. Always use ANALYZE for performance diagnosis (but see the next point for destructive queries).

2. **Running EXPLAIN ANALYZE on destructive queries without a transaction.**

```sql
-- WRONG: actually deletes rows
EXPLAIN ANALYZE DELETE FROM orders WHERE status = 'cancelled';

-- CORRECT: analyze without side effects
BEGIN;
EXPLAIN ANALYZE DELETE FROM orders WHERE status = 'cancelled';
ROLLBACK;
```

3. **Ignoring the rows discrepancy.** When estimated rows differ from actual rows by more than 10x, the planner likely chose a suboptimal strategy. Fix statistics with `ANALYZE tablename;`.

4. **Focusing only on total cost.** A node with low total cost but high `loops` can dominate execution time. Multiply `actual time` by `loops` to get the true cost of a node.

### PostgreSQL Specifics

**JSON format for programmatic parsing:**

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ...;
```

**auto_explain extension** logs slow query plans automatically:

```sql
-- In postgresql.conf:
-- shared_preload_libraries = 'auto_explain'
-- auto_explain.log_min_duration = '1s'
```

**EXPLAIN (ANALYZE, BUFFERS, WAL)** in PostgreSQL 13+ shows WAL bytes generated -- useful for understanding write overhead.

**pg_stat_statements** identifies which queries need EXPLAIN. Sort by `total_exec_time` to find the biggest offenders:

```sql
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

## Details

### Advanced Topics

**JIT compilation indicators.** PostgreSQL 11+ may show JIT compilation in EXPLAIN output for complex queries. `JIT: Functions: N, Generation Time: Xms, Inlining Time: Xms`. JIT helps for CPU-bound queries but adds planning overhead.

**Parallel query plans.** Look for `Workers Planned: N` and `Workers Launched: N`. If launched < planned, the system ran out of parallel workers (`max_parallel_workers_per_gather`).

**CTE Scan nodes.** Before PostgreSQL 12, CTEs were always materialized (written to a temp tuplestore). The CTE Scan node reads from this materialized result. In PostgreSQL 12+, CTEs may be inlined -- no CTE Scan node appears.

**SubPlan vs InitPlan.** SubPlan executes once per outer row (correlated subquery). InitPlan executes once for the entire query (uncorrelated subquery). SubPlan with high outer row counts is a performance red flag.

**"Never executed" nodes.** In conditional plans (e.g., with `CASE` or parameterized bitmap scans), some nodes show `(never executed)`. This is normal -- the runtime condition was not met.

### Engine Differences

**MySQL EXPLAIN** uses a tabular format with different columns:

| MySQL Column    | PostgreSQL Equivalent         |
| --------------- | ----------------------------- |
| `type`          | Node type (ALL, index, range) |
| `possible_keys` | Candidate indexes             |
| `key`           | Chosen index                  |
| `rows`          | Estimated rows                |
| `filtered`      | Selectivity percentage        |
| `Extra`         | Additional info (Using index) |

**MySQL EXPLAIN ANALYZE** (8.0.18+) shows actual timing with tree format:

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'active';
```

MySQL `EXPLAIN FORMAT=TREE` is the closest equivalent to PostgreSQL's default text output. MySQL lacks a BUFFERS equivalent -- I/O diagnostics require Performance Schema or `SHOW STATUS` counters.

### Real-World Case Studies

**API endpoint taking 8 seconds.** EXPLAIN ANALYZE on the slow query revealed a Nested Loop join with `rows=10` estimated but `rows=200000` actual. The stale statistics caused the planner to choose Nested Loop instead of Hash Join. Running `ANALYZE orders;` updated the statistics, the planner switched to Hash Join, and the query dropped from 8 seconds to 50ms. The fix was added to the CI pipeline: `ANALYZE` runs after every migration.

## Source

- [PostgreSQL Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [pgMustard -- EXPLAIN Analysis Tool](https://www.pgmustard.com/)

## Process

1. Read the key concepts to understand EXPLAIN output fields and reading order.
2. Apply EXPLAIN (ANALYZE, BUFFERS) to slow queries, comparing estimated vs actual rows and identifying I/O bottlenecks.
3. Verify fixes by re-running EXPLAIN ANALYZE after adding indexes, updating statistics, or rewriting queries.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-scan-types, db-query-statistics, db-query-rewriting, db-btree-index, db-composite-index, db-covering-index

## Success Criteria

- EXPLAIN ANALYZE output is interpreted correctly with estimated vs actual rows compared.
- Row count misestimations greater than 10x are identified and resolved with ANALYZE.
- Destructive queries are always wrapped in transactions before running EXPLAIN ANALYZE.
