# Isolation Level Selection

> Selecting the right isolation level requires matching the workload's correctness requirements against the performance cost and retry complexity of stricter levels.

## When to Use

- Starting a new feature with transaction requirements
- Optimizing transaction throughput by downgrading unnecessarily strict isolation
- Debugging serialization failures that seem unnecessary
- Deciding between isolation level upgrades and application-level locking
- Reviewing transaction design during code review

## Instructions

### Key Concepts

**Decision Framework**

**1. Read Committed (default -- use for most workloads)**

CRUD operations, form submissions, content management. Low overhead, no retry logic needed. Works for 90% of web application transactions. Only unsafe when business logic depends on re-reading the same rows within a transaction.

**2. Repeatable Read**

Reporting queries that must see a consistent snapshot, balance calculations, read-heavy analytics within a transaction. Adds the cost of potential serialization failures on write conflicts. Requires retry logic.

**3. Serializable**

Financial transfers, inventory management with complex constraints, any workflow where write skew would violate business invariants. Requires retry logic for every transaction. Expect ~5-15% throughput reduction.

**4. Alternative: Explicit Locking**

`SELECT FOR UPDATE` within Read Committed can prevent specific races without the full overhead of Serializable. See `db-pessimistic-locking`. Preferred when only a few rows need protection.

**Decision Table**

| Workload Type       | Recommended Level | Retry Required | Notes                        |
| ------------------- | ----------------- | -------------- | ---------------------------- |
| Simple CRUD         | Read Committed    | No             | Default, sufficient for most |
| Form submit / save  | Read Committed    | No             | Single write, no re-reads    |
| Report / analytics  | Repeatable Read   | Yes            | Consistent snapshot needed   |
| Balance calculation | Repeatable Read   | Yes            | Must see consistent totals   |
| Financial transfer  | Serializable      | Yes            | Write skew would lose money  |
| Inventory decrement | RC + FOR UPDATE   | No             | Targeted lock, less overhead |
| Queue processing    | RC + SKIP LOCKED  | No             | See db-pessimistic-locking   |

### Worked Example

E-commerce checkout -- comparing two approaches for preventing overselling:

**Approach A: Serializable Isolation**

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;

SELECT stock FROM products WHERE id = 42;  -- returns 3
-- Application logic: verify stock >= requested quantity

UPDATE products SET stock = stock - 1 WHERE id = 42;
INSERT INTO orders (product_id, quantity) VALUES (42, 1);

COMMIT;
-- May raise: ERROR: could not serialize access
-- Application must retry entire transaction
```

**Approach B: Read Committed with SELECT FOR UPDATE**

```sql
BEGIN;  -- Read Committed (default)

SELECT stock FROM products WHERE id = 42 FOR UPDATE;  -- returns 3, row locked
-- Other transactions block here until we commit

UPDATE products SET stock = stock - 1 WHERE id = 42;
INSERT INTO orders (product_id, quantity) VALUES (42, 1);

COMMIT;
-- No serialization error possible -- lock prevents conflict
```

**Trade-off analysis:** Approach B is preferred for this workload. The lock targets only the inventory row, other products are unaffected. Approach A applies serializable checking to the entire transaction including the orders insert, which is unnecessary overhead. Approach B also eliminates the need for retry logic.

### Anti-Patterns

1. **Setting Serializable as the database default.** All transactions pay the serialization cost, even simple reads. Set isolation per-transaction where needed instead.

2. **Choosing isolation level per-table instead of per-transaction.** Isolation applies to the entire transaction, not individual tables or queries. There is no way to use Serializable for one table and Read Committed for another within the same transaction.

3. **Upgrading isolation to "fix bugs" without understanding the root cause.** The bug may be in application logic, not a concurrency anomaly. Diagnose first using `db-read-phenomena` before changing isolation levels.

4. **No retry loop for Repeatable Read or Serializable.** These levels raise serialization errors by design. The application must catch `SQLSTATE 40001` and retry the entire transaction with exponential backoff.

### PostgreSQL Specifics

- Set session default: `SET default_transaction_isolation = 'read committed';`
- Per-transaction override: `BEGIN ISOLATION LEVEL SERIALIZABLE;`
- Prevent snapshot-holding: `idle_in_transaction_session_timeout = '30s'` kills idle transactions
- Monitor serialization failures: `pg_stat_database.conflicts` and application-level error counters
- Read-only Serializable with `DEFERRABLE`: zero-abort reporting queries

## Details

### Advanced Topics

**Retry loop pattern:**

```sql
-- Pseudocode for serializable retry
max_retries = 3
for attempt in range(max_retries):
    try:
        BEGIN ISOLATION LEVEL SERIALIZABLE;
        -- ... transaction logic ...
        COMMIT;
        break  -- success
    except SerializationFailure:
        -- SQLSTATE 40001
        ROLLBACK;
        sleep(random_backoff(attempt))  -- jitter: 10ms * 2^attempt
else:
    raise TooManyRetries()
```

**Read-only Serializable with DEFERRABLE:** For reporting queries that need a consistent snapshot without any risk of abort, use `BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE;`. PostgreSQL may delay the start slightly to find a safe snapshot, but the transaction will never abort.

**Connection pool implications:** Transaction-level isolation means the pool must not reuse connections mid-transaction. Configure pool to use transaction-level pooling (e.g., PgBouncer `pool_mode = transaction`), and ensure isolation level is set within the transaction, not at the session level.

### Engine Differences

MySQL defaults to **Repeatable Read**, so applications migrating from MySQL to PostgreSQL may experience different behavior at the default isolation level. MySQL's gap locking provides some phantom protection that PostgreSQL handles differently via MVCC.

MySQL **Serializable** uses shared locks on all SELECT statements (pessimistic, blocking). PostgreSQL SSI is optimistic (abort-on-conflict, no blocking). This means MySQL Serializable has lower throughput but fewer retries, while PostgreSQL Serializable has higher throughput but requires retry logic.

### Real-World Case Studies

A SaaS platform ran all transactions at Serializable, experiencing a 15% serialization failure rate during peak hours. Profiling showed 80% of transactions were simple CRUD (user profile updates, content edits) that only needed Read Committed. Selectively downgrading CRUD transactions to Read Committed while keeping Serializable for billing and subscription workflows reduced the failure rate from 15% to 0.3% and improved p99 latency by 40%.

## Source

- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- Kleppmann, M. "Designing Data-Intensive Applications" (2017), Chapter 7

## Process

1. Identify the correctness requirements: which read phenomena would violate business invariants?
2. Select the minimum isolation level from the decision table, or use explicit locking for targeted protection.
3. Implement retry logic for any transaction using Repeatable Read or Serializable, and monitor serialization failure rates.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-isolation-levels, db-read-phenomena, db-acid-properties, db-optimistic-locking, db-pessimistic-locking, prisma-transactions, drizzle-transactions

## Success Criteria

- Isolation level chosen matches actual workload requirements (not over- or under-specified)
- Retry logic present for every Repeatable Read and Serializable transaction
- Serialization failure rates monitored and below acceptable thresholds
