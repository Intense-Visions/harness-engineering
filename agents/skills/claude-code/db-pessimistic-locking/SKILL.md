# Pessimistic Locking

> Pessimistic locking acquires locks before modifying data, guaranteeing exclusive access and preventing conflicts at the cost of reduced concurrency.

## When to Use

- High-contention resources where optimistic retries would be excessive (conflict rate > 5-10%)
- Financial transactions requiring guaranteed exclusive access to account rows
- Inventory decrements where overselling is unacceptable
- Queue-like processing patterns using `SKIP LOCKED`
- Any workflow where two concurrent modifications to the same row would cause data corruption

## Instructions

### Key Concepts

**1. SELECT FOR UPDATE**

Acquires a row-level exclusive lock. Other transactions attempting `FOR UPDATE` or `UPDATE` on the same row block until the lock is released at `COMMIT` or `ROLLBACK`.

```sql
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- Row is now locked -- other transactions wait here
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;  -- lock released
```

**2. Lock Modes**

PostgreSQL offers four row-level lock strengths:

| Mode                | Blocks                        | Use Case                           |
| ------------------- | ----------------------------- | ---------------------------------- |
| `FOR UPDATE`        | All other row locks           | Full exclusive access              |
| `FOR NO KEY UPDATE` | Other updates (not KEY SHARE) | Update non-key columns             |
| `FOR SHARE`         | Updates (not other SHARE)     | Shared read lock, prevent changes  |
| `FOR KEY SHARE`     | Only FOR UPDATE               | Prevent key changes, allow updates |

Use the weakest lock that satisfies your requirements. `FOR NO KEY UPDATE` is preferred over `FOR UPDATE` when you are not modifying primary key or unique constraint columns.

**3. NOWAIT and SKIP LOCKED**

```sql
-- NOWAIT: fail immediately instead of waiting
SELECT * FROM accounts WHERE id = 1 FOR UPDATE NOWAIT;
-- ERROR: could not obtain lock on row (if already locked)

-- SKIP LOCKED: skip already-locked rows
SELECT * FROM tasks WHERE status = 'pending'
  ORDER BY created_at LIMIT 1
  FOR UPDATE SKIP LOCKED;
-- Returns the next unlocked row, or nothing if all are locked
```

**4. Lock Duration**

Row locks are held until the end of the transaction (`COMMIT` or `ROLLBACK`). There is no way to release a row lock early within a transaction. Keep transactions short to minimize blocking.

### Worked Example

Job queue processing with `SKIP LOCKED` -- multiple workers dequeue tasks concurrently:

```sql
-- Worker 1                            -- Worker 2
BEGIN;                                 BEGIN;
SELECT id, payload FROM tasks          SELECT id, payload FROM tasks
  WHERE status = 'pending'               WHERE status = 'pending'
  ORDER BY created_at                    ORDER BY created_at
  LIMIT 1                               LIMIT 1
  FOR UPDATE SKIP LOCKED;               FOR UPDATE SKIP LOCKED;
-- returns task 101                    -- returns task 102 (101 is locked)

UPDATE tasks                           UPDATE tasks
  SET status = 'processing',             SET status = 'processing',
      worker_id = 'w1'                       worker_id = 'w2'
  WHERE id = 101;                        WHERE id = 102;

-- ... process task ...                -- ... process task ...

UPDATE tasks SET status = 'done'       UPDATE tasks SET status = 'done'
  WHERE id = 101;                        WHERE id = 102;
COMMIT;                                COMMIT;
```

Both workers operate on different tasks without conflicts. No retries needed.

### Anti-Patterns

1. **Locking rows during user think-time.** Holding `FOR UPDATE` across an HTTP request-response cycle blocks other users for seconds or minutes. Use optimistic locking for user-facing edit workflows instead. See `db-optimistic-locking`.

2. **Locking more rows than needed.** `SELECT * FROM orders FOR UPDATE` without a WHERE clause locks every row in the table. Always scope your lock to the minimum set of rows.

