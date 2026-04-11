# ACID in Practice

> The mechanisms that make ACID guarantees real: Write-Ahead Logging ensures atomicity and durability, fsync ensures persistence to physical media, and crash recovery replays the WAL to restore a consistent state.

## When to Use

- Tuning the durability vs. performance tradeoff for your workload
- Understanding what happens during crash recovery and why it takes time
- Debugging data loss or corruption after an unclean shutdown
- Configuring WAL settings for replication, backup, or performance
- Evaluating whether relaxed durability is acceptable for specific data types

## Instructions

### Write-Ahead Logging (WAL)

The core invariant: **changes are written to the WAL before they are written to data files.** This is what makes crash recovery possible.

**The write path in PostgreSQL:**

1. Client issues `COMMIT`
2. PostgreSQL writes the transaction's changes to WAL buffers
3. WAL buffers are flushed to disk (`fsync` on WAL segment file)
4. `COMMIT` returns success to the client
5. Later, during a checkpoint, dirty pages are written from shared buffers to data files

The data files may be out of date at any moment -- that is fine, because the WAL contains everything needed to reconstruct the current state.

**Inspecting WAL state:**

```sql
-- Current WAL position
SELECT pg_current_wal_lsn();

-- WAL level (minimal, replica, logical)
SHOW wal_level;

-- Current WAL segment file
SELECT pg_walfile_name(pg_current_wal_lsn());
```

### fsync and Durability

`fsync` forces the operating system to flush file data from kernel buffers to physical storage. Without `fsync`, a power failure can lose data that the OS reported as "written."

**The synchronous_commit tradeoff:**

```sql
-- Default: full durability, every COMMIT waits for WAL fsync
SET synchronous_commit = on;

-- Relaxed: COMMIT returns before WAL fsync, ~5x throughput gain
-- Risk: last few milliseconds of committed transactions may be lost on crash
SET synchronous_commit = off;
```

When `synchronous_commit = off` is acceptable:

- Session tracking data (losing a few seconds of session updates is tolerable)
- Analytics event ingestion (events can be re-sent)
- Non-critical logging

When it is NOT acceptable:

- Financial transactions (payments, transfers, account balances)
- Inventory management (stock counts must be exact)
- Authentication state (password changes, token revocations)

### Worked Example: Per-Table Durability Tuning

```sql
-- Critical table: full durability (default)
BEGIN;
SET LOCAL synchronous_commit = on;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;

-- Non-critical table: relaxed durability for throughput
BEGIN;
SET LOCAL synchronous_commit = off;
INSERT INTO page_views (user_id, path, viewed_at)
  VALUES (42, '/dashboard', NOW());
COMMIT;
```

`SET LOCAL` scopes the setting to the current transaction only -- it does not affect other connections.

### Crash Recovery

When PostgreSQL starts after a crash, it replays WAL records from the last completed checkpoint:

1. Read the control file to find the last checkpoint location
2. Read WAL from that checkpoint forward
3. Apply (redo) all WAL records to bring data files up to date
4. Any transaction that was not committed is effectively rolled back (its changes are never applied to data files)

**Inspecting checkpoint state:**

```bash
# Show last checkpoint location and recovery info
pg_controldata /var/lib/postgresql/data | grep -i checkpoint
```

Recovery time is proportional to the amount of WAL generated since the last checkpoint. Two settings control this:

```sql
-- Maximum time between checkpoints (default: 5 minutes)
SHOW checkpoint_timeout;

-- Maximum WAL size before forcing a checkpoint (default: 1GB)
SHOW max_wal_size;
```

Shorter checkpoint intervals mean faster recovery but more I/O during normal operation.

### Checkpoints

A checkpoint writes all dirty buffers to data files and advances the recovery start point:

```sql
-- Manual checkpoint (rarely needed)
CHECKPOINT;

-- Enable checkpoint logging for monitoring
ALTER SYSTEM SET log_checkpoints = on;
SELECT pg_reload_conf();
```

**Checkpoint tuning for production:**

```sql
-- Spread checkpoint I/O over time (0.0-1.0, default 0.9)
SHOW checkpoint_completion_target;
```

A `checkpoint_completion_target` of 0.9 means PostgreSQL tries to complete the checkpoint I/O within 90% of the checkpoint interval, avoiding I/O spikes.

### Worked Example: Diagnosing Slow Recovery

