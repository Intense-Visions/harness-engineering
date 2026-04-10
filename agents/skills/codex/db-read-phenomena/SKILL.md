# Read Phenomena

> The SQL standard defines three read anomalies (dirty, non-repeatable, phantom) that isolation levels progressively prevent, plus PostgreSQL adds write skew as a fourth anomaly relevant to Serializable.

## When to Use

- Debugging data inconsistencies in concurrent systems
- Understanding the trade-offs table in `SET TRANSACTION ISOLATION LEVEL` documentation
- Choosing the correct isolation level to prevent a specific anomaly
- Explaining why a query "sees stale data" or returns unexpected results
- Diagnosing race conditions in multi-user applications

## Instructions

### Key Concepts

**1. Dirty Read**

Reading uncommitted data from another transaction. If that transaction rolls back, you acted on data that never existed.

```sql
-- Session A                           -- Session B
BEGIN;
UPDATE accounts SET balance = 0
  WHERE id = 1;
                                       -- Dirty read: sees balance = 0
                                       -- even though A has not committed
ROLLBACK;
                                       -- The balance was never actually 0
```

Not possible in PostgreSQL at any isolation level -- even Read Uncommitted prevents dirty reads.

**2. Non-Repeatable Read**

Reading the same row twice in a transaction and getting different values because another transaction committed an UPDATE between reads.

```sql
-- Session A (Read Committed)          -- Session B
BEGIN;
SELECT balance FROM accounts
  WHERE id = 1;  -- returns 500
                                       BEGIN;
                                       UPDATE accounts SET balance = 400
                                         WHERE id = 1;
                                       COMMIT;
SELECT balance FROM accounts
  WHERE id = 1;  -- returns 400
COMMIT;
```

Possible under Read Committed. Prevented by Repeatable Read and Serializable.

**3. Phantom Read**

Re-executing a query and getting different rows because another transaction committed an INSERT or DELETE matching the WHERE clause.

```sql
-- Session A (Read Committed)          -- Session B
BEGIN;
SELECT COUNT(*) FROM orders
  WHERE status = 'pending';
  -- returns 5
                                       BEGIN;
                                       INSERT INTO orders (status)
                                         VALUES ('pending');
                                       COMMIT;
SELECT COUNT(*) FROM orders
  WHERE status = 'pending';
  -- returns 6 (phantom row appeared)
COMMIT;
```

Possible under Read Committed. In PostgreSQL, Repeatable Read also prevents phantom reads (MVCC snapshot). In MySQL InnoDB, Repeatable Read uses gap locking for phantom prevention.

**4. Write Skew**

Two transactions read overlapping data, make decisions based on what they read, and write non-overlapping data that together violate a constraint. Only prevented by Serializable.

```sql
-- Hospital on-call: at least one doctor must be on-call
-- doctors table: (name, on_call) = [('Alice', true), ('Bob', true)]

-- Session A (Repeatable Read)         -- Session B (Repeatable Read)
BEGIN;                                 BEGIN;
SELECT COUNT(*) FROM doctors
  WHERE on_call = true;
  -- returns 2, safe to drop
                                       SELECT COUNT(*) FROM doctors
                                         WHERE on_call = true;
                                         -- returns 2, safe to drop
UPDATE doctors SET on_call = false
  WHERE name = 'Alice';
                                       UPDATE doctors SET on_call = false
                                         WHERE name = 'Bob';
COMMIT;                                COMMIT;
-- Both succeed! No one is on-call -- constraint violated.
```

**Phenomena vs Isolation Level Matrix (SQL Standard)**

| Phenomenon     | Read Uncommitted | Read Committed | Repeatable Read | Serializable |
| -------------- | ---------------- | -------------- | --------------- | ------------ |
| Dirty Read     | Possible         | Prevented      | Prevented       | Prevented    |
| Non-Repeatable | Possible         | Possible       | Prevented       | Prevented    |
| Phantom Read   | Possible         | Possible       | Possible\*      | Prevented    |
| Write Skew     | Possible         | Possible       | Possible        | Prevented    |

\*PostgreSQL's Repeatable Read also prevents phantom reads (stricter than the SQL standard minimum).

### Worked Example

Write skew under Repeatable Read vs Serializable -- the on-call scheduling problem:

