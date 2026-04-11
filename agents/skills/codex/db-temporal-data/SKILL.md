# Temporal Data

> Modeling when facts are true (valid-time), when they were recorded (transaction-time), or both (bitemporal), enabling time-travel queries and regulatory audit.

## When to Use

- Insurance policies with effective dates that change over time
- Price histories where "what was the price on date X?" is a query requirement
- Employee role and salary changes tracked for HR reporting
- Regulatory requirements to reconstruct past states (financial compliance, audit)
- Any domain where historical accuracy matters and overwrites destroy information

## Instructions

### Key Concepts

Three temporal dimensions:

**1. Valid-time (application time):** When the fact is true in the real world. An employee salary might be effective 2024-01-01 to 2024-12-31. The database might record this fact on 2023-12-15 -- the valid time and the recording time differ.

**2. Transaction-time (system time):** When the row was stored in the database. Columns like `recorded_at` and `superseded_at` track the database's knowledge. Transaction-time columns are never manually edited -- the system manages them.

**3. Bitemporal:** Both dimensions combined. Answers questions like "what did the system believe was true about time T, as of database time S?" Essential for late-arriving corrections in financial systems.

**Slowly Changing Dimensions (SCD) types:**

| Type   | Strategy                 | History? |
| ------ | ------------------------ | -------- |
| Type 1 | Overwrite the row        | No       |
| Type 2 | New row with date range  | Yes      |
| Type 3 | Previous/current columns | Partial  |
| Type 6 | Hybrid (Type 1 + 2 + 3)  | Yes      |

SCD Type 2 is the most common for temporal data. In PostgreSQL, use range types:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE employee_salaries (
  id          serial PRIMARY KEY,
  employee_id int NOT NULL,
  salary      numeric(10,2) NOT NULL,
  valid_range tstzrange NOT NULL,
  EXCLUDE USING gist (
    employee_id WITH =,
    valid_range WITH &&
  )
);
```

The **exclusion constraint** prevents overlapping valid periods for the same employee -- the database enforces temporal integrity, not the application.

### Worked Example

Insurance policy pricing with valid-time tracking:

```sql
-- Initial price: $500/month effective Jan 1 to Dec 31
INSERT INTO policy_prices (policy_id, monthly_rate, valid_range)
VALUES (101, 500.00, '[2024-01-01, 2025-01-01)');

-- Price change mid-year: close the old range, insert new
UPDATE policy_prices
SET valid_range = '[2024-01-01, 2024-07-01)'
WHERE policy_id = 101 AND valid_range @> '2024-06-15'::timestamptz;

INSERT INTO policy_prices (policy_id, monthly_rate, valid_range)
VALUES (101, 550.00, '[2024-07-01, 2025-01-01)');
```

**Point-in-time query -- "what was the price on June 15?":**

```sql
SELECT monthly_rate FROM policy_prices
WHERE policy_id = 101
  AND valid_range @> '2024-06-15'::timestamptz;
-- Returns: 500.00
```

**Bitemporal query -- "what did we think the price was on June 15, before the July correction?":**

```sql
SELECT monthly_rate FROM policy_prices
WHERE policy_id = 101
  AND valid_range @> '2024-06-15'::timestamptz
  AND recorded_at < '2024-07-01'::timestamptz;
```

This is essential when auditors need to reconstruct what the system reported at a specific point in database history.

### Anti-Patterns

1. **Using `updated_at` as a substitute for temporal modeling.** `updated_at` only records the last change -- all history is lost. It cannot answer "what was true at time T?"
2. **Overlapping valid periods without exclusion constraints.** Two rows claiming the same employee had different salaries on the same date is corrupt data. Use exclusion constraints.
3. **Managing two timestamp columns manually instead of range types.** Separate `valid_from` and `valid_to` columns require application-level overlap checks. Range types with exclusion constraints push this to the database.
4. **Using SCD Type 1 (overwrite) when audit trail is required.** Overwriting destroys evidence. Use Type 2 or a separate audit table.
5. **NULL for "current" end date.** Use range type upper-bound infinity instead: `'[2024-07-01,)'` -- the open upper bound means "still current" and works correctly with range operators.

### PostgreSQL Specifics

**Range types** (`tstzrange`, `daterange`) provide built-in temporal operators:

- `@>` -- contains a timestamp: `valid_range @> '2024-06-15'::timestamptz`
- `&&` -- overlaps another range: `range1 && range2`
- `-|-` -- adjacent ranges: `range1 -|- range2`

**GiST index** for range columns:

```sql
CREATE INDEX idx_prices_valid ON policy_prices USING gist (valid_range);
```

**Exclusion constraints** require the `btree_gist` extension:

```sql
CREATE EXTENSION btree_gist;