A production server crashes and takes 15 minutes to recover. Investigation:

```sql
-- Check settings
SHOW checkpoint_timeout;    -- 30min (too long!)
SHOW max_wal_size;          -- 8GB (too large!)
```

With a 30-minute checkpoint interval and 8GB of WAL, recovery must replay up to 8GB of changes. Reducing to `checkpoint_timeout = 5min` and `max_wal_size = 1GB` brings recovery time under 2 minutes at the cost of more frequent (but smaller) checkpoint I/O.

### Anti-Patterns

1. **Disabling fsync for benchmarks and forgetting to re-enable.** `fsync = off` provides dramatic benchmark improvements but guarantees data loss on crash. Never run production with `fsync = off`.

2. **Setting `synchronous_commit = off` globally.** This should be per-transaction or per-session, not a system-wide default. Critical transactions must have durability guarantees.

3. **Assuming cloud storage means durability is free.** EBS volumes can still lose in-flight writes during instance failures. Cloud databases (RDS, Aurora) add replication on top of local fsync, but the application must still use proper transactions.

4. **Ignoring checkpoint warnings in logs.** PostgreSQL logs warnings when checkpoints happen too frequently (`checkpoints are occurring too frequently`). This means `max_wal_size` is too small for the write workload.

## Details

### PostgreSQL full_page_writes

After a checkpoint, the first modification to any page writes the entire page to WAL (not just the change). This protects against partial page writes -- a crash mid-write could leave a page half-old, half-new. The full page image in WAL ensures recovery can restore the complete page.

```sql
-- Default: on (do not disable in production)
SHOW full_page_writes;
```

Disabling `full_page_writes` reduces WAL volume but risks unrecoverable data corruption if a crash occurs during a partial page write.

### MySQL Callout: InnoDB Redo Log and Doublewrite Buffer

MySQL's InnoDB uses a **redo log** (analogous to PostgreSQL's WAL) and a **doublewrite buffer**:

- **Redo log:** Circular log files (`ib_logfile0`, `ib_logfile1`). Same write-ahead principle as PostgreSQL WAL.
- **Doublewrite buffer:** Before writing a dirty page to the tablespace, InnoDB writes it to a sequential doublewrite area. If a crash occurs during the page write, InnoDB recovers the page from the doublewrite buffer. PostgreSQL uses `full_page_writes` for the same purpose.

Key differences: InnoDB redo logs are fixed-size circular buffers (must be sized correctly or writes stall). PostgreSQL WAL segments are created as needed and archived or recycled.

### Cloud Durability

AWS RDS and Aurora replicate WAL to 3 Availability Zones before acknowledging a commit. This provides durability beyond what single-node `fsync` offers -- the data survives even if the entire AZ is lost. However, the replication adds latency (~1-3ms per commit compared to local-only fsync).

Aurora specifically decouples storage from compute: 6 copies of data across 3 AZs, with a quorum write of 4/6. This means Aurora can lose an entire AZ plus one additional storage node and still serve reads and writes.

### Real-World Case Study: Analytics Ingest Pipeline

A real-time analytics platform ingested 50K events/second. With default `synchronous_commit = on`, the database sustained 12K inserts/second -- a 4x gap. Analysis showed events were individually committed (auto-commit mode) and each waited for WAL fsync.

Two changes closed the gap: (1) batch inserts in groups of 100 within a single transaction (reducing fsync calls 100x), and (2) `SET synchronous_commit = off` for the analytics connection pool (acceptable because missed events could be re-sent from the message queue). Throughput reached 60K inserts/second with sub-second crash recovery window.

## Source

- [PostgreSQL WAL Introduction](https://www.postgresql.org/docs/current/wal-intro.html)
- [PostgreSQL WAL Configuration](https://www.postgresql.org/docs/current/wal-configuration.html)
- Rogov, E. "PostgreSQL 14 Internals" (2023), Chapters 9-10

## Process

1. Read the WAL, fsync, and checkpoint mechanisms described in this document.
2. Evaluate your workload to determine the appropriate durability vs. performance tradeoff for each data type.
3. Configure WAL and checkpoint settings based on your recovery time objectives, and verify with controlled crash testing.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-acid-properties, db-cap-theorem

## Success Criteria

- WAL and checkpoint settings are configured appropriately for the workload's durability requirements.
- Relaxed durability (`synchronous_commit = off`) is applied only to non-critical data paths, never globally.
