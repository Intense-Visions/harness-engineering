# Expand-Contract Migration

> Add new structure, migrate data, remove old structure -- the three-phase pattern for safe column renames, type changes, and table restructuring.

## When to Use

- Renaming a column or table in a production database
- Changing a column type (e.g., INT to BIGINT, VARCHAR to JSONB)
- Splitting a table or merging two tables
- Any schema change where old and new application versions must coexist
- Deploying backwards-compatible database changes in a rolling deployment

## Instructions

### Key Concepts

**1. The Three Phases**

- **Expand:** Add the new column/table alongside the old one. Both exist simultaneously.
- **Migrate:** Copy data from old to new. Application writes to both (dual-write) or a trigger synchronizes them.
- **Contract:** Remove the old column/table after all consumers use the new one.

Each phase is a separate deployment. The application must work correctly at every intermediate state.

**2. Column Rename Pattern**

You cannot safely rename a column in a single step because the old application code still references the old name.

```sql
-- Phase 1: EXPAND -- add new column
ALTER TABLE users ADD COLUMN full_name TEXT;

-- Phase 2: MIGRATE -- backfill and dual-write
UPDATE users SET full_name = name WHERE full_name IS NULL;
-- Application code writes to BOTH name and full_name

-- Phase 3: CONTRACT -- drop old column
-- Only after all application instances use full_name
ALTER TABLE users DROP COLUMN name;
```

**3. Dual-Write Strategy**

During the migrate phase, the application writes to both old and new columns. This ensures either version of the application can read correctly.

```sql
-- Application INSERT during migrate phase:
INSERT INTO users (name, full_name, email)
VALUES ('Alice', 'Alice', 'alice@example.com');

-- Trigger-based alternative (keeps sync automatic):
CREATE OR REPLACE FUNCTION sync_name_to_full_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.full_name IS NULL THEN
    NEW.full_name := NEW.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_name
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sync_name_to_full_name();
```

**4. Type Change Pattern**

Changing a column type (e.g., `INT` to `BIGINT`) requires a full table rewrite if done directly. Expand-contract avoids this:

```sql
-- Phase 1: EXPAND
ALTER TABLE orders ADD COLUMN order_number_v2 BIGINT;

-- Phase 2: MIGRATE
-- Backfill in batches (see db-zero-downtime-migration for batch pattern)
UPDATE orders SET order_number_v2 = order_number
  WHERE id BETWEEN 1 AND 10000 AND order_number_v2 IS NULL;
-- ... repeat in batches

-- Application starts reading from order_number_v2,
-- writing to both columns

-- Phase 3: CONTRACT
ALTER TABLE orders DROP COLUMN order_number;
ALTER TABLE orders RENAME COLUMN order_number_v2 TO order_number;
```

### Worked Example

Scenario: a multi-service system needs to rename the `users.name` column to `users.display_name` while three services query the table.

```sql
-- Deploy 1: EXPAND
ALTER TABLE users ADD COLUMN display_name TEXT;
CREATE OR REPLACE FUNCTION sync_user_name() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.display_name IS NULL THEN
      NEW.display_name := NEW.name;
    ELSIF NEW.name IS NULL OR NEW.name != NEW.display_name THEN
      NEW.name := NEW.display_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sync_user_name
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sync_user_name();

-- Deploy 2: BACKFILL
-- Run during off-peak in 5K-row batches
UPDATE users SET display_name = name
  WHERE display_name IS NULL
    AND id BETWEEN $1 AND $2;

-- Deploy 3-5: Update each service to read/write display_name
-- Each service deploys independently

-- Deploy 6: CONTRACT
-- Verify: SELECT count(*) FROM users WHERE display_name IS NULL;
-- Must return 0
DROP TRIGGER trg_sync_user_name ON users;
DROP FUNCTION sync_user_name();
ALTER TABLE users DROP COLUMN name;
```

Timeline: 2-4 weeks, depending on service deployment cadence. The database is safe at every intermediate state.

### Anti-Patterns

1. **Renaming a column directly with `ALTER TABLE RENAME COLUMN`.** This breaks all application code referencing the old name instantly. Expand-contract avoids this by maintaining both names during transition.

2. **Skipping the dual-write phase.** If old application instances still write to the old column while new instances read from the new column, data is silently lost. Both columns must stay synchronized.

3. **Never completing the contract phase.** Dead columns accumulate, confuse developers, waste storage, and slow queries. Set a deadline for the contract phase and track it as tech debt.

4. **Backfilling in a single transaction.** A single `UPDATE users SET display_name = name` locks millions of rows. Batch the backfill with explicit bounds and commits between batches.

5. **Using database views as a permanent compatibility layer.** Views add indirection and query complexity. They are a reasonable temporary bridge during migration but should not persist after the contract phase.

### PostgreSQL Specifics

- `ALTER TABLE ... ADD COLUMN` is instant (no table rewrite) in PostgreSQL 11+ even with a default value.
- Triggers used for dual-write synchronization fire inside the same transaction as the triggering statement, ensuring ACID guarantees.
- `DROP COLUMN` does not physically remove data; it marks the column as dropped. Use `VACUUM FULL` or `pg_repack` to reclaim space afterward if needed.
- PostgreSQL supports transactional DDL, so the expand phase can be wrapped in a transaction for atomicity.

## Details

### Advanced Topics

**Table Splits:** When splitting a wide table into two narrower tables (vertical split), expand-contract applies at the table level:

1. Create the new table with a foreign key to the original
2. Backfill data from the original table
3. Update application queries to join or query the new table
4. Drop the migrated columns from the original table

**Feature Flags for Contract Phase:** Use application-level feature flags to control which column the application reads from. This makes the contract phase reversible: if issues arise, flip the flag back to the old column.

**Automated Expand-Contract:** Tools like `reshape` (Rust-based schema migration) automate the expand-contract pattern. They generate the triggers and handle the dual-write automatically, reducing manual error.

### Engine Differences

MySQL lacks transactional DDL. Each `ALTER TABLE` commits implicitly, so a multi-step expand operation cannot be rolled back atomically. This makes careful planning even more critical: if the expand step partially succeeds, manual cleanup is required.

MySQL `pt-online-schema-change` and `gh-ost` can automate the expand-contract pattern for column type changes by creating a shadow table, copying data, and swapping. They effectively implement expand-contract internally.

### Real-World Case Studies

GitHub migrated their `repositories.id` column from INT to BIGINT on a table with billions of rows. The expand-contract approach took several weeks: they added a `new_id BIGINT` column, set up dual-write synchronization via application code, backfilled the new column in background batches, updated all queries to use the new column, and finally dropped the old column. At no point was the service interrupted. The migration was invisible to users.

## Source

- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- Sadalage, P. & Fowler, M. "Refactoring Databases" (2006)
- [Expand-Contract Pattern](https://openpracticelibrary.com/practice/expand-and-contract-pattern/)

## Process

1. Add the new column or table (expand) with appropriate defaults and a sync trigger.
2. Backfill existing data in batches; enable dual-write in application code.
3. Deploy each consuming service to read from the new structure.
4. Verify all data is migrated and all services are updated, then drop the old structure (contract).

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-zero-downtime-migration, db-migration-rollback, db-acid-properties, db-acid-in-practice
