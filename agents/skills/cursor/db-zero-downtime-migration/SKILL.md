# Zero-Downtime Migration

> Online schema changes that avoid table locks and keep the application serving traffic throughout the migration.

## When to Use

- Adding, removing, or modifying columns on tables with millions of rows
- Creating indexes on large production tables
- Changing column types or constraints without downtime
- Planning DDL operations during high-traffic periods
- Evaluating whether a migration requires a maintenance window

## Instructions

### Key Concepts

**1. The Lock Problem**

Most DDL statements in PostgreSQL acquire an `ACCESS EXCLUSIVE` lock, which blocks all reads and writes on the table. On a table with active queries, just waiting to acquire this lock can create a queue that cascades into a full outage.

```sql
-- This blocks ALL reads and writes until it completes:
ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;

-- On a table with 100M rows and active queries, this can take
-- minutes to acquire the lock, during which new queries queue up
```

**2. Safe vs Unsafe Operations**

Safe (no rewrite, brief lock):

- `ADD COLUMN` with no default (PostgreSQL 11+ with volatile default is also safe)
- `DROP COLUMN` (marks column as dropped, no rewrite)
- `CREATE INDEX CONCURRENTLY` (does not block writes)
- `ADD CONSTRAINT ... NOT VALID` (skips existing row validation)

Unsafe (full table rewrite or long lock):

- `ALTER COLUMN TYPE` (rewrites every row)
- `ADD COLUMN ... DEFAULT <value>` (pre-PostgreSQL 11)
- `CREATE INDEX` without `CONCURRENTLY`
- `ADD CONSTRAINT` without `NOT VALID`

**3. Lock Timeout Strategy**

Set a short lock timeout so DDL fails fast instead of queueing:

```sql
SET lock_timeout = '3s';
ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;
-- If the lock is not acquired within 3 seconds, the statement
-- fails instead of creating a cascading queue
-- Retry during a quieter moment
```

**4. Concurrent Index Creation**

```sql
-- WRONG: blocks all writes until index is built
CREATE INDEX idx_orders_customer ON orders (customer_id);

-- RIGHT: builds index without blocking writes
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);
-- Takes longer but allows normal operations to continue
-- IMPORTANT: if this fails, it leaves an INVALID index that must be dropped
```

**5. pg_repack**

Rebuilds tables online without holding `ACCESS EXCLUSIVE` for the duration. Uses triggers to capture changes during the rebuild.

```bash
# Rebuild a table to reclaim bloat without downtime
pg_repack --no-superuser-check -t orders mydb

# Rebuild and reorder by a specific column for better locality
pg_repack --no-superuser-check -t orders -o created_at mydb
```

### Worked Example

Scenario: add a `NOT NULL` column with a default to a 50M-row orders table.

```sql
-- Step 1: Add the column as nullable (instant, no rewrite)
SET lock_timeout = '3s';
ALTER TABLE orders ADD COLUMN priority INT;

-- Step 2: Set the default for new rows
ALTER TABLE orders ALTER COLUMN priority SET DEFAULT 0;

-- Step 3: Backfill existing rows in batches
DO $$
DECLARE
  batch_size INT := 10000;
  max_id BIGINT;
  current_id BIGINT := 0;
BEGIN
  SELECT MAX(id) INTO max_id FROM orders;
  WHILE current_id < max_id LOOP
    UPDATE orders
    SET priority = 0
    WHERE id > current_id AND id <= current_id + batch_size
      AND priority IS NULL;
    current_id := current_id + batch_size;
    COMMIT;
  END LOOP;
END $$;

-- Step 4: Add NOT NULL constraint without validating existing rows
ALTER TABLE orders ADD CONSTRAINT orders_priority_not_null
  CHECK (priority IS NOT NULL) NOT VALID;

-- Step 5: Validate the constraint (does not hold ACCESS EXCLUSIVE)
ALTER TABLE orders VALIDATE CONSTRAINT orders_priority_not_null;
```

This approach completes each step in seconds of lock time, regardless of table size.

### Anti-Patterns

1. **Running `ALTER COLUMN TYPE` directly on large tables.** This rewrites every row while holding an `ACCESS EXCLUSIVE` lock. Instead, use the expand-contract pattern: add a new column, backfill, swap in application code, drop old column.

2. **Forgetting `lock_timeout` on DDL statements.** Without a timeout, a DDL statement can wait indefinitely for a lock while queueing all subsequent queries. Always set `lock_timeout` before DDL.

