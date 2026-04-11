# Time-Series Data

> Designing append-heavy tables for metrics, events, and logs with time-based partitioning, retention policies, and efficient aggregation.

## When to Use

- IoT sensor data (temperature, pressure, GPS coordinates)
- Application metrics and observability data (request latency, error rates)
- Financial tick data and market prices
- Server logs, access logs, audit events
- Any workload that is append-heavy with time-ordered queries and eventual data expiry

## Instructions

### Key Concepts

Time-series workloads share four characteristics:

1. **Append-only or append-mostly** -- rows are inserted, rarely updated or deleted
2. **Time-range queries** -- WHERE clauses filter by time window
3. **Recency bias** -- recent data is queried far more than old data
4. **Retention period** -- data expires after days, months, or years

**Schema design with partitioning:**

```sql
CREATE TABLE metrics (
  time        timestamptz NOT NULL,
  device_id   int NOT NULL,
  temperature float,
  humidity    float
) PARTITION BY RANGE (time);

-- Create monthly partitions
CREATE TABLE metrics_2024_01 PARTITION OF metrics
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE metrics_2024_02 PARTITION OF metrics
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

**Key design choices:**

- **Partition interval:** Match query granularity. Daily partitions for dashboards, monthly for reports.
- **Chunk size:** Target each partition at 25% of available memory for cache efficiency.
- **Index strategy:** BRIN index on time (much smaller than B-tree for sequential data). B-tree composite on `(device_id, time)` for per-device queries.
- **Retention:** `DROP TABLE metrics_2024_01;` is instant. `DELETE WHERE time < X` creates dead tuples requiring vacuum -- avoid this.

### Worked Example

IoT sensor monitoring platform:

```sql
-- BRIN index on time (100x smaller than B-tree for sequential inserts)
CREATE INDEX idx_metrics_time_brin ON metrics USING brin (time);

-- Composite B-tree for per-device queries
CREATE INDEX idx_metrics_device_time ON metrics (device_id, time);
```

**Time-range query with partition pruning:**

```sql
EXPLAIN ANALYZE
SELECT device_id, avg(temperature), max(humidity)
FROM metrics
WHERE time BETWEEN '2024-03-01' AND '2024-03-31'
GROUP BY device_id;
```

The query plan shows `Partitions removed: 10` -- only the March partition is scanned. Without partitioning, the entire table would be read.

**Retention by dropping old partitions:**

```sql
-- Instant operation, no dead tuples, no vacuum needed
DROP TABLE metrics_2023_01;
```

Compare with DELETE-based retention: `DELETE FROM metrics WHERE time < '2023-02-01'` on a 500M-row table generates millions of dead tuples, triggers autovacuum storms, and takes hours.

**Continuous aggregation for dashboards:**

```sql
CREATE MATERIALIZED VIEW hourly_metrics AS
SELECT
  date_trunc('hour', time) AS hour,
  device_id,
  avg(temperature) AS avg_temp,
  max(temperature) AS max_temp,
  count(*) AS readings
FROM metrics
GROUP BY 1, 2;

