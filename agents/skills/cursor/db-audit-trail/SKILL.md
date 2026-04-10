# Audit Trail

> Recording who changed what, when, and why, using trigger-based or application-level change tracking with immutable append-only logs.

## When to Use

- Regulatory compliance (SOX, HIPAA, GDPR right-to-know)
- Security audit requirements -- tracking privileged access and data modifications
- Debugging production data issues ("who changed this row and when?")
- Undo/rollback functionality at the application level
- Change approval workflows that require before/after comparison

## Instructions

### Key Concepts

Two approaches to change tracking:

**1. Trigger-based audit:**

Database triggers fire on every INSERT/UPDATE/DELETE and write to an audit table automatically. Advantages: catches all changes including raw SQL, migrations, and admin console queries. Disadvantages: tight coupling to schema, performance overhead on high-write tables, cannot capture application context (which user, which API endpoint).

**2. Application-level audit:**

Application code writes audit records before or after data changes. Advantages: captures business context (user ID, request ID, reason for change), can be asynchronous. Disadvantages: bypassable by raw SQL or migrations, requires discipline in every write path.

**Audit table schema:**

```sql
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  table_name  varchar NOT NULL,
  record_id   varchar NOT NULL,
  action      varchar NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values  jsonb,
  new_values  jsonb,
  changed_by  varchar,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  context     jsonb
);

CREATE INDEX idx_audit_table_record ON audit_log (table_name, record_id, changed_at);
```

**Immutability enforcement** -- the audit table must never allow UPDATE or DELETE:

```sql
CREATE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;
```

Alternatively, use row-level security policies to prevent modifications by all roles except a dedicated audit reader role.

### Worked Example

Financial transactions table with trigger-based audit:

**1. Generic audit trigger function:**

```sql
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', to_jsonb(NEW),
            current_setting('app.current_user', true));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
            current_setting('app.current_user', true));
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_values, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', to_jsonb(OLD),
            current_setting('app.current_user', true));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

**2. Attach trigger to the transactions table:**

```sql
CREATE TRIGGER audit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

**3. Performing an update and viewing the audit record:**

```sql
-- Set application context before the transaction
SET LOCAL app.current_user = 'user_42';
SET LOCAL app.request_id = 'req_abc123';

UPDATE transactions SET amount = 150.00 WHERE id = 1;
```

**4. Querying the audit trail:**

```sql
SELECT action, old_values->>'amount' AS old_amount,
       new_values->>'amount' AS new_amount, changed_by, changed_at
FROM audit_log
WHERE table_name = 'transactions' AND record_id = '1'
ORDER BY changed_at;
```

Returns the full change history: who changed the amount, from what value, to what value, and when.

### Anti-Patterns

1. **Mutable audit logs.** If UPDATE or DELETE is allowed on the audit table, the audit trail can be tampered with. Enforce immutability with rules, triggers, or row-level security.
2. **Storing only new values without old values.** Without the old values, you cannot determine what changed -- only what the current state is.
3. **Per-table audit tables.** Creating `transactions_audit`, `accounts_audit`, `users_audit` leads to schema explosion. Use a single generic audit table with `table_name` and JSONB values.
4. **Synchronous audit writes on hot paths.** If the audited table handles thousands of writes per second, the synchronous trigger adds latency. Consider asynchronous CDC for high-throughput tables.
5. **Not partitioning the audit table.** Audit tables grow unbounded. Without time-based partitioning, queries slow down and storage becomes unmanageable.

### PostgreSQL Specifics

**hstore for row diffs** -- compute only changed columns:

```sql
CREATE EXTENSION hstore;

-- In the trigger function, log only changed fields:
INSERT INTO audit_log (table_name, record_id, action, old_values, new_values)
VALUES (
  TG_TABLE_NAME, NEW.id::text, 'UPDATE',
  to_jsonb(hstore(OLD) - hstore(NEW)),  -- removed/changed fields
  to_jsonb(hstore(NEW) - hstore(OLD))   -- new/changed fields
);
```

This stores only the diff, dramatically reducing audit log storage for tables with many columns where most updates touch only 1-2 fields.

