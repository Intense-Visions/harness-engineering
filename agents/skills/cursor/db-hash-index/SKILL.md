# Hash Indexes

> Optimized for equality-only lookups with O(1) average access time, hash indexes are smaller than B-tree when range queries and ordering are never needed.

## When to Use

- Columns queried exclusively with `=` operator (never range, ORDER BY, or IS NULL)
- High-cardinality columns like UUIDs, session tokens, or API keys
- Workloads where index size matters and the column is never used in sorting
- PostgreSQL 10+ environments (hash indexes were not crash-safe before v10)

## Instructions

### Key Concepts

A hash index applies a hash function to each indexed value, mapping it to a bucket. Lookups compute the hash of the search value and jump directly to the matching bucket -- O(1) average time.

**Critical limitation:** Hash indexes only support the `=` operator. They cannot do:

- Range queries (`<`, `>`, `BETWEEN`)
- Ordering (`ORDER BY`)
- IS NULL lookups
- Pattern matching (`LIKE`)

**Syntax:**

```sql
CREATE INDEX idx_sessions_token ON sessions USING hash (token);
```

The `USING hash` clause is required -- without it, PostgreSQL creates a B-tree by default.

**Size advantage:** For pure equality workloads, hash indexes are typically 20-40% smaller than equivalent B-tree indexes because they do not store values in sorted order and have a simpler page structure.

### Worked Example

Consider a session lookup table with 50M rows where the only access pattern is `WHERE session_token = ?`:

```sql
CREATE TABLE sessions (
  id            SERIAL PRIMARY KEY,
  session_token UUID NOT NULL,
  user_id       INT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL
);

-- Create both index types for comparison:
CREATE INDEX idx_sessions_hash  ON sessions USING hash (session_token);
CREATE INDEX idx_sessions_btree ON sessions USING btree (session_token);
```

**Query using the hash index:**

```sql
EXPLAIN ANALYZE
SELECT user_id, expires_at
FROM sessions
WHERE session_token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

```
Index Scan using idx_sessions_hash on sessions
  (cost=0.00..2.02 rows=1 width=12)
  (actual time=0.018..0.019 rows=1 loops=1)
  Index Cond: (session_token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
Planning Time: 0.089 ms
Execution Time: 0.042 ms
```

**Size comparison:**

```sql
SELECT
  pg_size_pretty(pg_relation_size('idx_sessions_hash'))  AS hash_size,
  pg_size_pretty(pg_relation_size('idx_sessions_btree')) AS btree_size;
```

```
 hash_size | btree_size
-----------+-----------
 1.1 GB    | 1.8 GB
```

The hash index is 40% smaller for the same 50M UUID values, because it stores fixed-size hash values rather than the full sorted UUID.

After confirming the hash index works, drop the redundant B-tree:

```sql
DROP INDEX idx_sessions_btree;
```

### Anti-Patterns

1. **Hash index on columns used in ORDER BY.** Hash indexes cannot produce sorted output. If any query needs `ORDER BY session_token`, a B-tree is required.

2. **Hash index on low-cardinality columns.** A status column with 3 distinct values gains nothing from hashing -- all values land in very few buckets. Use a partial index or accept sequential scan.

3. **Hash index on PostgreSQL < 10.** Before version 10, hash indexes were not WAL-logged and could not survive a crash or be replicated. Never use them on older versions.

4. **Choosing hash when size difference is negligible.** If the indexed column is a small integer (4 bytes), B-tree and hash indexes are nearly the same size. Keep B-tree for its broader operator support.

5. **Hash index with UNIQUE constraint.** PostgreSQL does not support UNIQUE hash indexes. If you need uniqueness enforcement, use B-tree.

### PostgreSQL Specifics

**WAL safety (v10+).** Hash indexes became WAL-logged in PostgreSQL 10, making them crash-safe and replication-compatible. Before v10, a crash required a full REINDEX.

**Monitoring usage:**

```sql
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_sessions_hash';
```

If `idx_scan` is zero after production traffic, the index is unused and should be dropped.

**REINDEX for bloated hash indexes:**

```sql
REINDEX INDEX CONCURRENTLY idx_sessions_hash;
```

Hash indexes can accumulate overflow pages after many inserts and deletes. REINDEX reclaims space.

## Details

### Advanced Topics

**Internal structure.** A hash index consists of four page types:

- **Meta page** (page 0): stores the hash function identifier and current bucket count
- **Bucket pages**: primary storage for hash entries, one per hash bucket
- **Overflow pages**: chained from bucket pages when a bucket is full
- **Bitmap pages**: track which overflow pages are free for reuse

When the number of entries exceeds the bucket capacity, PostgreSQL splits buckets (doubling the bucket count). This split operation is logged in WAL for crash safety.

**Hash collisions.** Different values can hash to the same bucket. PostgreSQL stores the full hash value with each entry and rechecks the actual column value to resolve collisions. High collision rates increase overflow pages and degrade performance.

**Parallel builds.** PostgreSQL 15+ supports parallel hash index builds, reducing creation time for large tables.

### Engine Differences

**MySQL InnoDB** does not support explicit hash indexes. The **Adaptive Hash Index (AHI)** is an internal InnoDB optimization that automatically builds in-memory hash indexes for frequently accessed B-tree pages. You cannot create, drop, or control AHI directly -- it is managed by the `innodb_adaptive_hash_index` setting (ON by default).

**MySQL MEMORY engine** supports explicit hash indexes (`USING HASH`), but the MEMORY engine stores all data in RAM, does not persist across restarts, and is rarely used in production.

**Practical impact:** In MySQL, you always create B-tree indexes. If InnoDB detects a hot equality-lookup pattern, AHI accelerates it transparently. There is no MySQL equivalent to PostgreSQL's explicit `CREATE INDEX ... USING hash`.

### Real-World Case Studies

**API gateway with 200M session tokens.** The gateway authenticated every request by looking up `WHERE token = ?`. Switching from a B-tree to a hash index on the `token` column (UUID type) reduced index size from 8.5GB to 5.1GB (40% reduction) and average lookup latency from 0.23ms to 0.19ms (15% improvement). The savings were meaningful at scale: 50K lookups/second meant the reduced I/O translated to measurably lower CPU and buffer pool pressure.

## Source

- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [PostgreSQL 10 Release Notes -- Hash Index Durability](https://www.postgresql.org/docs/10/release-10.html)

## Process

1. Read the key concepts to understand when hash indexes outperform B-tree.
2. Apply hash indexes only to columns with exclusively equality lookups and no ordering, range, or NULL requirements.
3. Verify with EXPLAIN ANALYZE that the planner uses the hash index and compare index sizes.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-btree-index, db-composite-index, db-explain-reading, db-scan-types

## Success Criteria

- Hash indexes are used only for equality-only columns where B-tree's broader operator support is unnecessary.
- B-tree is preferred when any range, ordering, or NULL lookup is needed.
- Index size reduction is verified with `pg_relation_size` comparison.
