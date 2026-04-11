# Vertical Partitioning

> Splitting a wide table into multiple narrower tables, separating hot columns from cold columns, and managing large objects with TOAST to reduce I/O and improve cache efficiency.

## When to Use

- Tables with 30+ columns where most queries only access 5-10 columns
- Tables containing both frequently-accessed metadata and rarely-accessed large payloads
- JSONB or TEXT columns causing table bloat that slows scans of other columns
- Hot/cold data patterns where recent data is queried frequently but historical data is rarely touched
- Performance issues from large row sizes reducing the number of rows per page

## Instructions

### Key Concepts

**1. What Is Vertical Partitioning**

Horizontal partitioning splits rows across tables. Vertical partitioning splits columns across tables. The goal: keep frequently-accessed columns together in a narrow table that fits more rows per page, improving cache hit ratios and reducing I/O.

```
Before (one wide table):
  users: id | name | email | avatar_blob | preferences_json | audit_log_json

After (vertically partitioned):
  users:          id | name | email
  user_profiles:  user_id | avatar_blob | preferences_json
  user_audit:     user_id | audit_log_json
```

**2. Row Size and Pages**

PostgreSQL stores data in 8 KB pages. A row with a 4 KB JSONB column and a 2 KB TEXT column wastes most of the page on those columns, leaving room for only 1 row per page. Separating large columns into a different table lets the core table fit 50+ rows per page.

```sql
-- Check average row size
SELECT avg(pg_column_size(t.*)) AS avg_row_bytes,
       8192 / avg(pg_column_size(t.*)) AS rows_per_page
FROM users t;

-- If avg_row_bytes > 2000, vertical partitioning may help
-- Target: narrow table with avg_row_bytes < 200 for hot data
```

**3. Hot/Cold Column Separation**

Identify which columns queries actually read:

```sql
-- Find most-queried columns by analyzing pg_stat_user_tables
-- and checking application query logs

-- Hot columns (queried in 90%+ of queries):
--   id, name, email, status, created_at

-- Cold columns (queried in <5% of queries):
--   bio, avatar_url, preferences, notification_settings

-- Split:
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id),
  bio TEXT,
  avatar_url TEXT,
  preferences JSONB,
  notification_settings JSONB
);
```

**4. TOAST (The Oversized-Attribute Storage Technique)**

PostgreSQL automatically compresses and out-of-line stores values larger than about 2 KB. TOAST is implicit vertical partitioning managed by the storage engine.

```sql
-- Check TOAST usage for a table
SELECT relname, pg_size_pretty(pg_relation_size(reltoastrelid)) AS toast_size
FROM pg_class
WHERE relname = 'users' AND reltoastrelid != 0;

-- Control TOAST strategy per column:
ALTER TABLE users ALTER COLUMN bio SET STORAGE EXTERNAL;    -- store out-of-line, no compression
ALTER TABLE users ALTER COLUMN bio SET STORAGE EXTENDED;    -- compress and store out-of-line (default)
ALTER TABLE users ALTER COLUMN bio SET STORAGE MAIN;        -- compress, try to keep inline
ALTER TABLE users ALTER COLUMN bio SET STORAGE PLAIN;       -- no compression, no TOAST (fails if too large)
```

**5. Join Cost vs I/O Savings**

Vertical partitioning trades join complexity for reduced I/O. The split is worthwhile when:

- The narrow table is queried 10x more than the wide columns
- The cold columns are large (JSONB, TEXT, BYTEA)
- Index-only scans become possible on the narrow table

```sql
-- Without vertical partitioning: every index scan fetches the full wide row
-- With vertical partitioning: index scan on narrow table fetches only hot columns
-- Cold columns only fetched when explicitly joined

-- Query hot data (no join, fast):
SELECT id, name, email FROM users WHERE status = 'active';

-- Query with cold data (join when needed):
SELECT u.id, u.name, p.preferences
FROM users u
JOIN user_profiles p ON u.id = p.user_id
WHERE u.id = 42;
```

### Worked Example

Scenario: an e-commerce product catalog with 2M products. The `products` table has 45 columns, but listing pages only use 6 columns. Detail pages use all columns.

```sql
-- Current table: 45 columns, avg row size 4.2 KB
-- Listing queries (95% of traffic): SELECT id, name, price, image_url, rating, category_id
-- Detail queries (5% of traffic): SELECT * ... WHERE id = ?

-- Step 1: Create narrow table for listing queries
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  rating NUMERIC(3,2),
  category_id INT REFERENCES categories(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
-- avg row size: ~120 bytes, ~65 rows per page

-- Step 2: Create detail table for cold columns
CREATE TABLE product_details (
  product_id BIGINT PRIMARY KEY REFERENCES products(id),
  description TEXT,
  specifications JSONB,
  shipping_info JSONB,
  manufacturer_data JSONB,
  seo_metadata JSONB,
  internal_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 3: Listing query (hot path, no join)
SELECT id, name, price, image_url, rating
FROM products
WHERE category_id = 5
ORDER BY rating DESC
LIMIT 20;
-- Scans narrow table: fast, cache-friendly

-- Step 4: Detail query (cold path, join)
SELECT p.*, d.description, d.specifications, d.shipping_info
FROM products p
JOIN product_details d ON p.id = d.product_id
WHERE p.id = 12345;
-- Single row join by primary key: fast
```

