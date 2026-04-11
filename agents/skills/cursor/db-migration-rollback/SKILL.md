# Migration Rollback Strategies

> Forward-only vs reversible migrations, data backfill safety, and blue-green schema patterns for confident schema evolution.

## When to Use

- Deciding whether a migration needs a rollback script
- Planning a deployment that modifies both schema and data
- Designing blue-green or canary database deployment strategies
- Recovering from a failed migration in production
- Evaluating migration framework rollback capabilities

## Instructions

### Key Concepts

**1. Forward-Only vs Reversible Migrations**

Forward-only migrations have no `down` step. Rollback means deploying a new forward migration that undoes the change. This is safer for data mutations because `down` migrations that drop columns destroy data.

```sql
-- Reversible migration:
-- UP:
ALTER TABLE orders ADD COLUMN priority INT DEFAULT 0;
-- DOWN:
ALTER TABLE orders DROP COLUMN priority;
-- DANGER: if priority was populated with real data, DOWN destroys it

-- Forward-only approach:
-- Migration 001: add column
ALTER TABLE orders ADD COLUMN priority INT DEFAULT 0;
-- If rollback needed, deploy migration 002:
-- Migration 002: remove column (explicit, reviewed, data-loss acknowledged)
ALTER TABLE orders DROP COLUMN priority;
```

**2. Data Migration vs Schema Migration**

Schema migrations change structure (DDL). Data migrations change content (DML). Never mix them in a single migration file. Schema changes are generally safe to roll back; data changes are not.

```sql
-- MIGRATION 001 (schema): add column
ALTER TABLE users ADD COLUMN status TEXT;

-- MIGRATION 002 (data): populate column
UPDATE users SET status = 'active' WHERE deleted_at IS NULL;
UPDATE users SET status = 'deleted' WHERE deleted_at IS NOT NULL;

-- Rolling back 002 is safe (SET status = NULL)
-- Rolling back 001 after 002 would lose the status data
```

**3. Blue-Green Schema Pattern**

Run two schema versions simultaneously. The "blue" schema is current production; the "green" schema is the new version. Both coexist until the green schema is validated.

```sql
-- Blue schema (current): orders table with status VARCHAR
-- Green schema (new): orders table with status_enum ENUM type

-- Step 1: Add green column alongside blue
ALTER TABLE orders ADD COLUMN status_enum order_status;

-- Step 2: Both exist, application writes to both
-- Step 3: Validate green data matches blue
SELECT count(*) FROM orders
  WHERE status_enum::text != status;
-- Must return 0

-- Step 4: Switch reads to green
-- Step 5: Drop blue column
ALTER TABLE orders DROP COLUMN status;
```

**4. Backfill Safety Rules**

Data backfills are the most dangerous part of any migration:

- Always backfill in batches (1K-10K rows per batch)
- Always include a `WHERE` clause that limits scope
- Always run in a separate transaction per batch
- Always have a verification query ready
- Never backfill and add a `NOT NULL` constraint in the same migration

```sql
-- Safe backfill pattern:
DO $$
DECLARE
  batch_start BIGINT := 0;
  batch_end BIGINT;
  rows_updated INT;
BEGIN
  LOOP
    batch_end := batch_start + 5000;
    UPDATE orders
    SET priority = CASE
      WHEN total > 1000 THEN 'high'
      ELSE 'normal'
    END
    WHERE id > batch_start AND id <= batch_end
      AND priority IS NULL;
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    batch_start := batch_end;
    EXIT WHEN rows_updated = 0;
    COMMIT;
    PERFORM pg_sleep(0.1);  -- brief pause to reduce load
  END LOOP;
END $$;
```

### Worked Example

Scenario: rename `orders.status` from free-text VARCHAR to an ENUM with validation, with full rollback capability.

```sql
-- Migration 001 (schema): expand
ALTER TABLE orders ADD COLUMN status_v2 order_status_enum;

-- Migration 002 (data): backfill
-- Run in batches, mapping old values to enum values
UPDATE orders SET status_v2 = CASE status
  WHEN 'pending' THEN 'pending'::order_status_enum
  WHEN 'Pending' THEN 'pending'::order_status_enum
  WHEN 'shipped' THEN 'shipped'::order_status_enum
  WHEN 'SHIPPED' THEN 'shipped'::order_status_enum
  ELSE 'unknown'::order_status_enum
END
WHERE id BETWEEN $1 AND $2 AND status_v2 IS NULL;

-- Migration 003 (validation): verify completeness
-- Run as a check, not a migration
SELECT status, count(*) FROM orders
  WHERE status_v2 IS NULL GROUP BY status;
-- Must return 0 rows

-- Migration 004 (schema): contract
-- Only deployed after all application code reads status_v2
ALTER TABLE orders DROP COLUMN status;
ALTER TABLE orders RENAME COLUMN status_v2 TO status;

-- ROLLBACK PLAN (if issues found after migration 002):
-- Deploy migration 005:
UPDATE orders SET status = status_v2::text WHERE status IS NULL;
ALTER TABLE orders DROP COLUMN status_v2;
-- Data preserved, original column restored
```