3. **Forgetting `SKIP LOCKED` in queue patterns.** Without it, all workers serialize on the same row instead of processing in parallel. The second worker blocks until the first commits.

4. **Mixing `FOR UPDATE` with `SERIALIZABLE` isolation.** Redundant and can cause unexpected serialization failures. `FOR UPDATE` in Read Committed already provides the exclusion you need. Adding Serializable adds SSI overhead with no additional benefit for the locked rows.

### PostgreSQL Specifics

- **Monitoring locks:** `SELECT * FROM pg_locks WHERE relation = 'accounts'::regclass;`
- **Lock timeout:** `SET lock_timeout = '5s';` to prevent indefinite waits
- **Deadlock timeout:** `deadlock_timeout` (default 1s) controls when PostgreSQL checks for deadlocks
- **Advisory locks:** `pg_advisory_lock(key)` for application-defined locking that does not map to specific rows. Useful for locking abstract resources (e.g., a customer ID across multiple tables).
- **Who is blocking whom:** `SELECT pg_blocking_pids(pid) FROM pg_stat_activity;`

## Details

### Advanced Topics

**Advisory locks for distributed coordination:**

```sql
-- Lock on an application-defined key (e.g., customer ID for cross-table operations)
SELECT pg_advisory_lock(hashtext('customer:' || customer_id::text));
-- ... perform operations across multiple tables ...
-- Lock released at end of session (or use pg_advisory_xact_lock for transaction scope)
```

**Table-level locks:** `LOCK TABLE orders IN EXCLUSIVE MODE;` for bulk operations that need to prevent all concurrent modifications. Rarely needed -- prefer row-level locks.

**Lock escalation:** PostgreSQL does not escalate row locks to table locks (unlike SQL Server). You can lock millions of individual rows without the engine deciding to lock the entire table. This makes PostgreSQL's locking behavior more predictable.

### Engine Differences

MySQL InnoDB uses **gap locking** in addition to row locking under Repeatable Read. A `FOR UPDATE` query can lock index gaps between rows, blocking inserts into ranges -- even inserts that would not conflict with the locked rows. This causes unexpected blocking and is a common source of contention in MySQL.

PostgreSQL does not use gap locks because MVCC handles phantom prevention differently. This means PostgreSQL's `FOR UPDATE` is more precisely targeted: it locks exactly the rows selected, nothing more.

MySQL's `LOCK IN SHARE MODE` is the equivalent of PostgreSQL's `FOR SHARE`. MySQL 8.0+ also supports `FOR SHARE` and `SKIP LOCKED` syntax, matching PostgreSQL's capabilities.

### Real-World Case Studies

A ticket booking system for concert events originally used optimistic locking for seat selection. During high-demand on-sale events, the optimistic retry rate reached 40% as thousands of users competed for the same popular seats. Switching to `SELECT ... FOR UPDATE NOWAIT` with immediate user feedback ("seat unavailable, please pick another") reduced conflicts to near zero. Users got instant feedback instead of experiencing retry loops, and the system handled 10x the concurrent load without contention issues.

## Source

- [PostgreSQL Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- Kleppmann, M. "Designing Data-Intensive Applications" (2017)

## Process

1. Identify rows that require exclusive access during modification and use the weakest lock mode sufficient.
2. Add `SKIP LOCKED` for queue patterns and `NOWAIT` when immediate feedback is preferred over waiting.
3. Keep transactions holding locks as short as possible and monitor lock waits via `pg_locks` and `log_lock_waits`.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-optimistic-locking, db-deadlock-prevention, db-isolation-levels, db-mvcc, db-acid-properties, prisma-transactions, drizzle-transactions

## Success Criteria

- Row locks scoped to the minimum necessary rows with appropriate WHERE clauses
- Transactions holding locks are kept short (no user think-time under lock)
- `SKIP LOCKED` used for queue/worker patterns
- `NOWAIT` used when immediate feedback is preferred over blocking
- Lock waits monitored via `pg_locks` and `log_lock_waits = on`
