# Index Strategies

> Master database indexing — B-tree index mechanics and column ordering, composite indexes for multi-column queries, partial indexes for filtered subsets, covering indexes for index-only scans, GIN indexes for JSONB and full-text search, GiST for geometric and range data, and index maintenance strategies.

## When to Use

- EXPLAIN shows sequential scans on frequently queried tables
- Adding an index is needed but you must choose the right type and column order
- A WHERE clause filters on multiple columns and no composite index exists
- A large table has indexes that are never used (write overhead without read benefit)
- JSONB columns need to support efficient key/value lookups
- Full-text search queries are slow without proper indexing
- A table has millions of rows but queries typically filter to a small active subset
- Index bloat has grown to consume significant disk space
- A query returns only indexed columns but still accesses the heap (table data)
- Range queries on timestamps or numeric values do not use indexes efficiently

## Instructions

1. **Understand B-tree index mechanics.** B-tree is the default index type and supports equality, range, sorting, and prefix matching:

   ```sql
   -- B-tree supports: =, <, >, <=, >=, BETWEEN, IN, IS NULL
   -- Also supports: ORDER BY, MIN(), MAX()
   CREATE INDEX idx_orders_created ON orders(created_at);

   -- This index accelerates:
   SELECT * FROM orders WHERE created_at > '2024-01-01';           -- range
   SELECT * FROM orders WHERE created_at = '2024-03-15';           -- equality
   SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;         -- sorting
   SELECT MIN(created_at) FROM orders;                              -- aggregate
   ```

2. **Design composite indexes with correct column order.** Column order in a composite index determines which queries can use it:

   ```sql
   -- Composite index: (status, created_at)
   CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

   -- Uses the index (leftmost prefix):
   WHERE status = 'active'                              -- equality on first col
   WHERE status = 'active' AND created_at > '2024-01-01'  -- equality + range
   WHERE status = 'active' ORDER BY created_at DESC     -- equality + sort
   WHERE status IN ('active', 'pending')                -- IN on first col

   -- Cannot use this index (skips first column):
   WHERE created_at > '2024-01-01'                      -- needs separate index
   ORDER BY created_at DESC                              -- needs separate index
   ```

   **Rule of thumb:** Put equality columns first, then range/sort columns. High-cardinality columns first when multiple equality filters exist.

3. **Create partial indexes for filtered subsets.** Index only the rows that queries actually filter:

   ```sql
   -- Full index: indexes ALL 10M orders (large, expensive to maintain)
   CREATE INDEX idx_orders_status ON orders(status);

   -- Partial index: indexes only the 50K active orders (tiny, fast)
   CREATE INDEX idx_orders_active ON orders(created_at DESC)
     WHERE status = 'active';
   -- 99.5% smaller than a full index

   -- Partial index for soft deletes
   CREATE INDEX idx_users_email_active ON users(email)
     WHERE deleted_at IS NULL;
   -- Queries with WHERE deleted_at IS NULL use this smaller, faster index

   -- Partial unique constraint
   CREATE UNIQUE INDEX idx_users_email_unique ON users(email)
     WHERE deleted_at IS NULL;
   -- Allows duplicate emails for soft-deleted users
   ```

4. **Create covering indexes for index-only scans.** When the index contains all columns the query needs, PostgreSQL skips the heap entirely:

   ```sql
   -- Query: frequently fetch order status and total for a user
   SELECT status, total FROM orders WHERE user_id = 123;

   -- Covering index: INCLUDE columns that are SELECTed but not searched
   CREATE INDEX idx_orders_user_covering ON orders(user_id)
     INCLUDE (status, total);
   -- Result: Index Only Scan (no heap access, ~2x faster)

   -- Verify with EXPLAIN:
   -- Index Only Scan using idx_orders_user_covering on orders
   --   Index Cond: (user_id = 123)
   --   Heap Fetches: 0  ← confirms index-only scan
   ```

5. **Use GIN indexes for JSONB and arrays.** GIN (Generalized Inverted Index) supports containment and existence operators:

   ```sql
   -- GIN index for JSONB containment queries
   CREATE INDEX idx_products_metadata ON products USING GIN (metadata);

   -- Supports:
   WHERE metadata @> '{"color": "red"}'          -- containment
   WHERE metadata ? 'warranty'                     -- key existence
   WHERE metadata ?& array['color', 'size']       -- all keys exist
   WHERE metadata ?| array['sale', 'clearance']   -- any key exists

   -- GIN index for array containment
   CREATE INDEX idx_posts_tags ON posts USING GIN (tags);
   WHERE tags @> ARRAY['javascript', 'react']     -- contains these tags

   -- GIN index for full-text search
   CREATE INDEX idx_articles_search ON articles
     USING GIN (to_tsvector('english', title || ' ' || body));
   ```