### Anti-Patterns

1. **Writing `down` migrations that drop columns containing user data.** The `down` migration should be reviewed with the same rigor as the `up`. If it destroys data, it needs a backup step or should not exist.

2. **Mixing DDL and DML in one migration.** If the DML fails partway through, the DDL may or may not be rolled back depending on the database engine. Keep them separate for predictable rollback behavior.

3. **Deploying a data migration without a verification query.** Every data migration needs a `SELECT` that proves the migration succeeded. Run it before proceeding to the next migration.

4. **Assuming `down` migrations are tested.** Teams write `down` migrations but never run them. They rot and fail when actually needed. Test rollbacks in staging before relying on them.

5. **Rolling back schema changes that other migrations depend on.** Migration 003 adds a column; migration 004 adds an index on it. Rolling back 003 without rolling back 004 first breaks the schema. Track migration dependencies explicitly.

### PostgreSQL Specifics

- Transactional DDL means a migration that fails partway through is fully rolled back. This is a significant safety advantage over MySQL.
- `pg_dump --schema-only` captures a point-in-time schema snapshot. Take one before every risky migration as a last-resort recovery option.
- `pg_stat_progress_copy` and `pg_stat_progress_create_index` provide real-time progress for long-running operations.
- Advisory locks can prevent concurrent migration execution: `SELECT pg_advisory_lock(12345)` at migration start, released on commit.

## Details

### Advanced Topics

**Blue-Green Database Deployments:** Run two complete database instances (blue and green) behind a load balancer. Apply migrations to the green database, validate, then switch traffic. Rollback is instant: switch traffic back to blue. Limitation: the databases must be synchronized, which is complex for write-heavy workloads.

**Schema Versioning Table:**

```sql
CREATE TABLE schema_migrations (
  version BIGINT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now(),
  checksum TEXT,  -- hash of migration file content
  execution_time_ms INT,
  rolled_back_at TIMESTAMPTZ  -- NULL if still applied
);
```

Track rollbacks explicitly. A migration that has been applied and rolled back has a non-NULL `rolled_back_at`. This provides audit history.

**Canary Migrations:** Apply the migration to a small percentage of data first. For example, backfill only orders from the last 7 days, validate, then expand to the full table. This catches data-dependent bugs early.

### Engine Differences

MySQL commits DDL implicitly. A migration with `ALTER TABLE` followed by `UPDATE` cannot be rolled back atomically. If the `UPDATE` fails, the `ALTER TABLE` is already permanent. This makes forward-only migrations even more important in MySQL -- you cannot rely on transactional rollback.

MySQL's `binlog` can help recover data after a bad migration by replaying events, but this requires point-in-time recovery infrastructure and is not a substitute for a planned rollback strategy.

### Real-World Case Studies

A fintech company deployed a data migration that normalized phone numbers from 12 different formats into E.164. The migration passed in staging but corrupted 2% of phone numbers in production due to locale-specific formats not present in the test dataset. Because they used forward-only migrations with a separate verification step, they detected the issue before the contract phase. They deployed a new forward migration that re-processed the corrupted rows using an improved normalization function. If they had used a `down` migration instead, rolling back would have lost the 98% of correctly normalized numbers.

## Source

- [PostgreSQL DDL Transactions](https://www.postgresql.org/docs/current/ddl.html)
- Sadalage, P. & Fowler, M. "Refactoring Databases" (2006)
- [Flyway Migrations](https://flywaydb.org/documentation/concepts/migrations)

## Process

1. Classify the migration as schema-only, data-only, or mixed. Split mixed migrations into separate files.
2. Write a verification query that proves the migration succeeded.
3. For data migrations, implement batched backfill with progress tracking.
4. Test the rollback path in a staging environment before deploying to production.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-zero-downtime-migration, db-expand-contract, db-acid-properties, db-isolation-levels

## Success Criteria

- Schema and data migrations are in separate migration files, never mixed.
- Every data migration has a verification query that proves correctness before proceeding.
- Forward-only migrations are preferred; `down` migrations that destroy data are avoided.
- Rollback paths are tested in staging before production deployment.