CREATE UNIQUE INDEX ON hourly_metrics (hour, device_id);

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_metrics;
```

### Anti-Patterns

1. **Single unpartitioned table for time-series.** Leads to bloat, vacuum pressure, and slow range queries as the table grows past 100M rows.
2. **DELETE for retention instead of DROP PARTITION.** Creates dead tuples, triggers vacuum overhead, and can take hours on large tables.
3. **B-tree index on time column for sequential append data.** BRIN indexes are 100x smaller and provide comparable query performance for time-range scans on physically ordered data.
4. **Not aligning partition boundaries with query patterns.** Monthly partitions with daily queries waste I/O. Daily partitions with yearly queries create thousands of partitions.
5. **Updating time-series rows.** Breaks the append-only assumption, causes HOT update failures on BRIN-indexed tables, and degrades partition pruning effectiveness.

### PostgreSQL Specifics

**Declarative partitioning** (`PARTITION BY RANGE`) is the foundation. PostgreSQL 11+ supports partition pruning at plan time and execution time.

**BRIN indexes** are ideal for time columns because data is physically ordered by insertion time:

```sql
CREATE INDEX ON metrics USING brin (time) WITH (pages_per_range = 32);
```

The `pages_per_range` parameter controls granularity -- smaller values give tighter range summaries at the cost of a larger index.

**pg_partman extension** automates partition creation and retention:

```sql
SELECT partman.create_parent(
  'public.metrics', 'time', 'native', 'monthly'
);
-- Automatically creates future partitions and drops old ones
```

**Materialized views** with `REFRESH CONCURRENTLY` for zero-downtime dashboard aggregation. Requires a unique index on the materialized view.

## Details

### Advanced Topics

**TimescaleDB hypertables** automatically chunk data by time, eliminating manual partition management:

```sql
SELECT create_hypertable('metrics', 'time');
```

TimescaleDB adds compression (columnar, 90%+ size reduction on old chunks), continuous aggregates (real-time aggregation combining materialized and recent data), and `time_bucket()` for flexible time grouping.

**Two-step aggregation:** Pre-aggregate in a materialized view (hourly), then re-aggregate at query time (daily, weekly). This reduces the data scanned for dashboard queries by 100-1000x.

**Write-ahead log tuning** for high-throughput ingestion:

- `synchronous_commit = off` for metrics where losing a few seconds of data on crash is acceptable
- `wal_level = minimal` if replication is not needed
- Batch inserts with `COPY` instead of individual INSERTs (10-50x throughput improvement)

### Engine Differences

MySQL 8.0 supports `PARTITION BY RANGE` but with key differences:

- MySQL lacks BRIN indexes -- use B-tree on time column (larger but functional)
- MySQL partitioning has a limit of 8192 partitions per table
- MySQL lacks materialized views entirely -- use summary tables with scheduled events (`CREATE EVENT`) or application-level refresh
- MySQL does not have a TimescaleDB equivalent -- consider ClickHouse or InfluxDB for high-volume time-series workloads on MySQL stacks

For MySQL, the partition management pattern:

```sql
ALTER TABLE metrics DROP PARTITION p_2023_01;  -- instant retention
ALTER TABLE metrics ADD PARTITION (
  PARTITION p_2024_04 VALUES LESS THAN ('2024-05-01')
);
```

### Real-World Case Studies

**Fleet management platform ingesting 500K sensor readings/minute from 100K vehicles.** Partitioned by day (30 partitions retained), BRIN index on time, composite B-tree on `(vehicle_id, time)`. Write throughput: 500K rows/minute sustained using batched COPY. Query latency: "last 24h for vehicle X" in 4ms. Retention: daily cron drops partitions older than 30 days -- instant, no vacuum. Storage: 2TB raw data per month, reduced to 200GB with TimescaleDB compression on chunks older than 7 days.

## Source

- [TimescaleDB Documentation](https://docs.timescale.com/use-timescale/latest/hypertables/)
- [PostgreSQL Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [PostgreSQL BRIN Indexes](https://www.postgresql.org/docs/current/brin-intro.html)

## Process

1. Read the key concepts to understand time-series characteristics and partitioning strategy.
2. Apply time-based partitioning with BRIN indexes and partition-drop retention.
3. Verify with EXPLAIN ANALYZE that partition pruning is active and that BRIN index scans are used for time-range queries.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-temporal-data, db-audit-trail, db-btree-index, db-composite-index

## Success Criteria

- Time-series tables use time-based partitioning with BRIN indexes.
- Retention is implemented via partition drop, not DELETE.
- Aggregation uses materialized views or continuous aggregates for dashboard queries.
- EXPLAIN ANALYZE confirms partition pruning and BRIN index usage.
