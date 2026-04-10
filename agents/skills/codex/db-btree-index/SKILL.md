# B-Tree Indexes

> The default index type in PostgreSQL and MySQL, B-tree indexes support equality and range queries on ordered data with O(log n) lookup performance.

## When to Use

- Adding indexes for columns used in WHERE clauses with equality or range comparisons
- Optimizing ORDER BY to avoid separate sort steps
- Accelerating range filtering with BETWEEN, <, >, <=, >=
- Indexing columns used in JOIN conditions
- Supporting IS NULL lookups (B-tree indexes include NULLs by default in PostgreSQL)

## Instructions

### Key Concepts

A B-tree (balanced tree) stores keys in sorted order across a hierarchy of pages. Each internal node contains keys and pointers to child nodes, and every leaf node sits at the same depth -- guaranteeing O(log n) lookups regardless of data distribution.

B-tree is the default index type. When you write `CREATE INDEX` without specifying a method, you get a B-tree:

```sql
CREATE INDEX idx_users_email ON users (email);
```

**Supported operators:** `=`, `<`, `>`, `<=`, `>=`, `BETWEEN`, `IN`, `IS NULL`, `IS NOT NULL`.

**Pattern matching:** B-tree supports left-anchored LIKE patterns:

```sql
-- Uses the index (left-anchored):
SELECT * FROM users WHERE email LIKE 'alice%';

-- Cannot use the index (leading wildcard):
SELECT * FROM users WHERE email LIKE '%alice%';
```

The planner chooses a B-tree index when the query predicate matches one of the supported operators and the estimated selectivity makes index access cheaper than a sequential scan.

### Worked Example

Consider an e-commerce orders table with 10M rows:

```sql
CREATE TABLE orders (
  id         SERIAL PRIMARY KEY,
  customer_id INT NOT NULL,
  status     TEXT NOT NULL,
  total      NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_created_at ON orders (created_at);
```

**Query with index -- range scan on created_at:**

```sql
EXPLAIN ANALYZE
SELECT id, customer_id, total
FROM orders
WHERE created_at BETWEEN '2024-01-01' AND '2024-01-31';
```

```
Index Scan using idx_orders_created_at on orders
  (cost=0.43..1842.56 rows=31245 width=20)
  (actual time=0.031..11.482 rows=32100 loops=1)
  Index Cond: (created_at >= '2024-01-01' AND created_at <= '2024-01-31')
Planning Time: 0.125 ms
Execution Time: 12.341 ms
```

**Query without index -- sequential scan on an unindexed column:**

```sql
EXPLAIN ANALYZE
SELECT id, customer_id, total
FROM orders
WHERE customer_id = 42;
```

```
Seq Scan on orders
  (cost=0.00..223456.00 rows=1050 width=20)
  (actual time=0.045..1892.310 rows=1023 loops=1)
  Filter: (customer_id = 42)
  Rows Removed by Filter: 9998977
Execution Time: 1893.102 ms
```

The sequential scan reads every row in the table. Adding `CREATE INDEX idx_orders_customer ON orders (customer_id)` would convert this to an Index Scan completing in single-digit milliseconds.

### Anti-Patterns

1. **Indexing every column.** Each index adds write overhead (INSERT, UPDATE, DELETE must maintain the index) and consumes storage. Index only columns that appear in WHERE, ORDER BY, or JOIN clauses of actual queries.

2. **B-tree on low-cardinality booleans.** A boolean column with 50/50 distribution means the index returns half the table -- a sequential scan is cheaper. Use a partial index instead: `CREATE INDEX idx_active ON users (id) WHERE active = true;`.

3. **B-tree for array containment.** Use GIN indexes for `@>`, `&&`, and other array operators. B-tree cannot index into array elements.

4. **Indexing write-heavy columns never queried.** An `updated_at` column maintained by a trigger but never filtered or sorted on wastes I/O on every update.

### PostgreSQL Specifics

**Concurrent creation** avoids locking the table for writes:

```sql
CREATE INDEX CONCURRENTLY idx_orders_email ON orders (email);
```

This takes longer but does not block INSERT/UPDATE/DELETE operations. Required for zero-downtime deployments.

**Index usage monitoring:**

```sql
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

Indexes with `idx_scan = 0` after weeks of production traffic are candidates for removal.

**Fillfactor** for write-heavy tables:

```sql
CREATE INDEX idx_orders_status ON orders (status) WITH (fillfactor = 90);
```

Leaving 10% free space per page reduces page splits during updates, at the cost of a slightly larger index.

## Details

### Advanced Topics

**Index bloat and REINDEX.** Frequent updates leave dead tuples in the index. Monitor bloat with `pgstattuple` extension. Fix with `REINDEX CONCURRENTLY idx_name;` (PostgreSQL 12+).

**Index-only scans.** When the index contains all columns the query needs, PostgreSQL skips the heap table entirely. See the db-covering-index skill for details on INCLUDE columns.

**Multi-column B-tree.** A B-tree on (a, b, c) supports queries on (a), (a, b), and (a, b, c) following the leftmost prefix rule. See db-composite-index for column ordering strategy.

**Correlation and physical ordering.** The `pg_stats.correlation` value measures how well the physical row order matches the index order. High correlation (close to 1.0 or -1.0) makes index scans cheaper because sequential I/O patterns emerge.

### Engine Differences

MySQL InnoDB uses a **clustered B-tree** where the primary key IS the table data. The table is physically stored in primary key order. Secondary indexes store the primary key value (not a row pointer) in their leaf nodes.

**Impact on lookups:** A secondary index lookup in MySQL is a two-step process:

1. Traverse the secondary B-tree to find the primary key value
2. Traverse the clustered (primary key) B-tree to find the actual row

This "double lookup" means secondary index scans in MySQL are more expensive than in PostgreSQL, where indexes point directly to heap tuple locations (ctid). However, MySQL's clustered index gives primary key range scans excellent performance since the data is physically ordered.

PostgreSQL uses **heap tables** with separate B-tree indexes. Each index entry points to a physical tuple identifier (ctid). This means any index can reach the row in one hop, but primary key range scans may involve random I/O if the heap is not well-correlated.

### Real-World Case Studies

**SaaS platform with 50M order rows.** The dashboard query filtered by tenant and date range: `WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`. Before indexing, a sequential scan took 2.1 seconds. After adding a composite B-tree on `(tenant_id, created_at)`, the query used an Index Scan and completed in 12ms -- a 175x improvement. The index consumed 1.2GB but eliminated full table scans on every dashboard load.

## Source

- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [Use The Index, Luke -- B-Tree](https://use-the-index-luke.com/sql/anatomy/the-tree)

## Process

1. Read the key concepts and worked example to understand B-tree behavior.
2. Apply B-tree indexes to columns used in equality, range, and ordering operations in your actual query workload.
3. Verify with EXPLAIN ANALYZE that the planner uses the index and that query performance improves.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-hash-index, db-composite-index, db-covering-index, db-expression-index, db-explain-reading, db-scan-types

## Success Criteria

- B-tree indexes are created for columns appearing in equality, range, ORDER BY, and JOIN predicates.
- Anti-patterns (indexing every column, B-tree on low-cardinality booleans, B-tree for array containment) are avoided.
- EXPLAIN ANALYZE confirms Index Scan or Index Only Scan where expected.
