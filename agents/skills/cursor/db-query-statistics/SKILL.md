# Query Statistics and Selectivity

> How the planner uses table statistics (pg_stats, histograms, most-common-values) to estimate row counts and choose execution plans.

## When to Use

- Diagnosing planner misestimations (estimated rows vs actual rows differ by 10x+)
- Understanding why the planner chose a bad plan despite correct indexes
- Tuning statistics targets for columns with skewed distributions
- After bulk data loads, migrations, or large deletes that change data distribution
- Investigating queries where EXPLAIN shows correct indexes but wrong join strategies

## Instructions

### Key Concepts

The planner does not look at actual table data at query time. Instead, it uses pre-computed statistics stored in `pg_statistic` (accessible via the `pg_stats` view). These statistics are sampled approximations, not exact counts.

**Key statistics columns in `pg_stats`:**

- `n_distinct` -- estimated number of distinct values. Positive values are absolute counts; negative values are fractions of total rows (e.g., -1.0 means every row is unique)
- `most_common_vals` -- the N most frequent values in the column
- `most_common_freqs` -- the frequency of each most-common value (fractions of total rows)
- `histogram_bounds` -- equal-frequency histogram bucket boundaries for values not in the MCV list
- `null_frac` -- fraction of rows that are NULL
- `correlation` -- how well the physical row order matches the logical (sorted) order. Values near 1.0 or -1.0 mean high correlation

**The ANALYZE command** samples the table and updates these statistics:

```sql
ANALYZE orders;                    -- analyze one table
ANALYZE orders (status);            -- analyze one column
ANALYZE;                            -- analyze all tables in the database
```

Autovacuum runs ANALYZE automatically, but it may lag behind large data changes.

### Worked Example

Examining statistics for the `status` column on an orders table:

```sql
SELECT
  attname,
  n_distinct,
  most_common_vals,
  most_common_freqs,
  null_frac,
  correlation
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'status';
```

```
 attname | n_distinct | most_common_vals            | most_common_freqs        | null_frac | correlation
---------+------------+-----------------------------+--------------------------+-----------+------------
 status  |          3 | {completed,active,cancelled} | {0.85,0.12,0.03}         |         0 |       0.15
```

**How the planner uses this:** For `WHERE status = 'active'`, the estimated rows = total_rows \* 0.12. On a 10M-row table, the estimate is 1.2M rows. For `WHERE status = 'cancelled'`, the estimate is 300K rows.

**Misestimation scenario:** After a data migration that marked 90% of orders as cancelled (previously 3%), the statistics are stale:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status = 'cancelled';
```

```
Index Scan using idx_orders_status on orders
  (cost=0.43..12345.67 rows=300000 width=52)
  (actual time=0.031..8923.450 rows=9000000 loops=1)
```

Estimated 300K rows, actual 9M -- a 30x misestimation. The planner chose Index Scan (good for 300K) instead of Seq Scan (better for 9M). Fix:

```sql
ANALYZE orders;
```

After ANALYZE, the planner sees the updated distribution and switches to Seq Scan:

```
Seq Scan on orders (cost=0.00..223456.00 rows=9010000 width=52)
  (actual time=0.012..1234.567 rows=9000000 loops=1)
  Filter: (status = 'cancelled')
Execution Time: 1345.678 ms
```

**Increasing statistics granularity** for skewed distributions:

```sql
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
ANALYZE orders;
```

The default `default_statistics_target` is 100 (100 histogram buckets and 100 MCV entries). For highly skewed columns, increasing to 500-1000 gives the planner a more accurate picture.

### Anti-Patterns

1. **Never running ANALYZE after bulk operations.** After a large INSERT, DELETE, or UPDATE that changes data distribution, statistics are stale. The planner uses the old distribution, producing bad plans. Always `ANALYZE tablename;` after bulk changes.

2. **Setting default_statistics_target too low.** The default of 100 works for uniform distributions but fails for skewed data. Columns with thousands of distinct values at varying frequencies need higher targets.

3. **Ignoring n_distinct misestimates.** For high-cardinality columns (e.g., user_id with 50M distinct values), the sampled n_distinct can be significantly off. Override with: `ALTER TABLE orders ALTER COLUMN user_id SET (n_distinct = -1);` (tells the planner every value is unique).

4. **Disabling autovacuum.** Autovacuum also runs auto-ANALYZE. Disabling it means statistics are never refreshed automatically, guaranteeing plan degradation over time.

### PostgreSQL Specifics

**default_statistics_target** controls the number of histogram buckets and MCV entries. Default: 100. Maximum: 10000. Higher values increase ANALYZE time but improve estimation accuracy:

```sql
-- Global setting:
SET default_statistics_target = 200;