Result: listing pages load 3x faster because the narrow table fits entirely in shared_buffers. Detail pages have negligible overhead from the join since it is a single-row primary key lookup.

### Anti-Patterns

1. **Splitting tables that are already narrow.** If the table has 8 columns and each row is 200 bytes, vertical partitioning adds join overhead with no I/O benefit. Only split when wide rows are causing measurable performance issues.

2. **Putting frequently-joined columns in different partitions.** If queries always need both `name` and `preferences`, splitting them into different tables forces a join on every query. Analyze actual query patterns before splitting.

3. **Using vertical partitioning instead of fixing TOAST behavior.** If large columns are the problem, adjusting TOAST storage strategies may solve the issue without schema changes. Check TOAST usage first.

4. **Creating too many split tables.** Two or three partitions is typical. Five or more becomes a maintenance burden with complex joins and migration scripts. Each split table needs its own indexes, vacuum schedules, and backup considerations.

5. **Not maintaining referential integrity.** The split table must have a foreign key back to the main table. Without it, orphaned rows accumulate when the main table row is deleted.

### PostgreSQL Specifics

- TOAST automatically handles values > ~2 KB. Explicit vertical partitioning is only needed when TOAST's automatic behavior is insufficient (e.g., TOAST overhead is too high for scan-heavy workloads).
- `pg_column_size()` returns the on-disk size of a value, including TOAST overhead.
- `pg_table_size()` includes TOAST table size. `pg_relation_size()` excludes it. Compare both to understand TOAST impact.
- Covering indexes (`INCLUDE` clause, PostgreSQL 11+) can serve as a form of vertical partitioning: store hot columns in the index to enable index-only scans without touching the heap.

```sql
-- Covering index as lightweight vertical partitioning
CREATE INDEX idx_products_listing ON products (category_id, rating DESC)
  INCLUDE (name, price, image_url);

-- This query can be answered entirely from the index:
SELECT name, price, image_url FROM products
  WHERE category_id = 5 ORDER BY rating DESC LIMIT 20;
```

## Details

### Advanced Topics

**Materialized Views as Virtual Vertical Partitions:** Create a materialized view of hot columns (`CREATE MATERIALIZED VIEW products_listing AS SELECT id, name, price ...`). Listing queries hit the view; detail queries hit the base table. This avoids schema changes but adds refresh overhead and data staleness.

**Column-Oriented Storage:** Extensions like `cstore_fdw` (now `columnar` in Citus) store data column-by-column rather than row-by-row, providing automatic vertical partitioning at the storage level:

```sql
-- Citus columnar storage
CREATE TABLE analytics_events (
  id BIGSERIAL, event_type TEXT, user_id INT,
  payload JSONB, created_at TIMESTAMPTZ
) USING columnar;

-- Queries that read only event_type and created_at skip payload column entirely
```

### Engine Differences

MySQL's InnoDB stores all columns in a single clustered index (primary key B-tree). Large BLOB/TEXT columns are stored off-page, similar to PostgreSQL's TOAST. MySQL does not expose storage strategy controls per-column the way PostgreSQL does with `SET STORAGE`.

MySQL's `ROW_FORMAT=COMPRESSED` compresses entire rows, which can help with wide tables but adds CPU overhead. PostgreSQL's column-level TOAST compression is more granular.

### Real-World Case Studies

A job board stored listings with 40+ columns including a 20 KB average `description` HTML field. Search queries (95% of traffic) only needed title, company, location, and salary. The `listings` table was 800 GB; shared_buffers could only cache 3% of it. After vertically partitioning into `listings` (8 hot columns, avg 180 bytes) and `listing_content` (descriptions, requirements, benefits), the hot table shrank to 45 GB. Shared_buffers could cache 35% of it. Search p95 latency dropped from 1.2s to 180ms. Detail page latency was unchanged because the join was a single-row primary key lookup adding under 1ms.

## Source

- [PostgreSQL TOAST](https://www.postgresql.org/docs/current/storage-toast.html)
- [PostgreSQL Page Layout](https://www.postgresql.org/docs/current/storage-page-layout.html)
- Kleppmann, M. "Designing Data-Intensive Applications" (2017), Chapter 3

## Process

1. Measure average row size and identify hot vs cold columns from query patterns.
2. If large columns dominate row size, check TOAST behavior before splitting tables.
3. Create a narrow table with hot columns and a detail table with cold columns, linked by foreign key.
4. Verify performance improvement with `EXPLAIN ANALYZE` comparing before and after query plans.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-table-partitioning, db-horizontal-sharding, db-denormalization, db-btree-index

## Success Criteria

- Hot and cold columns are identified from actual query patterns before splitting.
- The narrow (hot) table fits significantly more rows per page, improving cache hit ratios.
- TOAST behavior is checked before splitting; explicit partitioning is used only when TOAST is insufficient.
- Referential integrity is maintained between split tables via foreign keys.
