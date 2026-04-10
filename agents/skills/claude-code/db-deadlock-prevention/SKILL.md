# Deadlock Prevention

> Deadlocks occur when two or more transactions hold locks and each waits for a lock the other holds; prevention through consistent lock ordering and detection through timeout-based abort resolves them.

## When to Use

- Designing transactions that lock multiple rows or tables
- Debugging `ERROR: deadlock detected` in application logs
- Setting lock timeout strategies for concurrent workloads
- Preventing deadlocks in batch operations that update many rows
- Reviewing transaction code that acquires multiple locks

## Instructions

### Key Concepts

**1. What Is a Deadlock**

Transaction A locks row 1, Transaction B locks row 2. Then A tries to lock row 2 (blocked by B) and B tries to lock row 1 (blocked by A). Neither can proceed.

```sql
-- Session A                           -- Session B
BEGIN;                                 BEGIN;
UPDATE accounts SET balance = 100      UPDATE accounts SET balance = 200
  WHERE id = 1;                          WHERE id = 2;
-- A holds lock on row 1              -- B holds lock on row 2

UPDATE accounts SET balance = 200      UPDATE accounts SET balance = 100
  WHERE id = 2;                          WHERE id = 1;
-- A waits for B's lock on row 2      -- B waits for A's lock on row 1
                                       -- DEADLOCK! PostgreSQL detects and
                                       -- aborts one transaction
```

**2. Lock Ordering (Primary Prevention)**

All transactions that need to lock multiple rows must lock them in the same deterministic order. The simplest approach: sort by primary key ascending.

```sql
-- Safe: always lock lower ID first
BEGIN;
SELECT * FROM accounts
  WHERE id IN (1, 2)
  ORDER BY id
  FOR UPDATE;
-- Both rows locked in consistent order -- no deadlock possible

UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

**3. Lock Timeout**

Set a maximum wait time for locks. If the lock is not acquired within the timeout, the statement fails rather than waiting indefinitely.

```sql
SET lock_timeout = '5s';
-- Any lock acquisition that takes longer than 5 seconds raises:
-- ERROR: canceling statement due to lock timeout
```

Combine with retry logic: catch the timeout error, wait briefly, retry.

**4. Deadlock Detection**

PostgreSQL automatically detects deadlocks after `deadlock_timeout` (default 1 second). It builds a wait-for graph and looks for cycles. When a cycle is found, one transaction is aborted with `ERROR: deadlock detected`. The victim is chosen to minimize the amount of work rolled back.

**5. Reducing Lock Scope**

- Lock fewer rows: only lock the rows you actually need to modify
- Lock for shorter duration: keep transactions short and focused
- Use `FOR NO KEY UPDATE` instead of `FOR UPDATE` when not modifying key columns
- Consider optimistic locking for low-contention resources (see `db-optimistic-locking`)

### Worked Example

Bank transfer that avoids deadlocks:

```sql
-- UNSAFE: lock order depends on transfer direction
-- Transfer $100 from account 1 to account 2
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;  -- lock sender
SELECT * FROM accounts WHERE id = 2 FOR UPDATE;  -- lock receiver
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;

-- If a concurrent transfer goes from account 2 to account 1,
-- the lock order is reversed: deadlock!

-- SAFE: always lock the lower account ID first
CREATE OR REPLACE FUNCTION transfer(
  from_id INT, to_id INT, amount NUMERIC
) RETURNS VOID AS $$
BEGIN
  -- Lock both accounts in deterministic order
  PERFORM * FROM accounts
    WHERE id IN (from_id, to_id)
    ORDER BY id
    FOR UPDATE;

  -- Now safe to update in any order
  UPDATE accounts SET balance = balance - amount WHERE id = from_id;
  UPDATE accounts SET balance = balance + amount WHERE id = to_id;
END;
$$ LANGUAGE plpgsql;
```

The key insight: `ORDER BY id FOR UPDATE` guarantees both accounts are locked in ascending ID order regardless of which is the sender and which is the receiver.

### Anti-Patterns

1. **Locking rows in query-result order instead of a deterministic order.** If two queries return the same rows in different orders (e.g., one sorted by timestamp, another by name), deadlock is possible. Always use a deterministic sort key (primary key) for lock acquisition.

2. **Not handling `ERROR: deadlock detected`.** When PostgreSQL aborts a transaction due to deadlock, the transaction is already rolled back. The application must retry the entire transaction, not just the failed statement.

3. **Setting `deadlock_timeout` too high.** Transactions wait longer before detection, wasting connection pool slots. The default of 1 second is appropriate for most workloads. Lower it only if you have very short transactions and want faster detection.

4. **Acquiring locks incrementally in a loop.** Locking one row at a time in a loop creates a window for deadlock between each lock acquisition. Lock all needed rows in one statement:

```sql
-- BAD: incremental locking
FOR account_id IN SELECT unnest(account_ids) LOOP
  SELECT * FROM accounts WHERE id = account_id FOR UPDATE;
