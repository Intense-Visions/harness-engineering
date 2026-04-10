# Isolation Levels

> The four SQL standard isolation levels control which concurrent transaction side-effects are visible, with PostgreSQL implementing them via MVCC snapshots rather than traditional locking.

## When to Use

- Choosing transaction isolation for a new feature
- Debugging phantom reads or non-repeatable reads in concurrent workloads
- Understanding why PostgreSQL's "Read Uncommitted" behaves like Read Committed
- Performance tuning concurrent workloads that experience serialization failures
- Evaluating isolation requirements when migrating between PostgreSQL and MySQL

## Instructions

### Key Concepts

**1. Read Uncommitted**

Can see uncommitted changes from other transactions. PostgreSQL does not implement this level -- it silently upgrades to Read Committed. MySQL InnoDB supports it but it is rarely useful in production.

**2. Read Committed (PostgreSQL default)**

Each statement sees only data committed before that statement began. Different statements within the same transaction can see different committed snapshots. This is sufficient for the vast majority of web application workloads.

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

BEGIN;
SELECT balance FROM accounts WHERE id = 1;  -- sees 500
-- Another session commits: UPDATE accounts SET balance = 400 WHERE id = 1;
SELECT balance FROM accounts WHERE id = 1;  -- sees 400 (new commit visible)
COMMIT;
```

**3. Repeatable Read**

The transaction sees a snapshot taken at the first non-transaction-control statement. All queries within the transaction see the same snapshot. PostgreSQL raises a serialization error on write conflicts instead of blocking.

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

BEGIN;
SELECT balance FROM accounts WHERE id = 1;  -- sees 500 (snapshot taken)
-- Another session commits: UPDATE accounts SET balance = 400 WHERE id = 1;
SELECT balance FROM accounts WHERE id = 1;  -- still sees 500 (snapshot unchanged)
COMMIT;
```

**4. Serializable**

Full serializable isolation via Serializable Snapshot Isolation (SSI). Transactions appear to execute one at a time. PostgreSQL detects read/write dependency cycles and aborts one transaction with `ERROR: could not serialize access`.

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

### Worked Example

Two-session demonstration of Read Committed vs Repeatable Read:

```
Session A (Read Committed)              Session B
-------------------------------         ----------------------------
BEGIN;
SELECT balance FROM accounts
  WHERE id = 1;
  -- returns 500
                                        BEGIN;
                                        UPDATE accounts SET balance = 400
                                          WHERE id = 1;
                                        COMMIT;
SELECT balance FROM accounts
  WHERE id = 1;
  -- returns 400 (sees B's commit)
COMMIT;

Session A (Repeatable Read)             Session B
-------------------------------         ----------------------------
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts
  WHERE id = 1;
  -- returns 500 (snapshot taken)
                                        BEGIN;
                                        UPDATE accounts SET balance = 400
                                          WHERE id = 1;
                                        COMMIT;
SELECT balance FROM accounts
  WHERE id = 1;
  -- still returns 500 (snapshot frozen)
UPDATE accounts SET balance = balance + 100
  WHERE id = 1;
  -- ERROR: could not serialize access
  -- (row was modified after snapshot)
COMMIT;
```

Under Repeatable Read, Session A's update fails because the row was modified after its snapshot. The application must catch this error and retry the entire transaction.

### Anti-Patterns

1. **Using Serializable everywhere "for safety."** Unnecessary serialization failures and retries for workloads that only need Read Committed. Most CRUD operations are safe at Read Committed.

2. **Assuming Repeatable Read prevents all anomalies.** Write skew is still possible under PostgreSQL Repeatable Read. Two transactions can read overlapping data and write non-overlapping data that together violate a business constraint. See `db-read-phenomena`.

3. **Not handling serialization failures.** Serializable and Repeatable Read can raise `ERROR: could not serialize access`. Application code must catch `SQLSTATE 40001` and retry the entire transaction, not just the failed statement.

### PostgreSQL Specifics

- PostgreSQL's Read Uncommitted is actually Read Committed -- there is no way to see uncommitted data
- PostgreSQL uses SSI (predicate locking) for Serializable, not traditional two-phase locking
- Set session-level defaults: `SET default_transaction_isolation = 'repeatable read';`
- Inspect current level: `SHOW transaction_isolation;`
- Per-transaction override: `BEGIN ISOLATION LEVEL SERIALIZABLE;`

## Details

### Advanced Topics

**SSI Implementation:** PostgreSQL tracks SIRead locks (predicate locks) and rw-dependency edges between transactions. When a dangerous structure (a cycle of rw-dependencies) is detected, one transaction is aborted. This is optimistic -- transactions proceed without blocking, and conflicts are detected at commit time.

**Performance overhead:** Serializable adds approximately 5-15% overhead in typical OLTP workloads due to predicate lock tracking. The overhead scales with the number of concurrent serializable transactions.

**Monitoring:** Use `pg_stat_activity.backend_xid` and `pg_stat_activity.backend_xmin` to identify transactions holding old snapshots. Long-running transactions under Repeatable Read or Serializable prevent VACUUM from reclaiming dead tuples.

### Engine Differences

MySQL InnoDB defaults to **Repeatable Read** (not Read Committed like PostgreSQL). This has practical implications when migrating applications between engines.

MySQL uses **gap locking** for Repeatable Read to prevent phantom inserts. PostgreSQL uses MVCC snapshots instead, which means PostgreSQL Repeatable Read does not block concurrent inserts but may raise serialization errors on write conflicts.

MySQL's **Serializable** uses shared read locks on all SELECT statements, which reduces concurrency significantly compared to PostgreSQL's SSI approach. PostgreSQL's SSI is optimistic (no blocking, abort-on-conflict), while MySQL's is pessimistic (blocking reads).

### Real-World Case Studies

A financial reporting system ran end-of-day balance calculations under Read Committed. Reports that executed during active trading showed inconsistent totals -- a report might see some accounts with pre-trade balances and others with post-trade balances within the same query window. Switching the reporting transactions to Repeatable Read gave each report a consistent point-in-time snapshot, eliminating the inconsistencies without affecting the trading system's throughput.

## Source

- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- Ports, D. & Grittner, K. "Serializable Snapshot Isolation in PostgreSQL" (VLDB 2012)

## Process

1. Identify the correctness requirements of your transaction (what anomalies are unacceptable).
2. Select the minimum isolation level that prevents those anomalies using the phenomena matrix from `db-read-phenomena`.
3. Implement retry logic for any transaction running at Repeatable Read or Serializable.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-read-phenomena, db-isolation-selection, db-acid-properties, db-mvcc, db-pessimistic-locking, prisma-transactions, drizzle-transactions

## Success Criteria

- Correct isolation level selected for the workload's actual requirements
- Serialization errors handled with retry logic (catch `SQLSTATE 40001`, retry entire transaction)
- No unnecessary use of Serializable for workloads safe at Read Committed
