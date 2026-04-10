# Covering Indexes

> Indexes that contain all columns needed by a query, enabling index-only scans that skip heap table access entirely.

## When to Use

- High-frequency queries selecting a small, stable set of columns
- Dashboard and reporting queries with predictable SELECT lists
- Queries bottlenecked by heap random I/O (high `Heap Fetches` in EXPLAIN)
- Aggregation queries where all grouped/aggregated columns can fit in the index

## Instructions

### Key Concepts

A covering index contains every column the query references -- in WHERE, SELECT, ORDER BY, and GROUP BY. When the index "covers" the entire query, PostgreSQL performs an **Index Only Scan**, reading data exclusively from the index and never touching the heap table.

**The INCLUDE clause** (PostgreSQL 11+) adds non-searchable payload columns to the index:

```sql
CREATE INDEX idx_orders_covering
ON orders (status) INCLUDE (total, created_at);
```

INCLUDE columns are stored in index leaf pages but are **not** part of the search key. They do not affect sort order, are not used for index lookups, and add less overhead than regular index columns because they are not stored in internal (non-leaf) pages.

**Without INCLUDE** (pre-PostgreSQL 11 or when sort order matters), you can create a covering index by listing all columns as regular index keys:

```sql
CREATE INDEX idx_orders_cover_all ON orders (status, created_at, total);
```

This works but makes `created_at` and `total` part of the sort key, increasing index size across all pages (including internal nodes).

### Worked Example

Dashboard query executed 1000 times per minute:

```sql
SELECT status, count(*), sum(total)
FROM orders
WHERE created_at > '2024-01-01'
GROUP BY status;
```

**Without covering index (heap fetches required):**

```sql
CREATE INDEX idx_orders_date ON orders (created_at);
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT status, count(*), sum(total)
FROM orders WHERE created_at > '2024-01-01' GROUP BY status;
```

```
HashAggregate (actual time=892.341..892.356 rows=5 loops=1)
  ->  Index Scan using idx_orders_date on orders
        (actual time=0.031..654.210 rows=3200000 loops=1)
        Index Cond: (created_at > '2024-01-01')
        Buffers: shared hit=89234 read=45123
Execution Time: 893.102 ms
```

The index finds matching rows but must fetch `status` and `total` from the heap -- 45K buffer reads from disk.

**With covering index:**

```sql
CREATE INDEX idx_orders_cover
ON orders (created_at, status) INCLUDE (total);
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT status, count(*), sum(total)
FROM orders WHERE created_at > '2024-01-01' GROUP BY status;
```

```
HashAggregate (actual time=128.451..128.466 rows=5 loops=1)
  ->  Index Only Scan using idx_orders_cover on orders
        (actual time=0.024..91.230 rows=3200000 loops=1)
        Index Cond: (created_at > '2024-01-01')
        Heap Fetches: 0
        Buffers: shared hit=23456
Execution Time: 128.892 ms
```

**Heap Fetches: 0** -- the index contained all needed columns. Buffer reads dropped from 134K to 23K. Query time dropped from 893ms to 129ms.

### Anti-Patterns

1. **Including too many columns.** Adding 10 INCLUDE columns creates a bloated index that is nearly as large as the table itself. The I/O savings from skipping the heap are offset by the larger index. Target 1-3 INCLUDE columns for specific queries.

2. **Covering indexes for queries with unstable SELECT lists.** If the application frequently adds columns to the query, the covering index must be rebuilt each time. Only use covering indexes for stable, high-frequency queries.

3. **Ignoring the visibility map.** PostgreSQL can only perform Index Only Scan on pages marked "all-visible" in the visibility map. If VACUUM has not run recently, you see `Heap Fetches: N` -- the index has the data but PostgreSQL must verify tuple visibility from the heap.

4. **INCLUDE columns as regular keys.** Putting payload columns as regular index keys instead of INCLUDE columns wastes space in internal pages and affects sort order unnecessarily.