END LOOP;

-- GOOD: batch locking in deterministic order
SELECT * FROM accounts
  WHERE id = ANY(account_ids)
  ORDER BY id
  FOR UPDATE;
```

### PostgreSQL Specifics

- `deadlock_timeout` (default 1s): how long a transaction waits before PostgreSQL checks for deadlocks. The check itself is expensive, so this avoids checking on every lock wait.
- `log_lock_waits = on`: logs any lock wait that exceeds `deadlock_timeout`, even if no deadlock occurs. Essential for identifying lock contention hotspots.
- Monitor current locks: `SELECT * FROM pg_locks WHERE NOT granted;` shows all waiting lock requests.
- Find blockers: `SELECT pg_blocking_pids(pid) FROM pg_stat_activity WHERE wait_event_type = 'Lock';`

## Details

### Advanced Topics

**Deadlock detection algorithm:** PostgreSQL builds a wait-for graph where nodes are transactions and edges represent "waiting for lock held by." A cycle in this graph means deadlock. The victim is chosen to minimize rollback cost -- typically the transaction that has done the least work.

**Advisory lock deadlocks:** `pg_advisory_lock` calls participate in PostgreSQL's deadlock detection. If Transaction A holds advisory lock 1 and waits for advisory lock 2, while Transaction B holds advisory lock 2 and waits for advisory lock 1, PostgreSQL detects and resolves the deadlock just like row-level deadlocks.

**Batch operations:** Break large batch updates into smaller transactions to reduce the window during which locks are held:

```sql
-- Instead of one transaction updating 1 million rows:
-- Process in batches of 1000
DO $$
DECLARE batch_ids INT[];
BEGIN
  FOR batch_ids IN
    SELECT array_agg(id ORDER BY id) FROM (
      SELECT id FROM large_table
      WHERE needs_update = true
      ORDER BY id LIMIT 1000
    ) sub
  LOOP
    UPDATE large_table SET ... WHERE id = ANY(batch_ids);
    -- Each batch is a separate transaction (implicit commit in DO block)
  END LOOP;
END $$;
```

### Engine Differences

MySQL InnoDB detects deadlocks **immediately** (no timeout-based check like PostgreSQL) and rolls back the transaction with the fewest row modifications. This is generally faster detection but uses a different victim selection strategy.

MySQL's **gap locking** creates additional deadlock scenarios not present in PostgreSQL. Two transactions inserting into the same index gap can deadlock even without explicit locking, because gap locks conflict with insert intention locks. This is a common surprise for developers migrating from PostgreSQL to MySQL.

### Real-World Case Studies

A payment processing system experienced 50+ deadlocks per hour during peak load. Investigation revealed the root cause: transfer transactions locked the sender account first, then the receiver. When two users simultaneously transferred money to each other (A to B, and B to A), the lock order reversed, causing deadlocks. The fix was straightforward: always lock the account with the lower ID first using `ORDER BY id FOR UPDATE`. This single change eliminated deadlocks entirely. Adding `log_lock_waits = on` to the PostgreSQL configuration provided ongoing monitoring to catch any new lock contention patterns.

## Source

- [PostgreSQL Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS)
- Gray, J. & Reuter, A. "Transaction Processing: Concepts and Techniques" (1993)

## Process

1. Identify all transactions that lock multiple rows and establish a consistent lock ordering (ascending primary key).
2. Replace incremental lock acquisition loops with batch `WHERE id = ANY(...) ORDER BY id FOR UPDATE` statements.
3. Enable `log_lock_waits = on` and monitor for lock contention; set `lock_timeout` to prevent indefinite waits.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-pessimistic-locking, db-optimistic-locking, db-mvcc, db-isolation-levels, db-acid-properties

## Success Criteria

- Multi-row locking uses consistent ordering (ascending primary key)
- Deadlock detection monitoring enabled (`log_lock_waits = on`)
- Application code handles `ERROR: deadlock detected` with transaction retry logic
- Batch operations broken into smaller transactions to reduce lock hold time
