# First Normal Form (1NF)

> Every column holds a single atomic value, no repeating groups exist, and every row is uniquely identifiable by a primary key.

## When to Use

- Designing new tables from scratch
- Reviewing an existing schema for normalization violations
- Refactoring columns that store CSV lists, JSON arrays, or delimited strings
- Migrating data from spreadsheets or flat files into a relational database
- Auditing tables that lack a primary key

## Instructions

First Normal Form defines the baseline for a well-structured relational table. A table is in 1NF when it satisfies three rules.

### Rule 1: Every Column Holds Atomic Values

Each cell must contain a single, indivisible value. No lists, no comma-separated strings, no embedded structures.

**BAD -- tags crammed into one column:**

```sql
CREATE TABLE articles (
  id       SERIAL PRIMARY KEY,
  title    TEXT NOT NULL,
  tags     TEXT  -- 'postgresql,normalization,database'
);
```

Querying "find all articles tagged postgresql" now requires `LIKE '%postgresql%'` or string splitting -- neither is indexable or correct (matches "not-postgresql" too).

**GOOD -- junction table for multi-valued relationship:**

```sql
CREATE TABLE articles (
  id    SERIAL PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE article_tags (
  article_id INT REFERENCES articles(id),
  tag_id     INT REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);
```

Now `SELECT a.title FROM articles a JOIN article_tags at ON a.id = at.article_id JOIN tags t ON at.tag_id = t.id WHERE t.name = 'postgresql';` is indexable, correct, and constraint-enforced.

### Rule 2: No Repeating Groups

Do not model a variable-length list as numbered columns.

**BAD -- phone1/phone2/phone3 pattern:**

```sql
CREATE TABLE contacts (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL,
  phone1 TEXT,
  phone2 TEXT,
  phone3 TEXT
);
```

This caps phones at three, wastes space when contacts have one, and makes queries painful (`WHERE phone1 = ? OR phone2 = ? OR phone3 = ?`).

**GOOD -- separate rows:**

```sql
CREATE TABLE contacts (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE contact_phones (
  id         SERIAL PRIMARY KEY,
  contact_id INT REFERENCES contacts(id),
  phone      TEXT NOT NULL,
  label      TEXT  -- 'mobile', 'work', 'home'
);
```

### Rule 3: Every Table Has a Primary Key

Every row must be uniquely identifiable. Without a primary key, the table is a bag of rows -- duplicates are undetectable and foreign keys cannot reference it.

```sql
CREATE TABLE products (
  id    SERIAL PRIMARY KEY,
  sku   TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0)
);
```

### Worked Example: E-Commerce Order Import

A CSV export contains: `order_id, customer, items("Widget,Gadget,Bolt"), quantities("2,1,5")`.

Step 1 -- create atomic tables:

```sql
CREATE TABLE orders (
  id       SERIAL PRIMARY KEY,
  customer TEXT NOT NULL
);

CREATE TABLE order_lines (
  id        SERIAL PRIMARY KEY,
  order_id  INT REFERENCES orders(id),
  item_name TEXT NOT NULL,
  quantity  INT NOT NULL CHECK (quantity > 0)
);
```

Step 2 -- load one row per item instead of one row per order.

### Anti-Patterns

1. **JSON arrays as a normalization shortcut.** Storing `tags jsonb DEFAULT '[]'` avoids the junction table but makes constraint enforcement, joins, and indexing harder. Reserve JSONB for genuinely schemaless data.
2. **TEXT columns for structured data.** A `metadata TEXT` column containing key-value pairs is a schema within a schema. Define real columns or use a typed JSONB column with a CHECK constraint.
3. **Missing primary keys.** Tables without a primary key invite duplicate rows and block foreign key references. Every table gets a primary key -- no exceptions.
4. **Splitting atoms too far.** Do not split a phone number into country code, area code, and subscriber number unless you query those parts independently. Atomicity is relative to your query patterns.

### PostgreSQL Specifics

PostgreSQL arrays (`TEXT[]`, `INT[]`) technically violate 1NF but are acceptable for specific use cases:

- Tag lists that are always read and written as a whole
- Full-text search vectors (`tsvector`)
- GIN-indexed containment queries (`WHERE tags @> ARRAY['postgresql']`)

When you find yourself using `unnest()` to join array elements with another table, that is the signal to normalize into a junction table instead.

### MySQL Callout

MySQL lacks native array types. 1NF violations in MySQL typically manifest as comma-separated strings parsed with `FIND_IN_SET()`. This is always wrong in production -- it defeats indexing, prevents constraint enforcement, and returns incorrect results for substring matches.

## Details

### Why 1NF Matters

- **Query correctness.** Atomic values enable exact-match queries and proper joins. Comma-separated values require pattern matching that produces false positives.
- **Indexing.** B-tree indexes work on atomic column values. You cannot efficiently index into a substring of a TEXT column.
- **Constraint enforcement.** Foreign keys, UNIQUE constraints, and CHECK constraints operate on column values. Non-atomic values bypass all of them.
- **Aggregation.** `COUNT`, `SUM`, and `GROUP BY` operate on rows. If one row contains multiple values packed into a string, aggregations are wrong without preprocessing.

### The Array Exception in PostgreSQL

PostgreSQL arrays with GIN indexes support efficient containment queries:

```sql
CREATE INDEX idx_tags ON articles USING GIN (tags);
SELECT * FROM articles WHERE tags @> ARRAY['postgresql'];
```

This is valid when: (1) you never need to join tag values to another table, (2) you never need referential integrity on tag values, and (3) the array is small and treated as an opaque unit. When any of these conditions fails, normalize.

### Real-World Case Study: Logging Platform Migration

A SaaS logging platform stored log labels as `labels TEXT` containing `"env=prod,service=api,region=us-east"`. Queries used `LIKE '%service=api%'`. After normalizing into a `log_labels(log_id, key, value)` table with a composite index on `(key, value)`, query latency dropped from 1200ms to 8ms for label-filtered searches. Storage increased 15% but query performance improved 150x.

## Source

- [PostgreSQL DDL Basics](https://www.postgresql.org/docs/current/ddl-basics.html)
- Date, C.J. "An Introduction to Database Systems" (8th Edition), Chapter 12
- Codd, E.F. "A Relational Model of Data for Large Shared Data Banks" (1970)

## Process

1. Read the rules and examples in this document.
2. Apply the three 1NF rules to your schema design, decomposing non-atomic columns and adding primary keys.
3. Verify your implementation by checking that every column holds a single value, no numbered column groups exist, and every table has a primary key.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-second-normal-form, db-third-normal-form, db-denormalization

## Success Criteria

- The three rules of 1NF are applied correctly to every table in the schema.
- Anti-patterns listed in this document (CSV columns, repeating groups, missing keys) are identified and eliminated.
