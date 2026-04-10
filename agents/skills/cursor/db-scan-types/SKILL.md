# Scan Types

> Understanding when the planner chooses sequential scan, index scan, bitmap scan, or index-only scan and why each is optimal for different selectivity ranges.

## When to Use

- Interpreting EXPLAIN output and understanding node types
- Understanding why an index exists but is not being used
- Deciding between adding an index versus accepting a sequential scan
- Tuning planner cost parameters (`random_page_cost`, `seq_page_cost`)
- Diagnosing unexpected scan type choices after data growth or schema changes

## Instructions

### Key Concepts

PostgreSQL has four primary scan types, each optimal for a different selectivity range:

**1. Seq Scan (Sequential Scan)**

Reads every row in the table in physical order. Chosen when:

- No applicable index exists
- The query returns a large fraction of the table (roughly >5-10%)
- The table is small enough that sequential I/O beats random I/O

```
Seq Scan on orders (cost=0.00..223456.00 rows=10000000 width=52)
  Filter: (status = 'active')
```

**2. Index Scan**

Traverses the B-tree (or other index type) to find matching entries, then fetches each row from the heap table. Uses random I/O. Chosen for highly selective queries (<5% of rows):

```
Index Scan using idx_orders_status on orders
  (cost=0.43..1234.56 rows=5230 width=52)
  Index Cond: (status = 'pending')
```

**3. Bitmap Index Scan + Bitmap Heap Scan**

A two-phase approach for medium selectivity:

- Phase 1: Scan the index and build a bitmap of matching page locations
- Phase 2: Fetch pages in physical order (converting random I/O to sequential I/O)

Chosen for medium selectivity (roughly 5-20% of rows) or when combining multiple indexes:

```
Bitmap Heap Scan on orders (cost=523.12..34567.89 rows=52300 width=52)
  Recheck Cond: (status = 'processing')
  ->  Bitmap Index Scan on idx_orders_status
        (cost=0.00..510.23 rows=52300 width=0)
        Index Cond: (status = 'processing')
```

**4. Index Only Scan**

Reads all needed columns from the index without touching the heap. Chosen when the index covers all columns in the query and the visibility map confirms pages are all-visible:

```
Index Only Scan using idx_orders_covering on orders
  (cost=0.43..1234.56 rows=5230 width=12)
  Index Cond: (status = 'pending')
  Heap Fetches: 0
```

**The selectivity spectrum:**

```
100% of rows  <----  Seq Scan  ---->  Bitmap Scan  ---->  Index Scan  ---->  Index Only Scan
(full table)         (~10%+)          (~5-20%)            (<5%)              (<5%, covering)
```

The exact thresholds depend on table size, data distribution, and cost parameters.

### Worked Example

Same table, different selectivities demonstrating each scan type:

```sql
CREATE TABLE orders (
  id         SERIAL PRIMARY KEY,
  status     TEXT NOT NULL,
  total      NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_covering ON orders (status) INCLUDE (id);
```

**Query 1 -- Index Scan (highly selective, <1% of rows):**

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE id = 5;
```

```
Index Scan using orders_pkey on orders
  (actual time=0.021..0.022 rows=1 loops=1)
```

Single-row lookup: Index Scan is optimal.

**Query 2 -- Bitmap Heap Scan (medium selectivity, ~15% of rows):**

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE created_at > '2024-06-01';
```

```
Bitmap Heap Scan on orders (actual time=45.123..234.567 rows=1500000 loops=1)
  Recheck Cond: (created_at > '2024-06-01')
  ->  Bitmap Index Scan on idx_orders_created
        (actual time=44.321..44.321 rows=1500000 loops=1)
```

Too many rows for individual index lookups, so the planner builds a bitmap and reads heap pages in order.

**Query 3 -- Seq Scan (low selectivity or no useful index):**

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE 1=1;
```

```
Seq Scan on orders (actual time=0.012..1234.567 rows=10000000 loops=1)
```

Returning all rows -- sequential read is the fastest approach.

**Query 4 -- Index Only Scan (covering index):**

```sql
EXPLAIN ANALYZE SELECT id, status FROM orders WHERE status = 'active';
```

```
Index Only Scan using idx_orders_covering on orders
  (actual time=0.024..12.345 rows=52300 loops=1)
  Heap Fetches: 0
