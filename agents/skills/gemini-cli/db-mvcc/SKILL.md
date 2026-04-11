# MVCC (Multi-Version Concurrency Control)

> MVCC allows readers and writers to operate concurrently without blocking each other by maintaining multiple versions of each row, with visibility determined by transaction snapshots.

## When to Use

- Understanding why PostgreSQL does not block reads during writes
- Debugging table bloat or unexpected disk space growth
- Tuning autovacuum for high-churn tables
- Understanding `xmin`/`xmax` system columns in query results
- Diagnosing "transaction ID wraparound" warnings in PostgreSQL logs
- Investigating slow sequential scans caused by dead tuple accumulation

## Instructions

### Key Concepts

**1. How MVCC Works**

Every row in PostgreSQL has hidden system columns: `xmin` (the transaction ID that created the row version) and `xmax` (the transaction ID that deleted or updated it). An UPDATE does not modify a row in place -- it creates a new row version and marks the old one as dead by setting its `xmax`.

```sql
-- Observe MVCC in action
CREATE TABLE demo (id int, val text);
INSERT INTO demo VALUES (1, 'original');

SELECT xmin, xmax, * FROM demo;
--  xmin | xmax | id |   val
-- ------+------+----+----------
--   100 |    0 |  1 | original
```

**2. Snapshot Visibility**

A transaction takes a snapshot of active transaction IDs when it begins (or at each statement, depending on isolation level). A row version is visible if: `xmin` is from a committed transaction that committed before the snapshot, AND `xmax` is either zero (not deleted), from an aborted transaction, or from a transaction that committed after the snapshot.

**3. Dead Tuples and Bloat**

Old row versions are not immediately removed. They accumulate as "dead tuples." This causes table bloat -- wasted disk space that degrades sequential scan performance and wastes I/O.

```sql
-- Check dead tuple count
SELECT relname, n_live_tup, n_dead_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 1) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

**4. VACUUM**

Reclaims space from dead tuples. `VACUUM` marks the space as reusable for future inserts (but does not return it to the OS). `VACUUM FULL` rewrites the entire table to compact it, but requires an ACCESS EXCLUSIVE lock.

```sql
-- Standard vacuum (non-blocking)
VACUUM VERBOSE demo;
-- INFO: "demo": removed 1500 dead row versions, 850 pages remain

-- Full vacuum (blocks all access -- avoid during business hours)
VACUUM FULL demo;
```

**5. Transaction ID Wraparound**

Transaction IDs are 32-bit unsigned integers (~4.2 billion). After approximately 2 billion transactions, wraparound can cause all data to appear to be "in the future" and become invisible. Autovacuum's freeze process prevents this by marking old tuples as "frozen" (visible to all future transactions).

### Worked Example

Demonstrating MVCC tuple versioning:

```sql
-- Session A                           -- Session B
BEGIN;
INSERT INTO demo VALUES (2, 'v1');
COMMIT;

SELECT xmin, xmax, * FROM demo
  WHERE id = 2;
-- xmin=200, xmax=0, val='v1'

BEGIN;                                 BEGIN;
                                       UPDATE demo SET val = 'v2'
                                         WHERE id = 2;
                                       COMMIT;

-- Session A still sees 'v1' if using
-- Repeatable Read (snapshot frozen)

SELECT xmin, xmax, * FROM demo
  WHERE id = 2;
-- Under Read Committed: xmin=201, val='v2'
-- Under Repeatable Read: xmin=200, val='v1'
COMMIT;

-- Check dead tuples accumulated
SELECT n_dead_tup FROM pg_stat_user_tables
  WHERE relname = 'demo';
-- n_dead_tup = 1 (the old 'v1' version)

