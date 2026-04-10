# Expression and Specialized Indexes

> Indexes on computed expressions and specialized index types (GIN, GiST) for non-scalar data like JSONB, arrays, and full-text search.

## When to Use

- Case-insensitive searches using `lower()` or `upper()`
- JSONB key lookups and containment queries
- Full-text search with `tsvector` and `tsquery`
- Array containment queries (`@>`, `&&`)
- Geometric, spatial, or range data types

## Instructions

### Key Concepts

An **expression index** indexes the result of a function or expression, not the raw column value:

```sql
CREATE INDEX idx_users_lower_email ON users (lower(email));
```

The query **must use the exact same expression** for the planner to match it:

```sql
-- Uses the index (expression matches):
SELECT * FROM users WHERE lower(email) = 'user@example.com';

-- Does NOT use the index (different function):
SELECT * FROM users WHERE upper(email) = 'USER@EXAMPLE.COM';
```

**GIN (Generalized Inverted Index)** is designed for values containing multiple elements:

```sql
-- Array containment:
CREATE INDEX idx_posts_tags ON posts USING GIN (tags);
SELECT * FROM posts WHERE tags @> ARRAY['postgresql'];

-- JSONB containment:
CREATE INDEX idx_events_meta ON events USING GIN (metadata);
SELECT * FROM events WHERE metadata @> '{"type": "purchase"}';
```

GIN indexes build an inverted index -- each distinct element (array value, JSONB key, text lexeme) maps to a list of row locations. This makes containment and membership queries fast.

**GiST (Generalized Search Tree)** supports geometric, range, and full-text data with operators like overlap (`&&`), contains (`@>`), and nearest-neighbor (`<->`):

```sql
CREATE INDEX idx_locations_geo ON locations USING GiST (coordinates);
SELECT * FROM locations WHERE coordinates && circle('(0,0)', 10);
```

### Worked Example

JSONB metadata search on an events table with 20M rows:

```sql
CREATE TABLE events (
  id         SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  metadata   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Approach 1: GIN index for ad-hoc JSONB queries:**

```sql
CREATE INDEX idx_events_meta_gin ON events USING GIN (metadata);
```

```sql
EXPLAIN ANALYZE
SELECT id, event_type
FROM events
WHERE metadata @> '{"type": "purchase", "source": "mobile"}';
```

```
Bitmap Heap Scan on events
  (cost=45.21..12345.67 rows=2100 width=12)
  (actual time=1.234..8.901 rows=1987 loops=1)
  Recheck Cond: (metadata @> '{"type": "purchase", "source": "mobile"}')
  ->  Bitmap Index Scan on idx_events_meta_gin
        (actual time=1.102..1.102 rows=1987 loops=1)
Execution Time: 9.432 ms
```

**Approach 2: Expression index for a single frequently queried key:**

```sql
CREATE INDEX idx_events_type_expr ON events ((metadata->>'type'));
```

```sql
EXPLAIN ANALYZE
SELECT id, event_type
FROM events
WHERE metadata->>'type' = 'purchase';
```

```
Index Scan using idx_events_type_expr on events
  (cost=0.43..4521.23 rows=18500 width=12)
  (actual time=0.025..12.341 rows=18200 loops=1)
  Index Cond: ((metadata ->> 'type') = 'purchase')
Execution Time: 13.102 ms
```

**When to use which:** GIN for ad-hoc queries across any combination of JSONB keys. Expression index for a single known key queried at high frequency -- smaller index, faster single-key lookup.

### Anti-Patterns

1. **Expression mismatch.** Index on `lower(email)` but query uses `UPPER(email)` -- the planner cannot match different functions. The expression must be identical.

2. **GIN on small scalar columns.** GIN is designed for multi-element data types. Using GIN on a simple TEXT column is overkill -- use a B-tree.

3. **Expensive expressions in indexes.** The expression is evaluated on every INSERT and UPDATE. A computationally expensive function (e.g., involving network calls or complex parsing) in an expression index severely impacts write performance.

4. **GiST when B-tree suffices.** For simple scalar comparisons, B-tree is faster and smaller. GiST is for data types with complex relationships (geometry, ranges, full-text).

### PostgreSQL Specifics

**Trigram indexes for pattern matching.** The `pg_trgm` extension enables GIN indexes that support `LIKE '%pattern%'` (leading wildcard) queries:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING GIN (name gin_trgm_ops);

-- Now this uses the index:
SELECT * FROM users WHERE name LIKE '%alice%';
```

