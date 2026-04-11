# Third Normal Form (3NF)

> "Every non-key attribute must provide a fact about the key, the whole key, and nothing but the key." -- Codd's memorable definition of full normalization through 3NF.

## When to Use

- Removing redundant data that survives after 2NF decomposition
- Fixing update anomalies caused by transitive dependencies
- Deciding whether 3NF or BCNF is the right target for your schema
- Extracting lookup tables from columns that depend on other non-key columns
- Auditing OLTP schemas for over- or under-normalization

## Instructions

Third Normal Form builds on Second Normal Form. A table is in 3NF when it is in 2NF and no non-key column depends on another non-key column -- eliminating transitive dependencies.

### Transitive Dependency

A transitive dependency exists when: `A -> B -> C`, where A is the primary key, B is a non-key column, and C is another non-key column that depends on B rather than directly on A.

### Worked Example 1: Employees with Department Data

**BAD -- transitive dependency through department_id:**

```sql
CREATE TABLE employees (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  department_id     INT NOT NULL,
  department_name   TEXT NOT NULL,     -- depends on department_id, not employee id
  department_budget NUMERIC(12,2)      -- depends on department_id, not employee id
);
```

The dependency chain is: `employee_id -> department_id -> department_name, department_budget`. Changing a department's name requires updating every employee row in that department.

**GOOD -- extract the transitively dependent columns:**

```sql
CREATE TABLE departments (
  id     INT PRIMARY KEY,
  name   TEXT NOT NULL,
  budget NUMERIC(12,2) NOT NULL CHECK (budget >= 0)
);

CREATE TABLE employees (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  department_id INT NOT NULL REFERENCES departments(id)
);
```

Now department data lives in one place. Changing a department name is a single-row update.

### Worked Example 2: Orders with Customer Data

**BAD -- customer details embedded in orders:**

```sql
CREATE TABLE orders (
  id             SERIAL PRIMARY KEY,
  order_date     DATE NOT NULL,
  customer_id    INT NOT NULL,
  customer_name  TEXT NOT NULL,      -- depends on customer_id
  customer_email TEXT NOT NULL,      -- depends on customer_id
  total          NUMERIC(10,2)
);
```

**GOOD -- customers extracted:**

```sql
CREATE TABLE customers (
  id    INT PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  order_date  DATE NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id),
  total       NUMERIC(10,2) NOT NULL
);
```

### When 3NF Is Sufficient

For most OLTP applications, 3NF is the target. Higher normal forms (BCNF, 4NF, 5NF) solve edge cases that rarely appear in practice:

- **BCNF** eliminates all redundancy from candidate key overlap. It differs from 3NF only when a table has multiple overlapping candidate keys -- uncommon in typical application schemas.
- **4NF and 5NF** address multi-valued and join dependencies -- corner cases that arise in highly specialized data models.

**The practical heuristic:** Normalize to 3NF during initial design. Only go to BCNF if you encounter a specific anomaly that 3NF does not resolve. Most developers never need beyond 3NF.

### BCNF Comparison

3NF allows some redundancy when a non-key attribute is part of a candidate key. BCNF eliminates it completely, but can make some queries impossible without additional joins.

```sql
-- 3NF allows this (student_id, course_id -> instructor, but instructor -> course_id)
-- BCNF would require further decomposition
CREATE TABLE teaching_assignments (
  student_id    INT,
  course_id     INT,
  instructor_id INT,
  PRIMARY KEY (student_id, course_id)
);
```

In practice, the BCNF decomposition here creates two tables that cannot be rejoined without loss -- a rare case where 3NF is the better practical choice.

### The Lookup Table Pattern

The most common 3NF extraction is the lookup table for status codes, country codes, and category types:

```sql
-- Before: status as a string repeated in every row
-- orders.status = 'pending', 'shipped', 'delivered', 'cancelled'

-- After: lookup table with referential integrity
CREATE TABLE order_statuses (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE orders (
  id        SERIAL PRIMARY KEY,
  status_id INT NOT NULL REFERENCES order_statuses(id),
  total     NUMERIC(10,2)
);
```

### Anti-Patterns

1. **Over-normalizing lookup data that never changes independently.** Boolean-like values (`is_active`) or binary states (`enabled/disabled`) do not need a lookup table. A `BOOLEAN` column or a `CHECK` constraint is simpler and equally correct.

2. **Single-column lookup tables for trivial enums.** If the lookup table has only an `id` and a `name` column, and the values are a small fixed set, consider using PostgreSQL's `ENUM` type or a `CHECK` constraint instead:

```sql
-- Simpler than a lookup table for a fixed set
CREATE TABLE orders (
  id     SERIAL PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled'))
);
```

3. **Ignoring transitive dependencies because "the JOIN is slow."** Fix the query plan, do not denormalize during initial design. Denormalization is a performance optimization applied after measurement, not a shortcut during schema design.

### PostgreSQL Specifics

PostgreSQL's `ENUM` type provides a middle ground between a CHECK constraint and a lookup table:

```sql
CREATE TYPE order_status AS ENUM ('pending', 'shipped', 'delivered', 'cancelled');

CREATE TABLE orders (
  id     SERIAL PRIMARY KEY,
  status order_status NOT NULL DEFAULT 'pending'
);
```

ENUMs are stored as integers internally (fast) but display as strings (readable). The tradeoff: adding values requires `ALTER TYPE ... ADD VALUE`, which cannot be rolled back in a transaction before PostgreSQL 12.

## Details

### OLTP vs OLAP Tradeoff

3NF is ideal for OLTP (transactional) workloads where data integrity and write efficiency matter. For OLAP (analytical) workloads, denormalized star schemas or materialized views are typically more appropriate because they optimize for read-heavy aggregate queries rather than write correctness.

### Identifying Transitive Dependencies

For each non-key column, ask: "Does this column depend on the primary key directly, or does it depend on another non-key column that in turn depends on the key?"

Systematic approach:

1. List all non-key columns.
2. For each pair of non-key columns (A, B), ask: "If I know A, can I determine B without knowing the primary key?"
3. If yes, B transitively depends on the key through A. Extract A and B into a new table with A as the key.

### MySQL Callout

MySQL does not support PostgreSQL-style `ENUM` modifications as easily. Adding values to a MySQL `ENUM` requires an `ALTER TABLE` that may lock the table for the duration of the change on large tables. For evolving value sets, a lookup table is safer in MySQL than an ENUM.

### Real-World Case Study: Multi-Tenant SaaS Platform

A project management SaaS stored `organization_name`, `organization_plan`, and `organization_max_users` on every `project` row. With 500 organizations averaging 200 projects each, changing an organization's plan required updating 200 rows. After extracting `organizations` as a separate table, plan upgrades became instant single-row updates, and a billing audit query that previously scanned 100K project rows to count plans by type could instead scan 500 organization rows.

## Source

- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- Codd, E.F. "Further Normalization of the Data Base Relational Model" (1971)
- Kent, W. "A Simple Guide to Five Normal Forms in Relational Database Theory" (1983)

## Process

1. Read the transitive dependency rules and examples in this document.
2. For each table in 2NF, check whether any non-key column depends on another non-key column rather than directly on the primary key.
3. Extract transitively dependent column groups into their own tables with appropriate foreign key references.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-first-normal-form, db-second-normal-form, db-denormalization

## Success Criteria

- All transitive dependencies in the schema have been identified and eliminated by extracting them into separate tables.
- The lookup table pattern is applied where appropriate, without over-normalizing trivial values.