-- Per-column override:
ALTER TABLE events ALTER COLUMN event_type SET STATISTICS 500;
```

**Extended statistics** for correlated columns (PostgreSQL 10+):

```sql
CREATE STATISTICS stat_orders_status_region (dependencies)
ON status, region FROM orders;
ANALYZE orders;
```

Without extended statistics, the planner assumes columns are independent. If `status = 'active'` AND `region = 'us-east'` are correlated (e.g., 80% of us-east orders are active), the default estimation multiplies their individual frequencies, producing a significant underestimate.

**Monitoring ANALYZE freshness:**

```sql
SELECT relname, last_analyze, last_autoanalyze, n_live_tup, n_dead_tup
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

If `last_autoanalyze` is days old and `n_dead_tup` is high, autovacuum is falling behind.

## Details

### Advanced Topics

**Multivariate statistics evolution:**

- PostgreSQL 10: functional dependencies (`dependencies`)
- PostgreSQL 12: MCV lists for column combinations (`mcv`)
- PostgreSQL 14: expression statistics (`expressions`)

```sql
CREATE STATISTICS stat_orders_multi (dependencies, mcv)
ON status, region, tenant_id FROM orders;
```

**Selectivity estimation for complex predicates.** AND clauses multiply individual selectivities (assuming independence). OR clauses use inclusion-exclusion. NOT inverts selectivity. These assumptions break down for correlated columns -- extended statistics fix this.

**The 1/n_distinct fallback.** For values not in the MCV list and not in the histogram range, PostgreSQL estimates selectivity as 1/n_distinct. This is a rough guess and can be significantly wrong for new or rare values.

**pg_statistic_ext** stores extended statistics data. Query it to verify that your extended statistics are being computed:

```sql
SELECT stxname, stxkeys, stxkind
FROM pg_statistic_ext
WHERE stxrelid = 'orders'::regclass;
```

### Engine Differences

**MySQL** uses `ANALYZE TABLE` (not just `ANALYZE`) to update statistics:

```sql
ANALYZE TABLE orders;
```

MySQL stores statistics in `mysql.innodb_index_stats` and `mysql.innodb_table_stats`. Key differences:

- **Persistent statistics** (`innodb_stats_persistent = ON` by default since 5.6): statistics survive restarts
- **Sampling pages** (`innodb_stats_persistent_sample_pages`, default 20): controls sample size for ANALYZE. Much smaller than PostgreSQL's default of 30,000 \* `default_statistics_target` rows
- **Histogram support** added in MySQL 8.0: `ANALYZE TABLE t UPDATE HISTOGRAM ON col WITH 100 BUCKETS;`
- **No extended/multivariate statistics** -- MySQL assumes column independence for all multi-column predicates

MySQL's optimizer uses a simpler statistics model overall. For complex queries with correlated columns, PostgreSQL's extended statistics provide significantly better estimates.

### Real-World Case Studies

**Reporting system with daily batch inserts of 5M rows.** After each nightly batch, morning report queries degraded from 2 seconds to 30+ seconds. Investigation showed that autovacuum's ANALYZE had not run since the batch completed -- the statistics still reflected the previous day's distribution. Adding `ANALYZE reporting_events;` to the batch job's post-load step ensured fresh statistics. Query performance remained consistent at 2 seconds. Selectivity estimation error dropped from 100x (stale stats) to under 2x (fresh stats).

## Source

- [PostgreSQL Planner Statistics](https://www.postgresql.org/docs/current/planner-stats.html)
- [PostgreSQL Row Estimation Examples](https://www.postgresql.org/docs/current/row-estimation-examples.html)

## Process

1. Read the key concepts to understand how the planner uses pg_stats for selectivity estimation.
2. Apply ANALYZE after bulk data changes, and increase statistics targets for columns with skewed distributions.
3. Verify by checking `pg_stats` for your key columns and comparing EXPLAIN estimated rows to actual rows.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-explain-reading, db-scan-types, db-query-rewriting, db-btree-index

## Success Criteria

- Statistics freshness is verified after bulk operations (`ANALYZE` runs in post-load steps).
- Misestimations are diagnosed by comparing pg_stats values to actual data distribution.
- Extended statistics are created for correlated columns that cause multi-column estimation errors.