**pg_audit extension** for statement-level audit logging -- records which SQL statements were executed and by which database role. Complementary to row-level audit triggers.

**Passing application context to triggers:**

```sql
-- In the application, before each transaction:
SET LOCAL app.current_user = 'user_42';
SET LOCAL app.request_id = 'req_abc123';

-- In the trigger, read the context:
current_setting('app.current_user', true)  -- true = return NULL if not set
```

`SET LOCAL` scopes the setting to the current transaction. This bridges the gap between application context and database triggers.

## Details

### Advanced Topics

**Change Data Capture (CDC)** with logical replication avoids trigger overhead entirely:

- PostgreSQL's logical replication (`pgoutput` plugin) streams row changes to consumers
- Debezium connects to PostgreSQL's replication slot and publishes changes to Kafka
- CDC captures all changes (including raw SQL) without trigger performance penalty
- Tradeoff: CDC is asynchronous -- there is a lag between the change and the audit record

**Event sourcing** (see microservices-event-sourcing) is an audit-native architecture where the event log IS the source of truth. Rather than auditing a mutable table, every state change is an immutable event. Consider event sourcing when audit is a primary requirement, not an afterthought.

**Audit log partitioning** by month with automated retention:

```sql
CREATE TABLE audit_log (
  -- columns as above
) PARTITION BY RANGE (changed_at);

-- Create monthly partitions, drop after retention period
-- Use pg_partman for automation
```

**JSONB diff computation** for efficient storage:

```sql
-- Store only changed fields instead of entire row snapshots
-- Reduces audit storage by 80-90% for wide tables
```

### Engine Differences

MySQL triggers use `OLD` and `NEW` row references similar to PostgreSQL:

```sql
CREATE TRIGGER audit_transactions
AFTER UPDATE ON transactions
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_values, new_values)
  VALUES ('transactions', OLD.id, 'UPDATE',
          JSON_OBJECT('amount', OLD.amount), JSON_OBJECT('amount', NEW.amount));
END;
```

MySQL lacks `hstore` -- use `JSON_OBJECT()` to serialize row values to JSON.

MySQL does not support `CREATE RULE` for immutability. Enforce with a BEFORE trigger:

```sql
CREATE TRIGGER prevent_audit_delete
BEFORE DELETE ON audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log rows cannot be deleted';
```

MySQL binlog serves as a CDC source -- the Debezium MySQL connector reads binlog events for change data capture.

MySQL lacks `SET LOCAL` for passing application context to triggers. Use session variables (`SET @app_user = 'user_42'`) and read them in the trigger, but note these persist for the entire session, not just the current transaction.

### Real-World Case Studies

**Fintech platform with SOX compliance.** All changes to `accounts`, `transactions`, and `users` tables tracked via the generic trigger function. Audit table partitioned by month, retained for 7 years (regulatory requirement). Volume: 50M audit rows per month. Query pattern: "all changes to account X in last 90 days" completes in 15ms using the composite index on `(table_name, record_id, changed_at)` with partition pruning. Application context (request_id, user_id, IP address) passed via `SET LOCAL` before each transaction, stored in the audit `context` JSONB column. During a SOX audit, the team reconstructed the complete state of an account at any point in the past 7 years by replaying the audit log.

## Source

- [PostgreSQL PL/pgSQL Triggers](https://www.postgresql.org/docs/current/plpgsql-trigger.html)
- [pgAudit Extension](https://www.pgaudit.org/)

## Process

1. Read the key concepts to understand trigger-based vs application-level audit and the tradeoffs.
2. Apply the appropriate audit strategy based on compliance requirements and write throughput.
3. Verify that the audit table is immutable, captures both old and new values, and is partitioned by time.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-temporal-data, db-time-series, db-denormalization, microservices-event-sourcing

## Success Criteria

- Audit table is immutable -- UPDATE and DELETE are blocked via rules, triggers, or RLS.
- Both old and new values are captured for UPDATE operations.
- Audit table is partitioned by time with a defined retention policy.
- Application context (user, request ID) is recorded in audit entries.