-- Prevents overlapping valid periods for the same policy
EXCLUDE USING gist (policy_id WITH =, valid_range WITH &&)
```

**SQL:2011 temporal support** is partially implemented in PostgreSQL. System-versioned tables are not yet native -- use triggers or the `temporal_tables` extension to approximate transaction-time tracking.

## Details

### Advanced Topics

**SQL:2011 standard temporal syntax** (`FOR SYSTEM_TIME AS OF`) is supported in MariaDB and SQL Server but not yet in PostgreSQL. PostgreSQL approximates this with view-based patterns or the `temporal_tables` extension.

**Gap detection** in temporal data -- finding periods with no valid record:

```sql
SELECT upper(a.valid_range) AS gap_start, lower(b.valid_range) AS gap_end
FROM policy_prices a
JOIN policy_prices b ON a.policy_id = b.policy_id
  AND upper(a.valid_range) < lower(b.valid_range)
WHERE NOT EXISTS (
  SELECT 1 FROM policy_prices c
  WHERE c.policy_id = a.policy_id
    AND c.valid_range && tstzrange(upper(a.valid_range), lower(b.valid_range))
);
```

**Temporal joins** for combining two temporal tables:

```sql
SELECT e.name, s.salary, d.department_name
FROM employees e
JOIN employee_salaries s ON e.id = s.employee_id
JOIN employee_departments d ON e.id = d.employee_id
  AND s.valid_range && d.valid_range;
```

**Partitioning temporal tables** by `valid_from` enables archival of old time periods and efficient pruning of historical queries.

### Engine Differences

MySQL lacks range types and exclusion constraints entirely. Temporal data in MySQL requires:

- Separate `valid_from DATETIME` and `valid_to DATETIME` columns
- Application-level overlap prevention (no database-enforced exclusion)
- Manual NULL handling for "current" records (no range infinity)

MySQL 8.0 does not support SQL:2011 temporal tables.

**MariaDB 10.3+** is the notable exception -- it supports system-versioned tables (`WITH SYSTEM VERSIONING`), making it the only major open-source engine with native transaction-time temporal support. MariaDB's temporal tables automatically track row history without triggers.

### Real-World Case Studies

**Financial compliance system tracking 10M account balances.** Regulators require reconstructing the account balance at any historical date. SCD Type 2 implementation using `tstzrange` with GiST index on `(account_id, valid_range)`. Point-in-time queries ("what was balance on date X?") complete in 3ms. After an audit discovered late-arriving corrections (a deposit backdated to last month), the team added bitemporal columns to track both valid-time and transaction-time. This enabled the query "what did we report the balance was on March 15, before the April 2 correction?" -- critical for regulatory reconciliation.

## Source

- [PostgreSQL Range Types](https://www.postgresql.org/docs/current/rangetypes.html)
- [Snodgrass -- Developing Time-Oriented Database Applications](https://www2.cs.arizona.edu/~rts/tdbbook.pdf)

## Process

1. Read the key concepts to understand the three temporal dimensions and SCD types.
2. Apply the correct temporal strategy based on whether you need valid-time, transaction-time, or bitemporal tracking.
3. Verify that range types with exclusion constraints prevent overlapping periods and that point-in-time queries return correct results.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-audit-trail, db-time-series, db-denormalization, microservices-event-sourcing

## Success Criteria

- Temporal tables use range types with exclusion constraints (not manual timestamp pairs).
- SCD type is chosen based on business requirements (Type 2 for full history, Type 1 only when history is not needed).
- Point-in-time queries are verified to return correct results.
- GiST indexes are present on range columns.
