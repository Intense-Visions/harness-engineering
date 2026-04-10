# Optimistic Locking

> Optimistic locking assumes conflicts are rare, allows concurrent reads without locks, and detects conflicts at write time using version columns or conditional updates.

## When to Use

- Web applications with read-heavy workloads and infrequent write conflicts
- Edit-and-save workflows (CMS, admin panels, document editing)
- Any scenario where holding database locks during user think-time is unacceptable
- APIs where multiple clients may update the same resource concurrently
- Distributed systems where database-level locks are impractical

## Instructions

### Key Concepts

**1. Version Column Pattern**

Add an integer `version` column. Read the row including version. Update with a WHERE clause that checks the version, incrementing it on success. If no rows are affected, someone else modified the row first.

```sql
ALTER TABLE products ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- Read
SELECT id, name, stock, version FROM products WHERE id = 42;
-- returns: id=42, name='Widget', stock=10, version=3

-- Update (conditional on version)
UPDATE products
  SET stock = 9, version = version + 1
  WHERE id = 42 AND version = 3;

-- Check result: if 0 rows affected, conflict detected
```

**2. Timestamp-Based**

Use `updated_at` instead of an integer version. Less reliable -- two updates in the same millisecond create a false "no conflict" result. Acceptable only for low-contention workloads where millisecond-level collisions are extremely unlikely.

**3. Conditional Update (Compare-and-Swap)**

No extra column needed. Compare the relevant field values directly:

```sql
UPDATE accounts
  SET balance = 350.00
  WHERE id = 1 AND balance = 500.00;
```

Only works when you can compare the fields that matter. Not suitable when multiple fields may change independently.

**4. Conflict Detection and Retry**

When `rows_affected = 0`, the row was modified by another transaction. The correct response is to re-read the current state, re-apply business logic, and retry. Limit retries (3-5) with exponential backoff. Return HTTP 409 Conflict to the client if retries are exhausted.

### Worked Example

Product inventory update in an e-commerce system:

```sql
-- Step 1: Read current state
SELECT id, name, stock, version
  FROM products WHERE id = 42;
-- returns: stock=10, version=3

-- Step 2: Application logic
-- Customer orders 1 unit, new stock = 9

-- Step 3: Conditional update
UPDATE products
  SET stock = 9, version = version + 1
  WHERE id = 42 AND version = 3
  RETURNING version;
-- If returns a row: success, new version = 4
-- If returns nothing: conflict, another transaction modified this row

-- Step 4: Retry on conflict (pseudocode)
max_retries = 3
for attempt in range(max_retries):
    row = SELECT id, stock, version FROM products WHERE id = 42
    new_stock = row.stock - 1
    if new_stock < 0:
        raise OutOfStock()
    result = UPDATE products SET stock = new_stock, version = version + 1
               WHERE id = 42 AND version = row.version
    if result.rows_affected == 1:
        break  -- success
    -- else: conflict, retry with fresh data
else:
    raise ConflictError("Too many concurrent modifications")
```

### Anti-Patterns

1. **Forgetting to check `rows_affected`.** The UPDATE silently does nothing on conflict. Without checking the result, the application assumes success and proceeds with stale data.

2. **Using optimistic locking for high-contention resources.** If conflicts exceed 5-10%, pessimistic locking (`SELECT FOR UPDATE`) is more efficient. Fewer wasted retries means better throughput. See `db-pessimistic-locking`.

3. **Version column not included in every UPDATE.** If any code path updates the row without incrementing version, the version becomes meaningless and conflicts go undetected.

4. **Retrying without re-reading.** The retry must re-read the current state and re-apply business logic. Re-executing the same UPDATE with the same stale version will fail again indefinitely.

### PostgreSQL Specifics

- Use `RETURNING` to get the new version in one round trip: `UPDATE ... SET version = version + 1 ... RETURNING version;`
- The `xmin` system column changes on every update and can serve as a free version indicator. However, `xmin` is a 32-bit transaction ID that wraps around and is not safe for long-lived comparisons or external storage (e.g., in an API ETag).
- `pg_advisory_lock` can be combined with optimistic locking as a hybrid approach for specific high-contention scenarios.

## Details

### Advanced Topics

**Combining with Read Committed:** The `WHERE version = $old` check in the UPDATE provides conflict detection that Read Committed does not natively offer. This gives you most of the benefit of stricter isolation levels without the overhead of Serializable or the complexity of retry logic for serialization failures.

**Optimistic locking in distributed systems:** The same pattern appears outside databases. HTTP ETags implement optimistic concurrency for REST APIs. Redis CAS (WATCH/MULTI/EXEC) provides optimistic locking for cache updates. The principle is universal: read, compute, write-if-unchanged.

**Advisory locks as hybrid:** For resources that are usually low-contention but occasionally spike, use `pg_try_advisory_lock` to attempt an immediate lock. If it fails (contention detected), fall back to optimistic retry. This avoids both the overhead of always locking and the wasted work of retrying under contention.

### Engine Differences

MySQL InnoDB supports the same version column pattern. MySQL's `ROW_COUNT()` function serves the same role as PostgreSQL's returned row count for checking `rows_affected`. Both engines handle optimistic locking at the application level -- it is not a database feature but a design pattern implemented through conditional updates.

The pattern is identical across engines because it does not depend on engine-specific features. The only difference is syntax for the result check (`RETURNING` in PostgreSQL vs `ROW_COUNT()` in MySQL).

### Real-World Case Studies

A content management system had editors frequently working on the same articles. Pessimistic locking (`SELECT FOR UPDATE`) caused editors to wait for each other, sometimes for minutes during long editing sessions. Switching to optimistic locking with version columns and a merge UI for conflicts improved throughput significantly. Actual conflicts occurred in less than 2% of edits, and when they did occur, editors could review and merge changes rather than losing work.

## Source

- Fowler, M. "Patterns of Enterprise Application Architecture" (2002) -- Optimistic Offline Lock
- [PostgreSQL Application-Level Consistency](https://www.postgresql.org/docs/current/applevel-consistency.html)

## Process

1. Add a `version` integer column (default 0) to mutable entities that may be concurrently modified.
2. Include `AND version = $expected_version` in every UPDATE, with `version = version + 1` in the SET clause.
3. Check `rows_affected` after every conditional update and implement retry logic with exponential backoff for conflicts.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-pessimistic-locking, db-mvcc, db-isolation-levels, db-deadlock-prevention, db-acid-properties, prisma-transactions, drizzle-transactions

## Success Criteria

- Version column present on mutable entities subject to concurrent modification
- Every UPDATE includes version check in WHERE clause and increments version
- `rows_affected` checked after every conditional update
- Retry logic handles conflicts with exponential backoff and a maximum retry count
