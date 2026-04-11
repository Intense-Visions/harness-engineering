# Second Normal Form (2NF)

> Every non-key column must depend on the entire composite primary key, not just part of it -- eliminating partial dependencies.

## When to Use

- Reviewing tables that have composite (multi-column) primary keys
- Investigating update anomalies where changing one fact requires updating many rows
- Refactoring tables with redundant data across rows that share a partial key
- Decomposing junction tables that have acquired extra attributes over time

## Instructions

Second Normal Form builds on First Normal Form. A table is in 2NF when it is in 1NF and every non-key column depends on the whole primary key, not just a subset of it.

### Functional Dependency

A functional dependency `A -> B` means: given a value of A, the value of B is uniquely determined. In a table with composite key `(order_id, product_id)`, if `product_name` depends only on `product_id`, that is a partial dependency -- a 2NF violation.

### Worked Example 1: Order Items Table

**BAD -- partial dependency on composite key:**

```sql
CREATE TABLE order_items (
  order_id      INT,
  product_id    INT,
  product_name  TEXT,       -- depends only on product_id
  product_price NUMERIC,    -- depends only on product_id
  quantity      INT,
  PRIMARY KEY (order_id, product_id)
);
```

`product_name` and `product_price` depend only on `product_id`, not on the full key `(order_id, product_id)`. Every order containing the same product duplicates the name and price.

**GOOD -- decompose into two tables:**

```sql
CREATE TABLE products (
  id    INT PRIMARY KEY,
  name  TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE order_items (
  order_id   INT REFERENCES orders(id),
  product_id INT REFERENCES products(id),
  quantity   INT NOT NULL CHECK (quantity > 0),
  line_price NUMERIC(10,2) NOT NULL,  -- snapshot of price at time of order
  PRIMARY KEY (order_id, product_id)
);
```

Now `product_name` lives in exactly one place. Changing a product name requires updating one row, not thousands of order_items rows.

### Worked Example 2: Student Enrollment

**BAD -- course details mixed into enrollment table:**

```sql
CREATE TABLE enrollments (
  student_id    INT,
  course_id     INT,
  course_title  TEXT,       -- depends only on course_id
  instructor    TEXT,       -- depends only on course_id
  grade         CHAR(2),
  PRIMARY KEY (student_id, course_id)
);
```

**GOOD -- courses extracted:**

```sql
CREATE TABLE courses (
  id         INT PRIMARY KEY,
  title      TEXT NOT NULL,
  instructor TEXT NOT NULL
);

CREATE TABLE enrollments (
  student_id INT REFERENCES students(id),
  course_id  INT REFERENCES courses(id),
  grade      CHAR(2),
  PRIMARY KEY (student_id, course_id)
);
```

### The Single-Key Exemption

**Tables with a single-column primary key that are in 1NF are automatically in 2NF.** Partial dependencies can only exist when the primary key is composite. If your table has `id SERIAL PRIMARY KEY`, 2NF is already satisfied -- move on to checking 3NF.

### Anti-Patterns

1. **Surrogate keys hiding partial dependencies.** Adding `id SERIAL PRIMARY KEY` to a table with a natural composite key does not fix 2NF -- it hides the problem. The data redundancy remains even though the formal violation disappears. The original composite key becomes a candidate key, and partial dependencies on it still cause update anomalies.

```sql
-- Still violates the spirit of 2NF despite the surrogate key
CREATE TABLE order_items (
  id            SERIAL PRIMARY KEY,  -- surrogate key hides the problem
  order_id      INT,
  product_id    INT,
  product_name  TEXT,     -- still duplicated per product
  quantity      INT,
  UNIQUE (order_id, product_id)
);
```

2. **Composite keys with too many columns.** A primary key with 4+ columns is usually a sign of missing normalization. Each additional column multiplies the chance of partial dependencies.

3. **Denormalizing "for performance" before measuring.** Duplicating product_name into order_items to avoid a join is a deliberate denormalization decision that should come after profiling, not during initial design.

### PostgreSQL Specifics

PostgreSQL enforces foreign keys on composite key decompositions efficiently:

```sql
-- Composite foreign key referencing a composite primary key
ALTER TABLE order_items
  ADD CONSTRAINT fk_order_product
  FOREIGN KEY (order_id, product_id)
  REFERENCES order_products(order_id, product_id);
```

PostgreSQL also supports `DEFERRABLE` constraints for cases where you need to insert parent and child rows in the same transaction without ordering issues:

```sql
ALTER TABLE order_items
  ADD CONSTRAINT fk_order
  FOREIGN KEY (order_id) REFERENCES orders(id)
  DEFERRABLE INITIALLY DEFERRED;
```

## Details

### Update Anomalies from 2NF Violations

Three types of anomalies arise from partial dependencies:

- **Update anomaly.** Changing a product name requires updating every `order_items` row that references that product. Miss one row, and you have inconsistent data.
- **Insertion anomaly.** You cannot add a new product to the system without creating an order that includes it. The product's existence is tied to the junction table.
- **Deletion anomaly.** Deleting the last order for a product removes all record of that product from the system.

### Identifying Partial Dependencies

For each non-key column in a table with a composite key, ask: "Does this column's value change if I change only one part of the key?" If yes, it depends on that part alone -- it is a partial dependency.

Systematic approach:

1. List all non-key columns.
2. For each non-key column, determine which key columns it depends on.
3. If any non-key column depends on a proper subset of the key, extract it into a new table keyed by that subset.

### MySQL Callout

MySQL's InnoDB engine stores rows clustered by primary key. Wide composite primary keys in InnoDB increase the size of every secondary index (each secondary index entry includes the full primary key). This makes 2NF decomposition even more important for MySQL performance -- smaller primary keys mean smaller secondary indexes.

### Real-World Case Study: Inventory Management

A warehouse system had an `inventory_movements` table with composite key `(warehouse_id, product_id, movement_date)`. Columns `warehouse_name`, `warehouse_address`, `product_name`, and `product_category` were all stored in the table. With 50M rows and 200 products across 12 warehouses, product name changes required updating ~4M rows. After decomposition into `warehouses`, `products`, and `inventory_movements` tables, product name updates became single-row operations and the table shrank by 60%.

## Source

- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- Codd, E.F. "Further Normalization of the Data Base Relational Model" (1971)
- Date, C.J. "An Introduction to Database Systems" (8th Edition), Chapter 12

## Process

1. Read the functional dependency rules and examples in this document.
2. For each table with a composite key, identify whether non-key columns depend on the full key or only part of it.
3. Decompose tables with partial dependencies by extracting the partially-dependent columns into a new table keyed by the subset they depend on.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-first-normal-form, db-third-normal-form, db-denormalization

## Success Criteria

- All tables with composite primary keys have been checked for partial dependencies.
- Partial dependencies have been eliminated by decomposing into properly keyed tables.
