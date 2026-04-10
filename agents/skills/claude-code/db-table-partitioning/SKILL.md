# Table Partitioning

> Splitting a large table into smaller physical partitions by range, list, or hash to improve query performance, simplify maintenance, and enable efficient data lifecycle management.

## When to Use

- Tables exceeding 100 GB or 100M rows where queries target a known subset
- Time-series data where queries filter by date range
- Multi-tenant tables where queries filter by tenant ID
- Tables requiring periodic data archival or deletion (drop partition vs DELETE)
- Queries with sequential scans on large tables that could benefit from partition pruning

## Instructions

### Key Concepts

**1. Partitioning Types**

**Range partitioning:** Split by a continuous range, typically timestamps or numeric IDs.

```sql
CREATE TABLE events (
  id BIGSERIAL,
  tenant_id INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_q1 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE events_2024_q2 PARTITION OF events
  FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
CREATE TABLE events_2024_q3 PARTITION OF events
  FOR VALUES FROM ('2024-07-01') TO ('2024-10-01');
CREATE TABLE events_2024_q4 PARTITION OF events
  FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');
```

**List partitioning:** Split by discrete values, typically status or region.

```sql
CREATE TABLE orders (
  id BIGSERIAL,
  region TEXT NOT NULL,
  total NUMERIC
) PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('us-east', 'us-west');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('eu-west', 'eu-central');
CREATE TABLE orders_ap PARTITION OF orders FOR VALUES IN ('ap-south', 'ap-east');
```

**Hash partitioning:** Distribute evenly across N partitions for balanced load.

```sql
CREATE TABLE sessions (
  id UUID NOT NULL,
  user_id INT NOT NULL,
  data JSONB
) PARTITION BY HASH (user_id);

CREATE TABLE sessions_p0 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_p1 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE sessions_p2 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE sessions_p3 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

**2. Partition Pruning**

PostgreSQL's query planner eliminates partitions that cannot contain matching rows:

```sql
-- Only scans events_2024_q3, skips all other partitions
EXPLAIN SELECT * FROM events
  WHERE created_at >= '2024-07-15' AND created_at < '2024-08-01';

-- Verify pruning in EXPLAIN output:
-- "Partitions removed: 3" or "Subplans Removed: 3"
```

Pruning requires the partition key in the `WHERE` clause. Without it, PostgreSQL scans all partitions.

**3. Partition Maintenance**

```sql
-- Add a new partition before data arrives
CREATE TABLE events_2025_q1 PARTITION OF events
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');

-- Archive old data by detaching a partition (instant, no row-level locks)
ALTER TABLE events DETACH PARTITION events_2024_q1;
-- Now events_2024_q1 is a standalone table; move to cold storage or drop

-- Drop old data without expensive DELETE + VACUUM
DROP TABLE events_2024_q1;
```

### Worked Example

Scenario: an IoT platform stores 500M sensor readings per month. Queries always filter by `recorded_at` within a single day or week.

```sql
-- Create the partitioned parent table
CREATE TABLE sensor_readings (
  id BIGSERIAL,
  device_id INT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION,
  metadata JSONB
) PARTITION BY RANGE (recorded_at);

-- Create monthly partitions (automate via cron or pg_partman)
CREATE TABLE sensor_readings_2024_01 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- ... one partition per month

-- Create index on each partition (inherited automatically in PG 11+)
CREATE INDEX ON sensor_readings (device_id, recorded_at);

-- Query with partition pruning
EXPLAIN ANALYZE
SELECT avg(value) FROM sensor_readings
  WHERE device_id = 42
    AND recorded_at >= '2024-06-01'
    AND recorded_at < '2024-06-08';
-- Only scans sensor_readings_2024_06
-- Without partitioning: full table scan of 6B+ rows