### PostgreSQL Specifics

**Visibility map and VACUUM.** The visibility map tracks which heap pages have only visible (committed) tuples. Index Only Scan skips heap access only for all-visible pages. After bulk updates or inserts, run VACUUM to update the visibility map:

```sql
VACUUM orders;
```

Monitor autovacuum to ensure it runs frequently enough:

```sql
SELECT relname, last_vacuum, last_autovacuum, n_dead_tup
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

High `n_dead_tup` with a stale `last_autovacuum` means Index Only Scans are degraded.

**INCLUDE with UNIQUE constraints:**

```sql
CREATE UNIQUE INDEX idx_orders_unique_ref
ON orders (reference_number) INCLUDE (status, total);
```

This enforces uniqueness on `reference_number` while also enabling Index Only Scans for queries that select status and total.

## Details

### Advanced Topics

**Trade-off analysis.** The decision to create a covering index involves weighing:

- **Benefit:** Eliminated heap I/O (measured in `Heap Fetches` and buffer reads)
- **Cost:** Larger index size (measured with `pg_relation_size`)
- **Break-even:** When the index size increase is less than the heap I/O savings

**Monitoring effectiveness:**

```sql
SELECT indexrelname,
       idx_tup_read,    -- entries returned by index scans
       idx_tup_fetch     -- heap tuples fetched (lower = more index-only scans)
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_orders_cover';
```

When `idx_tup_fetch` is much lower than `idx_tup_read`, the index is serving many Index Only Scans.

**Covering indexes with partial indexes.** Combine both techniques for highly targeted queries:

```sql
CREATE INDEX idx_active_cover
ON orders (created_at) INCLUDE (total, status)
WHERE status = 'active';
```

### Engine Differences

**MySQL InnoDB** handles covering indexes differently due to its clustered index architecture:

- All secondary indexes automatically include the primary key columns -- so the PK is always "covered"
- MySQL has no `INCLUDE` syntax -- to create a covering index, all columns must be regular index keys
- MySQL EXPLAIN shows `Using index` in the Extra column when a covering index is used

```sql
-- MySQL covering index (no INCLUDE syntax available):
CREATE INDEX idx_orders_cover ON orders (created_at, status, total);
```

- Because InnoDB's secondary indexes point to the primary key (not the heap), a non-covering secondary index requires a "bookmark lookup" back to the clustered index -- similar to but not identical to PostgreSQL's heap fetch

**Key difference:** In MySQL, making the primary key narrow (e.g., INT vs UUID) benefits all secondary indexes because the PK is appended to every secondary index entry.

### Real-World Case Studies

**Analytics platform reading 20M rows for daily reports.** The report query selected 4 columns from a 25-column table. Without a covering index, each of the 20M matching rows required a random heap read -- the query took 45 seconds. After adding a covering index with the 4 columns (3 as keys, 1 as INCLUDE), the query used Index Only Scan and completed in 3 seconds. The index added 800MB of storage but eliminated 20M random I/O operations per report run, reducing total daily I/O by 90%.

## Source

- [PostgreSQL Index-Only Scans](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)
- [Use The Index, Luke -- Index-Only Scan](https://use-the-index-luke.com/sql/clustering/index-only-scan-covering-index)

## Process

1. Read the key concepts to understand how covering indexes enable Index Only Scans.
2. Apply covering indexes to high-frequency queries with stable, small SELECT lists where heap I/O is the bottleneck.
3. Verify with `EXPLAIN (ANALYZE, BUFFERS)` that the query uses Index Only Scan with Heap Fetches near zero.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-btree-index, db-composite-index, db-scan-types, db-explain-reading

## Success Criteria

- Covering indexes target high-frequency queries with stable SELECT lists.
- EXPLAIN ANALYZE shows Index Only Scan with Heap Fetches near zero.
- VACUUM frequency is verified to keep the visibility map current.
