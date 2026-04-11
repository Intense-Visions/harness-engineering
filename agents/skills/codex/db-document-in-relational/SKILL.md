# Document Data in Relational Databases

> Using JSONB columns to store semi-structured data alongside relational tables, with indexing strategies and guidelines for when to embed vs normalize.

## When to Use

- User preferences and application settings that vary per user
- API response caching where the response structure varies
- Form builder configurations with dynamic field sets
- Product attributes that vary by type (see also db-entity-attribute-value)
- Any data where the schema varies per row but relational integrity matters for core fields

## Instructions

### Key Concepts

PostgreSQL JSONB stores binary JSON -- it supports indexing, containment checks, and path queries. The key design decision is **when to embed in JSONB vs when to normalize:**

**Embed in JSONB when:**

- Data is read and written as a unit (e.g., user settings blob)
- No cross-row queries are needed on the embedded data
- Schema varies per row (different products have different attributes)
- No referential integrity is needed for embedded data

**Normalize into relational columns when:**

- Data is queried independently or appears in WHERE/JOIN clauses
- FK constraints are needed
- Data participates in JOINs with other tables
- 1:N relationships that grow unbounded (avoid arrays in JSONB)

**The hybrid model** -- relational columns for queryable/constrained fields, JSONB for flexible/varying fields:

```sql
CREATE TABLE products (
  id          serial PRIMARY KEY,
  name        varchar NOT NULL,
  price       numeric(10,2) NOT NULL,
  category_id int REFERENCES categories(id),
  attrs       jsonb DEFAULT '{}'
);
```

Core fields (`name`, `price`, `category_id`) are relational -- type-safe, constrained, indexable. Varying fields (`attrs`) are JSONB -- flexible, no schema migration needed.

**Indexing strategies:**

```sql
-- GIN index for containment/existence queries (@>, ?, ?&, ?|)
CREATE INDEX idx_products_attrs ON products USING gin (attrs);

-- Expression index for specific frequently-queried paths
CREATE INDEX idx_products_color ON products ((attrs->>'color'));
```

### Worked Example

E-commerce product catalog with type-varying attributes:

```sql
-- Products with different attribute sets
INSERT INTO products (name, price, category_id, attrs) VALUES
  ('Running Shoe', 129.99, 1, '{"color": "red", "size": "10", "material": "mesh"}'),
  ('LED Bulb', 8.99, 2, '{"wattage": 60, "color_temp": "warm", "lumens": 800}'),
  ('Cotton T-Shirt', 24.99, 3, '{"color": "blue", "size": "L", "fabric": "100% cotton"}');
```

**Containment query (uses GIN index):**

```sql
SELECT name, price FROM products
WHERE attrs @> '{"color": "red"}';
-- Returns: Running Shoe
```

**Path query (uses expression index):**

```sql
SELECT name, price FROM products
WHERE attrs->>'color' = 'blue';
-- Returns: Cotton T-Shirt
```

**Aggregation on JSON field:**

```sql
SELECT attrs->>'color' AS color, count(*)
FROM products
WHERE attrs ? 'color'
GROUP BY attrs->>'color';
```

**EXPLAIN ANALYZE demonstrating index usage:**

```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE attrs @> '{"color": "red"}';
-- Bitmap Index Scan on idx_products_attrs
--   Recheck Cond: (attrs @> '{"color": "red"}'::jsonb)
```

Without the GIN index, this query degrades to a sequential scan on every row.

### Anti-Patterns

1. **Storing entire entity as JSONB when most fields are known and stable.** You lose type safety, constraints, and query efficiency. Use relational columns for stable fields.
2. **Deeply nested JSONB structures (3+ levels).** Deep nesting makes queries unreadable (`attrs->'specs'->'dimensions'->'width'`) and un-indexable at deep paths.
3. **Using JSON instead of JSONB.** The `json` type preserves whitespace and key ordering but cannot be indexed. Always use `jsonb` unless you need exact text preservation.
4. **JSONB columns in JOIN conditions.** Terrible performance without expression indexes. If a JSON field participates in JOINs, extract it to a relational column.
5. **JSONB documents larger than 1MB per row.** Large documents cause TOAST overhead, slow updates, and memory pressure. Normalize large structures into relational tables.

### PostgreSQL Specifics

**JSONB operators:**