6. **Use GiST indexes for geometric and range types.** GiST (Generalized Search Tree) handles spatial, range, and nearest-neighbor queries:

   ```sql
   -- GiST for PostGIS geometric queries
   CREATE INDEX idx_locations_geom ON locations USING GIST (geom);
   WHERE ST_DWithin(geom, ST_MakePoint(-122.4, 37.8)::geography, 5000);

   -- GiST for range type queries (tsrange, int4range)
   CREATE INDEX idx_bookings_period ON bookings USING GIST (
     tsrange(check_in, check_out)
   );
   WHERE tsrange(check_in, check_out) && tsrange('2024-06-01', '2024-06-07');
   -- && is the "overlaps" operator
   ```

7. **Monitor and maintain indexes.** Identify unused indexes and bloat:

   ```sql
   -- Find unused indexes (PostgreSQL)
   SELECT
     schemaname || '.' || relname AS table,
     indexrelname AS index,
     pg_size_pretty(pg_relation_size(i.indexrelid)) AS size,
     idx_scan AS scans
   FROM pg_stat_user_indexes i
   JOIN pg_index USING (indexrelid)
   WHERE idx_scan < 50          -- fewer than 50 scans since last stats reset
     AND NOT indisunique          -- keep unique constraints
   ORDER BY pg_relation_size(i.indexrelid) DESC;

   -- Check index bloat
   SELECT
     tablename,
     indexname,
     pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size,
     round(100 * pg_relation_size(indexname::regclass) /
       NULLIF(pg_table_size(tablename::regclass), 0)) AS pct_of_table
   FROM pg_indexes
   WHERE schemaname = 'public'
   ORDER BY pg_relation_size(indexname::regclass) DESC;

   -- Rebuild bloated indexes (online, no lock in PostgreSQL 12+)
   REINDEX INDEX CONCURRENTLY idx_orders_status_created;
   ```

## Details

### B-tree Internal Structure

A B-tree index is a balanced tree where leaf nodes contain pointers to heap tuples (table rows). For a table with 10 million rows and a B-tree on an integer column: the tree is typically 3-4 levels deep, each level requiring one page read (8KB). An equality lookup reads 3-4 pages (~24-32KB) instead of scanning the entire table (~1.2GB). Range queries read a subtree of consecutive leaf pages. The index is sorted, so ORDER BY on the indexed column is essentially free.

### Write Overhead of Indexes

Every INSERT updates all indexes on the table. Every UPDATE that modifies an indexed column updates those indexes. Every DELETE marks index entries for cleanup. A table with 10 indexes makes writes ~10x more expensive in I/O. This is why dropping unused indexes improves write throughput. The trade-off: read-heavy workloads benefit from more indexes; write-heavy workloads benefit from fewer.

### Worked Example: Instacart Product Search

Instacart's product catalog uses composite B-tree indexes for category browsing: `(store_id, category_id, popularity DESC)` enables instant filtering by store and category sorted by popularity. For search, they use a GIN index on `to_tsvector('english', name || ' ' || description)` that supports full-text search with ranking. For geographic store proximity, a GiST index on the store location column enables `ST_DWithin` queries. The combination of three index types serves their three primary access patterns without full table scans on a 50M+ product table.

### Worked Example: Slack Message History

Slack indexes their messages table with a composite index `(channel_id, ts DESC)` matching their primary query pattern: "show recent messages in channel X." This single index serves both the WHERE filter and the ORDER BY, producing a highly efficient index scan. For search, they use a separate search service (not PostgreSQL) because full-text search at their scale requires a dedicated inverted index system. For the "threads" feature, a partial index `(parent_ts) WHERE parent_ts IS NOT NULL` indexes only the ~10% of messages that are thread replies, keeping the index small.

### Anti-Patterns

**Creating single-column indexes for every column.** If a query filters on (A, B, C), three single-column indexes are less efficient than one composite index (A, B, C). The optimizer can use only one index per table scan (barring BitmapAnd). Design indexes around query patterns, not around individual columns.

**Wrong column order in composite indexes.** `INDEX(created_at, status)` does not help `WHERE status = 'active' ORDER BY created_at` because the range column (created_at) comes before the equality column (status). Correct order: `INDEX(status, created_at)`.

**Indexing low-cardinality columns alone.** An index on a boolean column (true/false) or a status column with 3 values provides minimal selectivity. The optimizer may choose a sequential scan anyway. Use a partial index instead: `WHERE status = 'active'`.

**Never running ANALYZE after bulk loads.** The query planner uses statistics to choose plans. After inserting millions of rows, stale statistics cause cardinality misestimation and suboptimal plans. Run `ANALYZE tablename` after bulk operations.

## Source

- PostgreSQL: Index Types — https://www.postgresql.org/docs/current/indexes-types.html
- PostgreSQL: Partial Indexes — https://www.postgresql.org/docs/current/indexes-partial.html
- Use The Index, Luke — https://use-the-index-luke.com/
- PostgreSQL: GIN Indexes — https://www.postgresql.org/docs/current/gin-intro.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Composite indexes match the application's primary query patterns with correct column order.
- Partial indexes are used for queries that filter to a small subset of rows.
- Covering indexes eliminate heap access for frequently-executed read queries.
- No unused indexes exist (verified via pg_stat_user_indexes).
- JSONB and full-text search queries use GIN indexes.