-- Monthly maintenance: archive data older than 1 year
ALTER TABLE sensor_readings DETACH PARTITION sensor_readings_2023_01;
-- Move to S3 or drop
```

Automated partition creation with `pg_partman`:

```sql
CREATE EXTENSION pg_partman;
SELECT create_parent(
  'public.sensor_readings',
  'recorded_at',
  'native',
  'monthly'
);
-- pg_partman creates future partitions and manages retention automatically
```

### Anti-Patterns

1. **Partitioning tables under 10 GB.** Small tables gain nothing from partitioning. The overhead of partition management and query planning across partitions can make queries slower than scanning a single small table.

2. **Choosing a partition key that queries do not filter on.** If queries never include the partition key in WHERE clauses, every query scans all partitions. The partition key must align with the dominant query pattern.

3. **Creating too many partitions.** Each partition is a separate table with its own file descriptors and catalog entries. Thousands of partitions slow query planning and `pg_dump`. Daily partitions on a 10-year table means 3,650 partitions -- monthly is usually sufficient.

4. **Forgetting to create future partitions.** Inserts into a partitioned table fail if no matching partition exists. Automate partition creation with `pg_partman` or a scheduled job.

5. **Using partitioning instead of proper indexing.** Partitioning is not a substitute for indexes. A well-indexed unpartitioned table often outperforms a poorly-indexed partitioned table. Add partitioning when indexes alone are insufficient.

### PostgreSQL Specifics

- Declarative partitioning (PostgreSQL 10+) replaces the old inheritance-based approach. Always use declarative partitioning for new tables.
- PostgreSQL 11+: indexes created on the parent table are automatically created on all partitions.
- PostgreSQL 12+: foreign keys can reference partitioned tables.
- PostgreSQL 14+: `DETACH PARTITION ... CONCURRENTLY` avoids blocking concurrent queries during detach.
- `enable_partition_pruning = on` (default) must be set for pruning to work.

## Details

### Advanced Topics

**Sub-Partitioning:** Partition by range on date, then sub-partition by list on region:

```sql
CREATE TABLE events (id BIGSERIAL, region TEXT, created_at TIMESTAMPTZ)
  PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_q1 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01')
  PARTITION BY LIST (region);

CREATE TABLE events_2024_q1_us PARTITION OF events_2024_q1
  FOR VALUES IN ('us');
CREATE TABLE events_2024_q1_eu PARTITION OF events_2024_q1
  FOR VALUES IN ('eu');
```

Use sparingly -- sub-partitioning multiplies partition count and management complexity.

**Partition-Wise Joins (PostgreSQL 11+):** When two tables are partitioned on the same key, PostgreSQL can join partition-to-partition instead of gathering all data first:

```sql
SET enable_partitionwise_join = on;
-- Joins events_2024_q1 with metrics_2024_q1 directly
```

### Engine Differences

MySQL supports range, list, hash, and key partitioning. Key differences from PostgreSQL: MySQL does not support partition-wise joins, does not support sub-partitioning with declarative syntax (uses a different mechanism), and requires the partition key to be part of every unique index including the primary key. This constraint often forces awkward composite primary keys in MySQL.

MySQL's `ALTER TABLE ... REORGANIZE PARTITION` can split or merge partitions online but acquires a metadata lock that can block queries.

### Real-World Case Studies

A financial analytics platform stored 2 billion transaction records in a single table. Queries filtered by `transaction_date` but full table scans took 45 minutes. After partitioning by month (24 partitions for 2 years of data), queries targeting a single month completed in under 10 seconds. Monthly data retention became trivial: `DROP TABLE transactions_2022_01` completed in milliseconds instead of a 3-hour DELETE operation that generated massive WAL and required extended VACUUM.

## Source

- [PostgreSQL Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [pg_partman](https://github.com/pgpartman/pg_partman)

## Process

1. Identify the partition key by analyzing the dominant query filter pattern.
2. Choose range (time-series), list (categorical), or hash (even distribution) based on the data and query patterns.
3. Create the partitioned table and initial partitions; automate future partition creation with pg_partman.
4. Verify partition pruning with `EXPLAIN` on representative queries.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-horizontal-sharding, db-vertical-partitioning, db-btree-index, db-explain-reading