3. **Leaving invalid indexes after failed `CREATE INDEX CONCURRENTLY`.** A failed concurrent index creation leaves an INVALID index. It consumes space and slows writes. Check with `SELECT * FROM pg_indexes WHERE indexdef LIKE '%INVALID%'` and drop invalid indexes.

4. **Backfilling millions of rows in a single transaction.** This holds locks on all modified rows and generates massive WAL. Batch the backfill into chunks of 1,000-10,000 rows with commits between batches.

5. **Using `NOT NULL` constraint directly via `ALTER COLUMN SET NOT NULL`.** On PostgreSQL versions before 12, this scans the entire table. Use a `CHECK` constraint with `NOT VALID` plus `VALIDATE CONSTRAINT` instead.

### PostgreSQL Specifics

- PostgreSQL 11+: `ADD COLUMN ... DEFAULT <value>` no longer rewrites the table for most types. The default is stored in the catalog and applied on read.
- PostgreSQL 12+: `ALTER COLUMN SET NOT NULL` can use an existing valid `CHECK (col IS NOT NULL)` constraint to skip the table scan.
- `pg_stat_progress_create_index` shows progress of `CREATE INDEX CONCURRENTLY`.
- `pg_repack` requires the `pg_repack` extension and briefly acquires `ACCESS EXCLUSIVE` at the start and end of a rebuild.

## Details

### Advanced Topics

**gh-ost for MySQL:** GitHub's online schema change tool avoids MySQL's trigger-based limitations. It creates a shadow table, copies data via binlog streaming, and swaps atomically. Key flags:

```bash
gh-ost --alter "ADD COLUMN shipped_at DATETIME" \
  --database mydb --table orders \
  --host replica.db --allow-on-master \
  --chunk-size 1000 --max-load Threads_running=25 \
  --execute
```

**pt-online-schema-change:** Percona's tool uses triggers to capture changes during the copy. Simpler than gh-ost but adds trigger overhead. Choose gh-ost for high-write tables, pt-osc for simpler setups.

**Statement Timeout as Safety Net:**

```sql
SET statement_timeout = '30s';
-- Any migration step that takes longer than 30s is killed
-- Prevents runaway operations from monopolizing the database
```

### Engine Differences

PostgreSQL provides transactional DDL -- `ALTER TABLE` inside a transaction can be rolled back. MySQL commits DDL implicitly; there is no rollback. This makes PostgreSQL significantly safer for multi-step schema changes, as a failed step does not leave the schema in an inconsistent state.

MySQL's `ALGORITHM=INPLACE` and `ALGORITHM=INSTANT` hint at the DDL strategy. `INSTANT` operations (available in MySQL 8.0+) are similar to PostgreSQL 11+ catalog-only changes. However, MySQL `INSTANT` is limited to adding columns at the end of the table.

### Real-World Case Studies

A SaaS platform needed to add a `tenant_id` column to a 200M-row events table. Direct `ALTER TABLE` estimated 45 minutes of downtime. The team used the zero-downtime approach: added the nullable column (instant), set a default for new rows, backfilled in 10K-row batches over 4 hours during off-peak, then added a `NOT VALID` check constraint and validated it. Total lock time: under 10 seconds cumulative. The application served traffic throughout the entire migration.

## Source

- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [pg_repack](https://reorg.github.io/pg_repack/)
- [gh-ost](https://github.com/github/gh-ost)
- Sadalage, P. & Fowler, M. "Refactoring Databases" (2006)

## Process

1. Classify the DDL operation as safe or unsafe using the lock reference above.
2. Set `lock_timeout` before every DDL statement; fail fast if the lock is not available.
3. For unsafe operations, decompose into safe steps: add column, backfill in batches, add constraint with `NOT VALID`, validate.
4. Monitor with `pg_stat_activity` and `pg_locks` during each migration step.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-expand-contract, db-migration-rollback, db-acid-properties, db-pessimistic-locking, db-deadlock-prevention

## Success Criteria

- Every DDL statement is preceded by `SET lock_timeout` to fail fast instead of queueing.
- Unsafe operations (type changes, adding constraints) are decomposed into safe steps using the expand-contract pattern.
- Indexes are created with `CONCURRENTLY` to avoid blocking writes.
- Data backfills run in batches with commits between batches, not in a single transaction.