VACUUM VERBOSE demo;
-- Reclaims the dead tuple
```

### Anti-Patterns

1. **Disabling autovacuum.** Dead tuples accumulate without bound, table bloat grows indefinitely, and eventually transaction ID wraparound makes all data invisible. Never disable autovacuum globally. If a specific table has issues, tune its settings rather than disabling.

2. **Long-running transactions holding snapshots.** A transaction that stays open for hours prevents VACUUM from reclaiming any tuples created after that transaction's snapshot -- even in other tables. Monitor `pg_stat_activity` for `idle in transaction` sessions.

3. **High-churn UPDATE patterns without monitoring bloat.** Tables receiving millions of updates per day can bloat to 10x their actual data size if autovacuum cannot keep pace with the default settings.

4. **Using `VACUUM FULL` in production during business hours.** Requires ACCESS EXCLUSIVE lock, blocking all queries on the table for the duration. Use `pg_repack` for online compaction instead.

### PostgreSQL Specifics

**Autovacuum thresholds:** Vacuum triggers when dead tuples exceed `autovacuum_vacuum_threshold` (default 50) + `autovacuum_vacuum_scale_factor` (default 0.2) \* table row count. For a 1 million row table, vacuum triggers at 200,050 dead tuples.

**Per-table tuning for high-churn tables:**

```sql
ALTER TABLE hot_table SET (
  autovacuum_vacuum_scale_factor = 0.01,  -- 1% instead of 20%
  autovacuum_vacuum_cost_delay = 2        -- 2ms instead of 20ms (faster vacuum)
);
```

**Monitoring commands:**

- `SELECT n_dead_tup, last_vacuum, last_autovacuum FROM pg_stat_user_tables;`
- `SELECT age(relfrozenxid) FROM pg_class WHERE relname = 'tablename';` -- distance to wraparound
- `pg_bloat_check` extension for comprehensive bloat detection

## Details

### Advanced Topics

**HOT (Heap-Only Tuples):** If an UPDATE does not change any indexed columns, PostgreSQL can chain the new version to the old one without updating indexes. This significantly reduces bloat and index maintenance overhead. The `fillfactor` storage parameter (default 100) can be lowered to leave room for HOT updates:

```sql
ALTER TABLE frequently_updated SET (fillfactor = 80);
-- 20% of each page reserved for HOT updates
```

**Transaction ID wraparound prevention:** Monitor `age(relfrozenxid)` for all tables. When it approaches 2 billion, PostgreSQL forces an aggressive autovacuum. If this emergency vacuum cannot complete (e.g., due to long-running transactions), the database shuts down to prevent data loss.

```sql
-- Find tables closest to wraparound
SELECT relname, age(relfrozenxid) AS xid_age
FROM pg_class
WHERE relkind = 'r'
ORDER BY age(relfrozenxid) DESC
LIMIT 10;
```

**`pg_repack`:** Extension that performs online table compaction without ACCESS EXCLUSIVE lock (unlike `VACUUM FULL`). Safe for production use during business hours.

### Engine Differences

MySQL InnoDB also uses MVCC but implements it differently. InnoDB stores undo information in a separate **undo log** (rollback segment) rather than keeping old row versions in the table heap. The current version is always in the table; older versions are reconstructed from undo records.

InnoDB's **purge thread** automatically cleans old undo records -- there is no equivalent of PostgreSQL's VACUUM. This means InnoDB does not suffer from table-level bloat in the same way. However, undo log bloat is possible with long-running transactions (the undo tablespace grows and is not reclaimed until the transaction completes).

InnoDB does not have transaction ID wraparound concerns because it uses 48-bit transaction IDs with a different visibility mechanism.

### Real-World Case Studies

A high-traffic analytics platform had a 200GB event tracking table that grew to 1.8TB over three months. Investigation revealed massive bloat: the table received 5 million small updates per hour (status changes on event records), but autovacuum with default settings could not keep pace. Dead tuples accumulated faster than vacuum could remove them. Tuning `autovacuum_vacuum_scale_factor` to 0.01 and `autovacuum_vacuum_cost_delay` to 2ms for that specific table allowed vacuum to run more aggressively. After a one-time `pg_repack` to reclaim the existing bloat, the table stabilized at 230GB with ongoing bloat below 15%.

## Source

- [PostgreSQL MVCC Introduction](https://www.postgresql.org/docs/current/mvcc-intro.html)
- [PostgreSQL Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)

## Process

1. Understand that MVCC creates dead tuples on every UPDATE and DELETE -- this is normal, not a problem unless vacuum falls behind.
2. Monitor dead tuple counts and bloat ratios for high-churn tables using `pg_stat_user_tables`.
3. Tune autovacuum thresholds per-table for tables with update rates that exceed the defaults, and use `pg_repack` for online compaction when needed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-isolation-levels, db-read-phenomena, db-acid-in-practice, db-pessimistic-locking, db-optimistic-locking, db-deadlock-prevention

## Success Criteria

- Autovacuum enabled and monitored for all tables (never globally disabled)
- High-churn tables have per-table autovacuum settings tuned for their update rate
- Dead tuple counts and bloat ratios tracked in monitoring dashboards
- No tables approaching transaction ID wraparound (age(relfrozenxid) < 500 million)