```sql
-- Setup
CREATE TABLE doctors (
  name TEXT PRIMARY KEY,
  on_call BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO doctors VALUES ('Alice', true), ('Bob', true);

-- Under REPEATABLE READ: both transactions succeed (write skew)
-- Session A
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT COUNT(*) FROM doctors WHERE on_call = true;  -- 2
UPDATE doctors SET on_call = false WHERE name = 'Alice';
COMMIT;  -- succeeds

-- Session B (concurrent)
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT COUNT(*) FROM doctors WHERE on_call = true;  -- 2 (snapshot)
UPDATE doctors SET on_call = false WHERE name = 'Bob';
COMMIT;  -- succeeds -- nobody on-call!

-- Under SERIALIZABLE: one transaction aborts
-- Session A
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT COUNT(*) FROM doctors WHERE on_call = true;  -- 2
UPDATE doctors SET on_call = false WHERE name = 'Alice';
COMMIT;  -- succeeds

-- Session B (concurrent)
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT COUNT(*) FROM doctors WHERE on_call = true;  -- 2
UPDATE doctors SET on_call = false WHERE name = 'Bob';
COMMIT;  -- ERROR: could not serialize access
```

### Anti-Patterns

1. **Ignoring non-repeatable reads in Read Committed.** Reading a value, doing computation, then using it for a write without rechecking. The value may have changed between the SELECT and the UPDATE. Use `SELECT FOR UPDATE` or a higher isolation level.

2. **Believing Repeatable Read prevents all anomalies.** Write skew is still possible in PostgreSQL Repeatable Read. If your transaction reads data that influences a write to different rows, Repeatable Read is not sufficient.

3. **Using SELECT then INSERT without protection.** Classic TOCTOU (time-of-check-time-of-use) race: check if a username exists, then insert. Between the check and insert, another transaction can insert the same username. Use unique constraints, `SELECT FOR UPDATE`, or Serializable isolation.

### PostgreSQL Specifics

- PostgreSQL prevents dirty reads at all levels, even Read Uncommitted
- PostgreSQL Repeatable Read also prevents phantom reads (stricter than SQL standard)
- The phenomena matrix for PostgreSQL differs from the SQL standard minimum guarantees
- `SET TRANSACTION READ ONLY` with Serializable gives a deferrable snapshot that never aborts
- Monitor hot rows with `pg_stat_user_tables.n_tup_hot_updated` as a signal for non-repeatable read risk

## Details

### Advanced Topics

**Read-only transactions:** `SET TRANSACTION READ ONLY, DEFERRABLE` under Serializable gives a snapshot that never needs to abort for serialization failures. Ideal for reporting queries that must see a consistent snapshot without retry logic overhead.

**Detecting phenomena in production:** Non-repeatable reads are difficult to observe directly. Look for symptoms: inconsistent aggregations, business logic that produces impossible states, and constraint violations that appear intermittently under load.

### Engine Differences

MySQL InnoDB uses **gap locking** to prevent phantom reads under Repeatable Read -- a fundamentally different mechanism than PostgreSQL's MVCC snapshots. Gap locks block concurrent inserts into index ranges, which can cause unexpected blocking and even deadlocks.

MySQL does not support SSI. Its Serializable level uses shared read locks on all SELECT statements, which prevents write skew by blocking concurrent modifications but significantly reduces throughput compared to PostgreSQL's optimistic SSI approach.

### Real-World Case Studies

An inventory system allowed concurrent orders. Two customers each checked that stock > 0 for the last item, then both placed orders. Under Repeatable Read, both transactions saw stock = 1, both decremented to 0, resulting in stock = -1. This write skew was invisible at Repeatable Read because each transaction wrote to a different row (the order table) based on reading a shared row (inventory). The fix was either Serializable isolation for the checkout flow or an explicit `SELECT stock FROM inventory WHERE product_id = $1 FOR UPDATE` to serialize access to the inventory row.

## Source

- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- Berenson, H. et al. "A Critique of ANSI SQL Isolation Levels" (SIGMOD 1995)

## Process

1. Identify which read phenomenon is causing the data inconsistency in your system.
2. Consult the phenomena matrix to determine the minimum isolation level that prevents it.
3. Implement the isolation level change with appropriate retry logic, or use explicit locking if upgrading isolation is too expensive.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-isolation-levels, db-isolation-selection, db-acid-properties, db-mvcc, db-optimistic-locking, prisma-transactions, drizzle-transactions

## Success Criteria

- Developers identify which read phenomenon causes their concurrency bug
- The minimum isolation level that prevents the identified phenomenon is chosen
- Write skew scenarios are recognized and addressed with Serializable or explicit locking
