# Entity-Attribute-Value (EAV)

> A schema pattern for storing dynamic, user-defined attributes as rows instead of columns -- usually avoided in favor of JSONB or polymorphic alternatives, but occasionally justified for genuinely unbounded attribute sets.

## When to Use

- Truly user-defined attributes where the attribute set is unknown at design time (e.g., product catalog with 10K+ varying attributes across categories)
- Medical records with thousands of possible observation types
- Legacy systems where the EAV pattern is already entrenched and migration cost is prohibitive
- Multi-tenant platforms where each tenant defines custom fields

## Instructions

### Key Concepts

EAV stores data as `(entity_id, attribute_name, attribute_value)` triples instead of columns:

```sql
CREATE TABLE product_attributes (
  product_id     int REFERENCES products(id),
  attribute_name varchar NOT NULL,
  attribute_value text,
  PRIMARY KEY (product_id, attribute_name)
);
```

Each attribute becomes a row instead of a column. An entity with 20 attributes produces 20 rows.

**Core tradeoffs:**

- Maximum flexibility for schema evolution -- new attributes require no DDL changes
- Loss of type safety -- all values stored as text in a single column
- No per-attribute constraints -- cannot enforce NOT NULL, CHECK, or FK per attribute
- Query complexity -- pivoting rows back to columns for reporting requires crosstab queries
- EAV violates First Normal Form: values of different types (dates, numbers, strings) share one column

### Worked Example

An e-commerce product catalog. Products have standard columns in a relational table plus dynamic attributes in EAV:

```sql
CREATE TABLE products (
  id    serial PRIMARY KEY,
  name  varchar NOT NULL,
  price numeric(10,2) NOT NULL,
  sku   varchar UNIQUE NOT NULL
);

-- EAV for varying attributes
INSERT INTO product_attributes VALUES
  (1, 'color', 'red'),
  (1, 'size', 'large'),
  (1, 'material', 'cotton'),
  (2, 'color', 'blue'),
  (2, 'wattage', '60');
```

**Querying "all products where color = red AND size = large"** requires a self-join:

```sql
SELECT p.id, p.name
FROM products p
JOIN product_attributes a1
  ON p.id = a1.product_id AND a1.attribute_name = 'color' AND a1.attribute_value = 'red'
JOIN product_attributes a2
  ON p.id = a2.product_id AND a2.attribute_name = 'size' AND a2.attribute_value = 'large';
```

**The same query with JSONB** (preferred alternative):

```sql
ALTER TABLE products ADD COLUMN attrs jsonb DEFAULT '{}';

-- Single-row update instead of multiple EAV inserts
UPDATE products SET attrs = '{"color": "red", "size": "large", "material": "cotton"}' WHERE id = 1;

-- Dramatically simpler query
SELECT id, name FROM products
WHERE attrs->>'color' = 'red' AND attrs->>'size' = 'large';
```

The JSONB approach is simpler to query, supports GIN indexing, and stores all attributes in one row. **Prefer JSONB for most EAV use cases.**

### Anti-Patterns

1. **Using EAV for attributes known at design time.** If the attributes are stable, just add columns -- they provide type safety, constraints, and simple queries.
2. **Storing typed data as text without validation.** Dates, numbers, and booleans all become strings. Application bugs go undetected until downstream processing fails.
3. **Not adding a `value_type` discriminator column.** When EAV is unavoidable, include a type column (`text`, `integer`, `date`) and separate typed value columns.
4. **Using EAV when JSONB would serve the same purpose.** JSONB provides better indexing, simpler queries, and containment operators.
5. **Missing indexes on `(attribute_name, attribute_value)`.** Without them, every attribute filter is a sequential scan on the entire EAV table.

### PostgreSQL Specifics

JSONB is the primary alternative to EAV in PostgreSQL. It supports:

- **GIN indexing** for containment queries:

```sql
CREATE INDEX ON products USING gin (attrs jsonb_path_ops);

-- Uses the GIN index:
SELECT * FROM products WHERE attrs @> '{"color": "red"}';
```

- **Path queries** with expression indexes for specific fields:

```sql
CREATE INDEX ON products ((attrs->>'color'));
```

- **Key-exists checks** with `?`, `?&`, `?|` operators
- **hstore extension** as a lightweight key-value alternative when full JSON structure is not needed

## Details

### Advanced Topics

**Crosstab queries** with the `tablefunc` extension pivot EAV rows into columns:

```sql
SELECT * FROM crosstab(
  'SELECT product_id, attribute_name, attribute_value
   FROM product_attributes ORDER BY 1, 2',
  'SELECT DISTINCT attribute_name FROM product_attributes ORDER BY 1'
) AS ct(product_id int, color text, material text, size text, wattage text);
```

**Typed EAV** uses separate value columns per type:

```sql
CREATE TABLE product_attributes (
  product_id     int REFERENCES products(id),
  attribute_name varchar NOT NULL,
  value_type     varchar NOT NULL CHECK (value_type IN ('text', 'integer', 'date', 'numeric')),
  text_value     text,
  int_value      integer,
  date_value     date,
  numeric_value  numeric,
  PRIMARY KEY (product_id, attribute_name)
);
```

**Performance at scale:** EAV tables with 100M+ rows require careful indexing. Partition by entity type or attribute category to keep individual partitions manageable. Consider composite indexes on `(attribute_name, attribute_value, product_id)` for attribute-first lookups.

### Engine Differences

MySQL 5.7+ supports JSON columns but with weaker indexing than PostgreSQL JSONB:

- MySQL lacks GIN indexes and containment operators (`@>`)
- JSON path queries require generated columns with B-tree indexes:

```sql
ALTER TABLE products
  ADD COLUMN color varchar(50) GENERATED ALWAYS AS (JSON_UNQUOTE(attrs->'$.color')) VIRTUAL;
CREATE INDEX idx_color ON products(color);
```

- MySQL multi-valued indexes (8.0.17+) can index JSON arrays but not arbitrary key-value pairs
- For MySQL stacks, EAV may remain more practical than JSON for complex attribute filtering, though the query complexity cost remains

### Real-World Case Studies

**Healthcare system with 50K distinct observation types.** Original EAV schema held 2B rows. Patient timeline queries took 30+ seconds because each observation required a self-join. Migration strategy: kept EAV for rare attributes (the long tail below 100 queries/day), moved the top-100 most-queried attributes (covering 95% of all queries) to dedicated columns on the patient record. Common lookup query time dropped from 30s to 200ms. Rare-attribute queries remained in EAV at acceptable latency for their low frequency.

## Source

- [SQL Antipatterns by Bill Karwin -- EAV chapter](https://pragprog.com/titles/bksqla/sql-antipatterns/)
- [PostgreSQL JSON Types](https://www.postgresql.org/docs/current/datatype-json.html)

## Process

1. Read the key concepts to understand the EAV tradeoffs and when it is justified.
2. Evaluate whether JSONB, polymorphic associations, or dedicated columns better serve your use case before choosing EAV.
3. If EAV is chosen, verify that indexing, type discrimination, and query patterns are documented and tested.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-polymorphic-associations, db-document-in-relational, db-first-normal-form, db-denormalization

## Success Criteria

- EAV is only used when the attribute set is genuinely unbounded and unknown at design time.
- JSONB is preferred over EAV for most dynamic-attribute needs.
- When EAV is used, typed value columns and proper indexing are in place.
