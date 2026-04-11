# ACID Properties

> ACID guarantees that database transactions are processed reliably: each transaction is all-or-nothing (Atomic), leaves the database in a valid state (Consistent), operates as if no other transactions are running (Isolated), and once committed, persists even through crashes (Durable).

## When to Use

- Designing transactional workflows (payments, inventory, user registration)
- Evaluating database selection for a new project
- Debugging data inconsistencies or corruption after failures
- Understanding failure modes in concurrent systems
- Deciding between database-level and application-level constraints

## Instructions

### Atomicity

A transaction is all-or-nothing. Either every statement succeeds and is committed, or none of them take effect.

**Worked Example -- bank transfer:**

```sql
BEGIN;

UPDATE accounts SET balance = balance - 100.00
  WHERE id = 1;

UPDATE accounts SET balance = balance + 100.00
  WHERE id = 2;

COMMIT;
```

If the server crashes between the two UPDATEs, PostgreSQL rolls back the entire transaction on recovery. The money neither disappears nor duplicates.

**Partial rollback with SAVEPOINTs:**

```sql
BEGIN;

INSERT INTO orders (customer_id, total) VALUES (42, 250.00);

SAVEPOINT before_loyalty;

INSERT INTO loyalty_points (customer_id, points)
  VALUES (42, 25);
-- If loyalty service is down, rollback just this part
ROLLBACK TO SAVEPOINT before_loyalty;

-- Order still commits successfully
COMMIT;
```

SAVEPOINTs let you isolate optional operations within a larger atomic unit.

### Consistency

Database constraints enforce invariants. A transaction that would violate any constraint is rejected entirely.

```sql
CREATE TABLE accounts (
  id      SERIAL PRIMARY KEY,
  owner   TEXT NOT NULL,
  balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0)
);

-- This transaction fails atomically -- both statements rolled back
BEGIN;
UPDATE accounts SET balance = balance - 500.00 WHERE id = 1;  -- balance goes to -100
UPDATE accounts SET balance = balance + 500.00 WHERE id = 2;
COMMIT;
-- ERROR: new row for relation "accounts" violates check constraint "accounts_balance_check"
```

**Important distinction:** ACID consistency means the database satisfies all defined constraints after every transaction. This is different from CAP theorem consistency, which means linearizability (every read returns the most recent write across distributed nodes). They share a name but are different concepts.

### Isolation

Concurrent transactions operate as if each runs alone. PostgreSQL's default isolation level is **Read Committed** -- each statement within a transaction sees only data committed before that statement began.

**Concurrent session example:**

```
Session A                              Session B
─────────                              ─────────
BEGIN;
SELECT balance FROM accounts
  WHERE id = 1;  -- returns 400
                                       BEGIN;
                                       UPDATE accounts SET balance = 300
                                         WHERE id = 1;
                                       COMMIT;
SELECT balance FROM accounts
  WHERE id = 1;  -- returns 300 (sees B's commit)
COMMIT;
```

Under Read Committed, Session A sees Session B's committed change within the same transaction. For stricter isolation (repeatable reads, serializable), see the `db-isolation-levels` skill.

### Durability

Once `COMMIT` returns success, the data survives crashes. PostgreSQL achieves this through Write-Ahead Logging (WAL): changes are written to the WAL and fsynced to disk before `COMMIT` returns. See `db-acid-in-practice` for implementation details.

```sql
-- After this returns, the data is on disk regardless of what happens next
INSERT INTO audit_log (event, timestamp) VALUES ('payment_processed', NOW());
-- COMMIT is implicit in autocommit mode
```

### Worked Example: User Registration with Balance

```sql
BEGIN;

-- Create user account
INSERT INTO users (email, name) VALUES ('alice@example.com', 'Alice')
  RETURNING id INTO user_id;

-- Create financial account with opening balance
INSERT INTO accounts (user_id, balance) VALUES (user_id, 0.00);

-- Record the registration event
INSERT INTO audit_log (user_id, event) VALUES (user_id, 'registered');

COMMIT;
```

Atomicity ensures all three inserts succeed or none do. Consistency ensures the CHECK constraints hold. Isolation ensures concurrent registrations do not interfere. Durability ensures the registration persists.

### Anti-Patterns

1. **Auto-commit mode for multi-statement operations.** Without an explicit `BEGIN`, each statement is its own transaction. Two related INSERTs can partially succeed, leaving the database in an inconsistent state that no constraint can prevent.

2. **Assuming ACID means "no bugs."** ACID guarantees transaction correctness at the database level. It does not prevent application-level logic errors like transferring money to a wrong account or double-processing an idempotent operation.

3. **Relying on application code for invariants that belong in constraints.** If `balance >= 0` is a business rule, put it in a `CHECK` constraint. Application code can have bugs; database constraints cannot be bypassed by any client.

4. **Long-running transactions.** Holding a transaction open for minutes (or hours) blocks row cleanup, bloats the WAL, and increases lock contention. Keep transactions short and focused.

## Details

### What ACID Does NOT Guarantee

- **Application-level invariants beyond CHECK constraints.** ACID does not know your business rules unless you encode them as constraints or triggers.
- **Cross-database consistency.** If your system writes to PostgreSQL and Redis in the same operation, ACID covers only the PostgreSQL portion.
- **Network partition handling.** ACID is a single-node guarantee. For distributed consistency, see `db-cap-theorem`.

### Failure Modes Per Property

| Property    | Failure Mode                               | Symptom                             |
| ----------- | ------------------------------------------ | ----------------------------------- |
| Atomicity   | Partial commit (should never happen in PG) | Half-completed operation in data    |
| Consistency | Constraint not defined                     | Invalid data accepted silently      |
| Isolation   | Wrong isolation level chosen               | Phantom reads, non-repeatable reads |
| Durability  | fsync disabled or hardware failure         | Committed data lost after crash     |

### MySQL Callout

MySQL's storage engine determines ACID compliance:

- **InnoDB** (default since MySQL 5.5): Full ACID support with row-level locking and crash recovery.
- **MyISAM**: No transaction support, no crash recovery, no foreign keys. Data corruption is common after unclean shutdowns. Never use MyISAM for transactional data.

Always verify `SHOW ENGINES;` and confirm your tables use InnoDB: `SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'your_db';`

### Real-World Case Study: Payment Processing

An e-commerce platform processed payments without explicit transactions. The flow was: (1) deduct inventory, (2) charge payment, (3) create order record. When the payment API timed out between steps 1 and 3, inventory was decremented but no order existed -- "ghost deductions" that required manual reconciliation. Wrapping all three steps in a single transaction with a SAVEPOINT before the payment call eliminated the inconsistency. Failed payments now roll back cleanly.

## Source

- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- Gray, J. & Reuter, A. "Transaction Processing: Concepts and Techniques" (1993)
- Bernstein, P.A. & Newcomer, E. "Principles of Transaction Processing" (2009)

## Process

1. Read the ACID property definitions and examples in this document.
2. Apply transaction boundaries to your operations, ensuring related statements are grouped in explicit `BEGIN`/`COMMIT` blocks.
3. Verify constraints are defined at the database level for all business invariants, and test failure scenarios (rollback, crash recovery).

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-acid-in-practice, db-cap-theorem, db-eventual-consistency

## Success Criteria

- All multi-statement operations use explicit transactions with proper `BEGIN`/`COMMIT` boundaries.
- Business invariants are enforced through database constraints, not solely through application code.
