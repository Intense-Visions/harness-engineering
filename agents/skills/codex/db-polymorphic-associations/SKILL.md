# Polymorphic Associations

> Modeling inheritance hierarchies and type-varying relationships in relational databases using single-table inheritance (STI), class-table inheritance (CTI), or shared foreign key patterns.

## When to Use

- Entities share a common interface but have type-specific columns (e.g., notifications targeting users, teams, or organizations)
- Content types with shared metadata but different payloads
- Payment methods (card, bank transfer, wallet) with different required fields
- Any "one of many types" relationship where the type set is known at design time

## Instructions

### Key Concepts

Three strategies exist for modeling "a row can reference one of several entity types":

**1. Single-Table Inheritance (STI)**

One table, a discriminator column (`type`), and nullable type-specific columns:

```sql
CREATE TABLE vehicles (
  id    serial PRIMARY KEY,
  type  varchar NOT NULL CHECK (type IN ('truck', 'car', 'motorcycle')),
  make  varchar NOT NULL,
  model varchar NOT NULL,
  -- truck-specific
  payload_capacity_kg int,
  -- car-specific
  passenger_count     int,
  -- motorcycle-specific
  engine_cc           int
);
```

Trucks use `payload_capacity_kg`, cars use `passenger_count`, motorcycles use `engine_cc`. Unused columns are NULL.

Tradeoffs: fast queries (no JOINs), simple schema. But NULLs proliferate, per-type CHECK constraints become complex, and the table widens with every new type.

**2. Class-Table Inheritance (CTI)**

A shared base table plus per-type tables joined by foreign key:

```sql
CREATE TABLE vehicles (
  id    serial PRIMARY KEY,
  type  varchar NOT NULL,
  make  varchar NOT NULL,
  model varchar NOT NULL
);

CREATE TABLE trucks (
  vehicle_id          int PRIMARY KEY REFERENCES vehicles(id),
  payload_capacity_kg int NOT NULL
);

CREATE TABLE cars (
  vehicle_id      int PRIMARY KEY REFERENCES vehicles(id),
  passenger_count int NOT NULL
);
```

Clean normalization, strong per-type constraints, no NULL waste. Reads require JOINs to the base table.

**3. Concrete-Table Inheritance**

No shared table -- each type gets its own table with duplicated common columns. Simplest queries per type, but cross-type queries require `UNION ALL`. Violates DRY at the schema level and makes global constraints (unique VIN across all vehicle types) difficult to enforce.

**4. Polymorphic FK anti-pattern**

A pattern like `commentable_type + commentable_id` without a real FK constraint. This breaks referential integrity entirely -- the database cannot enforce that `commentable_id` points to a valid row in the correct table. No cascading deletes, no index efficiency for join lookups. Use exclusive arcs or an intermediate association table instead.

### Worked Example

A content management system where `comments` can belong to `posts`, `videos`, or `photos`.

**The anti-pattern (no referential integrity):**

```sql
-- DO NOT USE: no real FK constraint possible
CREATE TABLE comments (
  id               serial PRIMARY KEY,
  body             text NOT NULL,
  commentable_type varchar NOT NULL,  -- 'post', 'video', 'photo'
  commentable_id   int NOT NULL
);
```

**The correct approach -- exclusive arc with real FKs:**

```sql
CREATE TABLE comments (
  id       serial PRIMARY KEY,
  body     text NOT NULL,
  post_id  int REFERENCES posts(id) ON DELETE CASCADE,
  video_id int REFERENCES videos(id) ON DELETE CASCADE,
  photo_id int REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT exactly_one_parent CHECK (
    (post_id IS NOT NULL)::int +
    (video_id IS NOT NULL)::int +
    (photo_id IS NOT NULL)::int = 1
  )
);
```

Fetching comments for a post:

```sql
SELECT c.id, c.body
FROM comments c
WHERE c.post_id = 42
ORDER BY c.id;
```