**Full-text search with tsvector and GIN:**

```sql
CREATE INDEX idx_posts_fts ON posts USING GIN (to_tsvector('english', body));
SELECT * FROM posts WHERE to_tsvector('english', body) @@ to_tsquery('postgresql & indexing');
```

**GIN fastupdate.** By default, GIN indexes use a "pending list" to batch insertions, trading faster writes for slightly slower reads. Disable for read-heavy workloads:

```sql
CREATE INDEX idx_meta_gin ON events USING GIN (metadata) WITH (fastupdate = off);
```

## Details

### Advanced Topics

**GIN pending list.** The `gin_pending_list_limit` setting (default 4MB) controls the pending list size. Larger values improve write throughput at the cost of slower first reads after inserts. `VACUUM` flushes the pending list.

**GiST vs SP-GiST.** SP-GiST (Space-Partitioned GiST) is optimized for data that can be partitioned into non-overlapping regions (quad-trees, k-d trees). Use SP-GiST for IP addresses (`inet`), text with prefix matching, and point data with spatial partitioning.

**BRIN indexes** (Block Range Indexes) for naturally ordered data like time-series. BRIN stores min/max values per block range rather than per row -- extremely small indexes for large, physically ordered tables:

```sql
CREATE INDEX idx_events_brin ON events USING BRIN (created_at);
```

**RUM indexes** (extension) extend GIN with ordering support for full-text search, enabling `ORDER BY ts_rank()` without a separate sort step.

### Engine Differences

**MySQL 8.0** supports functional indexes with similar syntax:

```sql
CREATE INDEX idx_lower_email ON users ((LOWER(email)));
```

**MySQL has no GIN equivalent.** Full-text search uses FULLTEXT indexes with different syntax:

```sql
-- MySQL full-text:
CREATE FULLTEXT INDEX idx_posts_body ON posts (body);
SELECT * FROM posts WHERE MATCH(body) AGAINST('postgresql indexing' IN BOOLEAN MODE);
```

MySQL FULLTEXT indexes use an inverted index internally but with different operators and ranking algorithms than PostgreSQL's GIN + tsvector approach.

**MySQL spatial indexes** use R-tree (similar to GiST) via the `SPATIAL` keyword but support fewer operators and data types than PostgreSQL's GiST.

### Real-World Case Studies

**Multi-tenant SaaS storing tenant configuration in JSONB.** Each tenant had a `config JSONB` column with nested feature flags, plan details, and custom settings. Before indexing, admin queries like `WHERE config @> '{"feature_flags": {"beta": true}}'` scanned 2M tenant rows (12 seconds). Adding a GIN index on the `config` column enabled Bitmap Index Scan, dropping the query to 15ms. The GIN index consumed 180MB -- acceptable for eliminating full table scans on an admin dashboard used hundreds of times daily.

## Source

- [PostgreSQL Expression Indexes](https://www.postgresql.org/docs/current/indexes-expressional.html)
- [PostgreSQL GIN Indexes](https://www.postgresql.org/docs/current/gin.html)
- [PostgreSQL GiST Indexes](https://www.postgresql.org/docs/current/gist.html)

## Process

1. Read the key concepts to understand expression indexes, GIN, and GiST and their appropriate use cases.
2. Apply expression indexes when queries use function-wrapped columns, GIN for multi-element containment queries, and GiST for geometric/range data.
3. Verify with EXPLAIN ANALYZE that the planner uses the specialized index and that the query expression matches the index expression exactly.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-btree-index, db-partial-index, db-composite-index, db-explain-reading

## Success Criteria

- Expression indexes match the exact expression used in queries.
- GIN is chosen for array, JSONB, and full-text containment queries.
- GiST is chosen for geometric, range, and nearest-neighbor queries.
- Anti-patterns (expression mismatch, GIN on scalars) are avoided.