| Operator | Purpose             | Example                                        |
| -------- | ------------------- | ---------------------------------------------- | -------- | ------------------------- |
| `->`     | Get element as JSON | `attrs->'color'` returns `"red"` (with quotes) |
| `->>`    | Get element as text | `attrs->>'color'` returns `red` (no quotes)    |
| `@>`     | Contains            | `attrs @> '{"color":"red"}'`                   |
| `?`      | Key exists          | `attrs ? 'color'`                              |
| `?&`     | All keys exist      | `attrs ?& array['color','size']`               |
| `?       | `                   | Any key exists                                 | `attrs ? | array['color','wattage']` |

**GIN index operator classes:**

- `jsonb_ops` -- supports all operators, larger index size
- `jsonb_path_ops` -- supports only `@>`, but 2-3x smaller index

```sql
-- Use jsonb_path_ops when only containment queries are needed
CREATE INDEX ON products USING gin (attrs jsonb_path_ops);
```

**SQL/JSON path queries** (PostgreSQL 12+):

```sql
SELECT * FROM products
WHERE jsonb_path_exists(attrs, '$.color ? (@ == "red")');
```

## Details

### Advanced Topics

**Generated columns from JSONB** for computed relational columns:

```sql
ALTER TABLE products
ADD COLUMN color varchar
GENERATED ALWAYS AS (attrs->>'color') STORED;

-- Now indexable and queryable as a regular column
CREATE INDEX idx_products_color_col ON products (color);
```

Generated columns are automatically updated when `attrs` changes. Use this to "promote" frequently queried JSONB fields to relational columns.

**Partial indexes on JSONB paths:**

```sql
CREATE INDEX idx_products_wattage ON products ((attrs->>'wattage'))
WHERE attrs ? 'wattage';
```

Only indexes rows that have the `wattage` key -- smaller and faster for sparse attributes.

**Partial updates with jsonb_set:**

```sql
-- Update a single key without rewriting the entire JSONB value
UPDATE products
SET attrs = jsonb_set(attrs, '{color}', '"green"')
WHERE id = 1;
```

This is more efficient than replacing the entire `attrs` value, especially for large documents.

**TOAST storage:** JSONB values exceeding ~2KB are compressed and stored out-of-line. Very large JSONB values (100KB+) incur TOAST overhead on every read. Monitor with `SELECT pg_column_size(attrs) FROM products ORDER BY 1 DESC LIMIT 10;`.

### Engine Differences

MySQL 5.7+ supports a `JSON` column type but lacks JSONB:

- MySQL requires generated columns with B-tree indexes for JSON path queries:

```sql
ALTER TABLE products
ADD COLUMN color varchar(50)
GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(attrs, '$.color'))) VIRTUAL;
CREATE INDEX idx_color ON products(color);
```

- MySQL lacks GIN indexes and containment operators (`@>`)
- MySQL multi-valued indexes (8.0.17+) can index JSON arrays: `CREATE INDEX idx_tags ON products ((CAST(attrs->'$.tags' AS UNSIGNED ARRAY)));`
- MySQL `JSON_TABLE` (8.0+) flattens JSON to rows for complex queries
- MySQL `JSON_CONTAINS()` is the closest equivalent to PostgreSQL's `@>` but cannot use specialized indexes

### Real-World Case Studies

**Multi-tenant SaaS platform with custom fields per tenant.** Originally used EAV (Entity-Attribute-Value) with 100M rows across 500 tenants. Cross-field queries ("all contacts where region = East AND tier = Enterprise") took 30+ seconds due to self-joins. Migrated to a JSONB `custom_fields` column with a GIN index. Same queries now complete in 15ms. Storage reduced 60% (one row per entity vs N rows per entity in EAV). For the 5 most-queried custom fields per tenant, added expression indexes that dropped those specific queries to under 3ms.

## Source

- [PostgreSQL JSON Types](https://www.postgresql.org/docs/current/datatype-json.html)
- [PostgreSQL JSON Functions](https://www.postgresql.org/docs/current/functions-json.html)

## Process

1. Read the key concepts to understand when to embed in JSONB vs normalize to relational columns.
2. Apply the hybrid model: relational columns for stable, queryable fields; JSONB for varying, per-row data.
3. Verify with EXPLAIN ANALYZE that GIN or expression indexes are used for JSONB queries.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-entity-attribute-value, db-polymorphic-associations, db-first-normal-form, db-denormalization, db-expression-index

## Success Criteria

- JSONB is used only for varying or semi-structured fields -- stable fields are relational columns.
- GIN or expression indexes are present for queried JSONB paths.
- Frequently queried JSONB fields are promoted to generated columns or expression indexes.
- JSONB documents stay under 1MB per row.