The CHECK constraint guarantees every comment belongs to exactly one parent. Real FK constraints provide cascading deletes and index-backed joins.

### Anti-Patterns

1. **Polymorphic FK without real constraint** (`commentable_type/commentable_id`). No referential integrity, no cascading deletes, no index efficiency for lookups by target.
2. **STI with more than 5-6 type-specific columns.** The table becomes mostly NULL. Switch to CTI.
3. **Using EAV when polymorphic associations would be cleaner.** If the set of types is known, model them explicitly.
4. **Not adding CHECK constraints on exclusive arcs.** Without the constraint, rows can reference zero or multiple parents simultaneously.
5. **Concrete-table inheritance for cross-type queries.** UNION ALL across many tables is expensive and fragile when adding new types.

### PostgreSQL Specifics

PostgreSQL offers native table inheritance via `INHERITS`:

```sql
CREATE TABLE trucks (
  payload_capacity_kg int NOT NULL
) INHERITS (vehicles);
```

This maps directly to CTI at the database level. However, important limitations apply:

- Foreign keys referencing the parent table do NOT see child table rows
- Unique constraints are per-table, not across the hierarchy
- Use the `ONLY` keyword to query just the parent table: `SELECT * FROM ONLY vehicles;`
- PostgreSQL 10+ declarative partitioning supersedes `INHERITS` for most new designs

## Details

### Advanced Topics

**Hybrid approach with JSONB:** Use CTI for the base table and store type-specific columns in a JSONB column instead of separate per-type tables. This combines structural integrity for shared fields with flexibility for type-specific data. See the db-document-in-relational skill for JSONB indexing strategies.

**Exclusive-arc constraint with generated columns:** For tables with many FK columns, a generated column can simplify the CHECK logic by computing the non-null count automatically.

**Performance comparison at scale:** STI wins for read throughput (no JOINs). CTI wins for write throughput and constraint enforcement (narrower per-type tables, no NULL overhead). On a 10M-row benchmark, STI queries are 15-20% faster for reads; CTI INSERT throughput is 10-15% higher.

### Engine Differences

MySQL lacks table inheritance (`INHERITS`). STI and CTI must be implemented manually with JOINs and application logic.

MySQL CHECK constraints are enforced since 8.0.16 -- earlier versions parse but silently ignore them. Exclusive-arc constraints work correctly on MySQL 8.0.16+.

MySQL ENUM can serve as a discriminator column with stricter type enforcement than VARCHAR: `type ENUM('truck', 'car', 'motorcycle') NOT NULL`.

### Real-World Case Studies

**SaaS notification system with 6 target types.** Originally used polymorphic FK (`target_type/target_id`). After a table rename during a migration, thousands of orphaned notification rows appeared -- `target_type` values referenced a table name that no longer existed. Migrated to CTI with an exclusive-arc constraint on the notifications table. Orphan rate dropped to zero. Query performance was unchanged because JOIN overhead on indexed FKs was under 1ms.

## Source

- [Martin Fowler -- Single Table Inheritance](https://martinfowler.com/eaaCatalog/singleTableInheritance.html)
- [Martin Fowler -- Class Table Inheritance](https://martinfowler.com/eaaCatalog/classTableInheritance.html)
- [PostgreSQL Inheritance](https://www.postgresql.org/docs/current/ddl-inherit.html)

## Process

1. Read the key concepts to understand the three inheritance strategies and when each applies.
2. Apply the correct strategy based on your type count, column variance, and read/write ratio.
3. Verify with queries that referential integrity holds and cross-type operations work as expected.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-first-normal-form, db-third-normal-form, db-denormalization, db-entity-attribute-value, db-document-in-relational

## Success Criteria

- Polymorphic relationships use real FK constraints (no `type + id` without referential integrity).
- The correct inheritance strategy is chosen for the access pattern (STI for read-heavy few-type, CTI for many-type or write-heavy, concrete for isolated types).
- Exclusive-arc constraints prevent rows from referencing zero or multiple parents.
