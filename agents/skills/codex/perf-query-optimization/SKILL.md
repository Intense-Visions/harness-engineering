# Query Optimization

> Master database query optimization — EXPLAIN and EXPLAIN ANALYZE for query plan analysis, identifying sequential scans and inefficient joins, rewriting queries for index utilization, understanding the query optimizer's cost model, and diagnosing slow queries in PostgreSQL and MySQL.

## When to Use

- API endpoints have high p95 latency traced to database queries
- EXPLAIN shows sequential scans on large tables instead of index scans
- A query worked fine on small data but degrades at production scale
- Dashboard or reporting queries take seconds instead of milliseconds
- Database CPU is consistently high due to expensive query plans
- ORM-generated queries are inefficient and need raw SQL alternatives
- JOIN operations produce unexpected performance characteristics
- A query uses a subquery where a JOIN or CTE would be faster
- EXPLAIN output shows high row estimates versus actual rows (cardinality misestimation)
- pg_stat_statements or slow query log highlights specific problematic queries

## Instructions

1. **Run EXPLAIN ANALYZE to see the actual execution plan.** EXPLAIN shows the planner's estimate; EXPLAIN ANALYZE executes the query and shows real timings:

   ```sql
   -- PostgreSQL: full execution analysis
   EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
   SELECT o.id, o.total, u.name
   FROM orders o
   JOIN users u ON u.id = o.user_id
   WHERE o.created_at > '2024-01-01'
     AND o.status = 'completed'
   ORDER BY o.created_at DESC
   LIMIT 50;

   -- MySQL: execution analysis
   EXPLAIN ANALYZE
   SELECT o.id, o.total, u.name
   FROM orders o
   JOIN users u ON u.id = o.user_id
   WHERE o.created_at > '2024-01-01'
     AND o.status = 'completed'
   ORDER BY o.created_at DESC
   LIMIT 50;
   ```

2. **Read the execution plan bottom-up.** Identify the most expensive operations:

   ```
   EXPLAIN ANALYZE output (PostgreSQL):

   Limit  (cost=1234.56..1234.70 rows=50 actual time=2.1..2.2 rows=50)
     -> Sort  (cost=1234.56..1267.89 rows=13333 actual time=2.1..2.1 rows=50)
           Sort Key: o.created_at DESC
           Sort Method: top-N heapsort  Memory: 32kB
           -> Hash Join  (cost=45.00..987.65 rows=13333 actual time=0.5..1.8 rows=13333)
                 Hash Cond: (o.user_id = u.id)
                 -> Seq Scan on orders o  (cost=0.00..876.00 rows=13333 actual time=0.1..1.2 rows=13333)
                       Filter: (created_at > '2024-01-01' AND status = 'completed')
                       Rows Removed by Filter: 86667
                 -> Hash  (cost=30.00..30.00 rows=1000 actual time=0.3..0.3 rows=1000)
                       -> Seq Scan on users u  (cost=0.00..30.00 rows=1000 actual time=0.0..0.2 rows=1000)

   -- Problem: Seq Scan on orders filtering 86,667 rows to get 13,333.
   -- Solution: CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
   ```

3. **Identify and fix sequential scans.** A sequential scan reads every row in the table. On large tables this is the primary performance problem:

   ```sql
   -- Bad: sequential scan on 1M row table
   SELECT * FROM events WHERE user_id = 12345 AND type = 'purchase';
   -- Seq Scan on events, Filter: user_id = 12345 AND type = 'purchase'
   -- Rows Removed by Filter: 999,990

   -- Fix: add a composite index matching the query
   CREATE INDEX idx_events_user_type ON events(user_id, type);
   -- Now: Index Scan using idx_events_user_type on events
   -- Rows: 10  (only reads matching rows)
   ```

4. **Optimize JOINs for the query planner.** The order and type of join impacts performance:

   ```sql
   -- Inefficient: subquery forces materialization
   SELECT * FROM orders
   WHERE user_id IN (
     SELECT id FROM users WHERE country = 'US'
   );

   -- Better: JOIN lets the planner choose the optimal strategy
   SELECT o.* FROM orders o
   JOIN users u ON u.id = o.user_id
   WHERE u.country = 'US';

   -- Best when you need existence check only: EXISTS
   SELECT * FROM orders o
   WHERE EXISTS (
     SELECT 1 FROM users u
     WHERE u.id = o.user_id AND u.country = 'US'
   );
   ```

5. **Use CTEs wisely.** In PostgreSQL 12+, CTEs are inlined by default (optimizable). Use `MATERIALIZED` only when you explicitly want to prevent optimization:

   ```sql
   -- PostgreSQL 12+: CTE is inlined, planner can optimize
   WITH recent_orders AS (
     SELECT * FROM orders WHERE created_at > now() - interval '7 days'
   )
   SELECT * FROM recent_orders WHERE status = 'pending';

   -- Force materialization when the CTE is referenced multiple times
   -- or when you want to force a specific execution boundary:
   WITH recent AS MATERIALIZED (
     SELECT * FROM orders WHERE created_at > now() - interval '7 days'
   )
   SELECT * FROM recent r1
   JOIN recent r2 ON r1.user_id = r2.user_id;
   ```