```

All requested columns (id, status) are in the index. No heap access needed.

### Anti-Patterns

1. **Forcing index usage with `SET enable_seqscan = off`.** This hides the real problem (missing index, stale statistics, or a genuinely table-scan-optimal query). Never use this in production. Use it only during analysis to see what plan the optimizer would produce if forced.

2. **Assuming Seq Scan is always bad.** For small tables (<10K rows) or queries returning most rows, Seq Scan is the correct choice. Adding an index to a 100-row lookup table wastes resources.

3. **Ignoring Bitmap Scan as a warning sign.** Bitmap Scan often indicates the query is in the gray zone -- the index is not selective enough. Consider whether a more selective index, a partial index, or query rewriting would convert it to an Index Scan.

### PostgreSQL Specifics

**Cost parameters that influence scan type selection:**

```sql
-- Default values (tuned for spinning disks):
SET random_page_cost = 4.0;   -- cost of one random page read
SET seq_page_cost = 1.0;       -- cost of one sequential page read

-- Recommended for SSDs:
SET random_page_cost = 1.1;    -- random I/O is nearly as fast as sequential on SSDs
```

On SSDs, lowering `random_page_cost` makes the planner more willing to choose Index Scan over Bitmap or Seq Scan, which often matches the actual I/O characteristics.

**effective_cache_size** influences whether the planner expects data to be in memory. Higher values make the planner more willing to use Index Scan (assuming pages will be in cache).

**TID Scan** -- a specialized scan that accesses rows by physical tuple identifier (ctid). Rarely used directly but appears in `WHERE ctid = '(0,1)'` queries.

## Details

### Advanced Topics

**Parallel Seq Scan (PostgreSQL 9.6+).** For large tables, PostgreSQL can split the sequential scan across multiple workers:

```
Gather (actual time=0.452..234.567 rows=1000000 loops=1)
  Workers Planned: 4
  Workers Launched: 4
  ->  Parallel Seq Scan on orders
        (actual time=0.012..123.456 rows=200000 loops=5)
```

Controlled by `max_parallel_workers_per_gather` (default 2) and `min_parallel_table_scan_size` (default 8MB).

**Bitmap AND/OR for combining indexes.** When multiple single-column indexes apply, the planner can combine their bitmaps:

```
Bitmap Heap Scan on orders
  ->  BitmapAnd
        ->  Bitmap Index Scan on idx_orders_status
        ->  Bitmap Index Scan on idx_orders_region
```

This is slower than a single composite index but avoids full table scans when no composite exists.

**Recheck Condition in bitmap scans.** Bitmap scans are "lossy" for large result sets -- they track pages, not individual rows. The Recheck Condition re-evaluates the predicate against each row on fetched pages.

### Engine Differences

MySQL InnoDB scan types appear in the EXPLAIN `type` column:

| MySQL Type | PostgreSQL Equivalent            |
| ---------- | -------------------------------- |
| `ALL`      | Seq Scan                         |
| `index`    | Full index scan (no heap access) |
| `range`    | Index Scan with range condition  |
| `ref`      | Index Scan with equality lookup  |
| `const`    | Single-row index lookup          |

**MySQL lacks bitmap scan.** Instead, MySQL uses "index merge" optimization to combine single-column indexes -- this is generally slower than a composite index.

**MySQL `Extra: Using index`** indicates an index-only scan (covering index). Equivalent to PostgreSQL's Index Only Scan.

**MySQL has no equivalent to PostgreSQL's cost parameter tuning.** The optimizer makes scan type decisions internally without `random_page_cost`-style knobs.

### Real-World Case Studies

**Microservice with 50M-row events table on SSD storage.** Queries returning 2% of rows used Index Scan with `random_page_cost=4.0` (the default). The actual I/O was fast because of SSDs, but the planner's cost model over-estimated random I/O cost. After lowering `random_page_cost` to 1.1, the planner's cost estimates matched reality. A further optimization -- adding a covering index -- converted the scan to Index Only Scan, dropping query time from 3.2 seconds to 180ms.

## Source

- [PostgreSQL Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [PostgreSQL Planner/Optimizer Internals](https://www.postgresql.org/docs/current/planner-optimizer.html)

## Process

1. Read the key concepts to understand the four scan types and their selectivity ranges.
2. Apply EXPLAIN ANALYZE to your queries and identify which scan type is being used and whether it is appropriate.
3. Verify that cost parameters match your storage characteristics (SSD vs spinning disk) and that scan types align with query selectivity.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-explain-reading, db-btree-index, db-covering-index, db-query-statistics, db-query-rewriting

## Success Criteria

- Scan types in EXPLAIN output are correctly identified and understood.
- Seq Scan is accepted for small tables and low-selectivity queries rather than forcing index usage.
- Cost parameters are tuned for the actual storage medium (SSD vs HDD).