6. **Paginate efficiently with keyset pagination.** OFFSET-based pagination degrades linearly with page number:

   ```sql
   -- Bad: OFFSET scans and discards rows (page 1000 reads 50,000 rows)
   SELECT * FROM products ORDER BY created_at DESC LIMIT 50 OFFSET 49950;

   -- Good: keyset pagination (constant time regardless of page)
   SELECT * FROM products
   WHERE created_at < '2024-03-15T10:30:00Z'
   ORDER BY created_at DESC
   LIMIT 50;
   -- Requires an index on created_at and passing the last seen value
   ```

7. **Monitor query performance in production.** Use built-in tooling to find slow queries:

   ```sql
   -- PostgreSQL: enable pg_stat_statements
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

   -- Find top 10 slowest queries by total time
   SELECT
     round(total_exec_time::numeric, 2) AS total_ms,
     calls,
     round(mean_exec_time::numeric, 2) AS mean_ms,
     round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct,
     query
   FROM pg_stat_statements
   ORDER BY total_exec_time DESC
   LIMIT 10;
   ```

## Details

### Understanding Cost Numbers

PostgreSQL's cost numbers are in arbitrary units relative to `seq_page_cost` (default 1.0). A cost of 1000 means roughly 1000 sequential page reads worth of work. The two cost numbers (e.g., `cost=0.42..1234.56`) represent startup cost (before first row) and total cost (all rows). Index scans have higher startup cost but lower total cost on selective queries. The planner chooses the plan with the lowest total cost (or lowest startup cost when LIMIT is present).

### Cardinality Estimation

The optimizer estimates how many rows each operation will produce (cardinality). When estimates are wrong (e.g., estimated 100 rows, actual 100,000), the planner chooses a suboptimal strategy. Common causes: stale statistics (`ANALYZE` not run), correlated columns (planner assumes independence), non-uniform distribution, or values outside the histogram range. Run `ANALYZE tablename` to update statistics after bulk data changes.

### Worked Example: Stripe Payment Queries

Stripe processes billions of payment records. Their query optimization strategy uses composite indexes that match their most common query patterns: `(merchant_id, created_at DESC)` for merchant dashboards, `(status, created_at)` for operations monitoring. They use keyset pagination exclusively (no OFFSET) and pre-compute aggregations for dashboard summaries rather than running real-time GROUP BY queries on the payments table. Result: merchant dashboard queries complete in <10ms at p99 regardless of merchant size.

### Worked Example: Figma File Versioning

Figma's file versioning system queries a table with billions of rows (file versions across all users). Their initial query for "show version history of file X" used a sequential scan filtered by file_id. Adding a composite index `(file_id, created_at DESC)` reduced the query from 2 seconds to 3ms. For their "recently modified files across team" query, they added a partial index `CREATE INDEX ON files(team_id, modified_at DESC) WHERE deleted_at IS NULL` that is 60% smaller than a full index because it excludes soft-deleted files.

### Anti-Patterns

**SELECTing columns you do not need.** `SELECT *` reads all columns from disk, even when you need only 2-3. This increases I/O and prevents covering index scans. Always select only the columns needed.

**Using DISTINCT to mask duplicate JOIN results.** If a JOIN produces duplicates, adding DISTINCT is a symptom fix. The root cause is usually a missing GROUP BY, an incorrect JOIN condition, or a missing WHERE clause. DISTINCT sorts or hashes the entire result set.

**Ignoring EXPLAIN ANALYZE warnings.** When actual rows are 100x the estimate, the optimizer chose a suboptimal plan. Run `ANALYZE` on the affected tables and consider creating statistics objects for correlated columns.

**Not parameterizing queries.** Hard-coded values in queries (`WHERE id = 12345`) bypass the prepared statement cache, forcing the planner to re-plan on every execution. Use parameterized queries (`WHERE id = $1`) for plan caching.

## Source

- PostgreSQL: EXPLAIN — https://www.postgresql.org/docs/current/using-explain.html
- PostgreSQL: pg_stat_statements — https://www.postgresql.org/docs/current/pgstatstatements.html
- Use The Index, Luke — https://use-the-index-luke.com/
- MySQL: EXPLAIN Output — https://dev.mysql.com/doc/refman/8.0/en/explain-output.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Critical queries have been profiled with EXPLAIN ANALYZE.
- No sequential scans exist on large tables for frequently-executed queries.
- Composite indexes match the most common query patterns.
- Pagination uses keyset (cursor) strategy instead of OFFSET.
- pg_stat_statements or equivalent is enabled for ongoing query monitoring.
