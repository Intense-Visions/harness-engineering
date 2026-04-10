# Nested Sets

> Encoding hierarchy position with left/right boundary numbers for O(1) subtree and ancestor queries at the cost of expensive writes.

## When to Use

- Read-heavy hierarchies that rarely change (product category taxonomies, geographic region trees)
- Organizational hierarchies updated quarterly or less frequently
- Reporting that needs subtree aggregation without recursion
- Hierarchies rebuilt in batch (nightly import, weekly sync) where write cost is amortized

## Instructions

### Key Concepts

Each node stores `lft` and `rgt` values assigned via modified preorder tree traversal (MPTT). The numbering works by walking the tree depth-first, incrementing a counter on each "visit" -- once when entering a node (lft) and once when leaving (rgt):

```sql
CREATE TABLE categories (
  id   serial PRIMARY KEY,
  name varchar NOT NULL,
  lft  int NOT NULL,
  rgt  int NOT NULL
);

CREATE INDEX idx_categories_lft_rgt ON categories (lft, rgt);
```

**Key queries become simple range checks:**

| Query               | SQL                                 |
| ------------------- | ----------------------------------- |
| Subtree of node X   | `WHERE lft BETWEEN X.lft AND X.rgt` |
| Ancestors of node X | `WHERE lft < X.lft AND rgt > X.rgt` |
| Leaf nodes          | `WHERE rgt = lft + 1`               |
| Subtree size        | `(rgt - lft - 1) / 2`               |
| Is A ancestor of B? | `A.lft < B.lft AND A.rgt > B.rgt`   |

No recursion, no JOINs -- all hierarchy queries reduce to range comparisons on two indexed columns.

**The cost:** Inserts require updating all nodes with `lft` or `rgt` >= the insertion point. This is O(n) writes per insertion. Deletes similarly require renumbering.

### Worked Example

A 3-level product taxonomy with MPTT numbering:

```
Electronics (1, 14)
  Computers (2, 7)
    Laptops (3, 4)
    Desktops (5, 6)
  Phones (8, 11)
    Smartphones (9, 10)
  Accessories (12, 13)
```

**All subcategories of Electronics (lft=1, rgt=14):**

```sql
SELECT * FROM categories
WHERE lft BETWEEN 1 AND 14
ORDER BY lft;
-- Returns all 7 nodes, no recursion needed
```

**All ancestors of Smartphones (lft=9, rgt=10):**

```sql
SELECT * FROM categories
WHERE lft < 9 AND rgt > 10
ORDER BY lft;
-- Returns: Electronics (1,14), Phones (8,11)
```

**Inserting "Tablets" under Electronics after Phones (rgt=11):**

```sql
BEGIN;

-- Make room: shift all nodes to the right of insertion point
UPDATE categories SET rgt = rgt + 2 WHERE rgt > 11;
UPDATE categories SET lft = lft + 2 WHERE lft > 11;

-- Insert the new node
INSERT INTO categories (name, lft, rgt) VALUES ('Tablets', 12, 13);

COMMIT;
```

This updates O(n) rows to insert a single node. On a table with 50K categories, this means potentially updating tens of thousands of rows for one insert.

### Anti-Patterns

1. **Using nested sets for frequently changing hierarchies.** Every insert, delete, or move touches O(n) rows. Use adjacency list or closure table instead.
2. **Not wrapping modifications in transactions.** Partial renumbering corrupts the tree -- `lft`/`rgt` invariants break and all queries return wrong results.
3. **Not indexing `(lft, rgt)`.** The entire point of nested sets is fast range queries. Without the composite index, the benefit disappears.
4. **Mixing adjacency list queries with nested sets without maintaining both.** If you need parent_id for writes, store it alongside lft/rgt and maintain both.
5. **Using nested sets for trees deeper than a few thousand nodes.** The renumbering cost scales with total tree size, not subtree size.

### PostgreSQL Specifics

**Composite index** for subtree queries:

```sql
CREATE INDEX idx_categories_lft_rgt ON categories (lft, rgt);
```

**Locking during modifications** to prevent concurrent renumbering conflicts:

```sql
-- Option 1: Row-level locks on affected rows
SELECT * FROM categories WHERE lft > 11 FOR UPDATE;

-- Option 2: Advisory lock for serializing all tree modifications
SELECT pg_advisory_xact_lock(hashtext('categories_tree'));
```

Advisory locks are lighter-weight than row locks when modifications are infrequent. The lock is released automatically at transaction end.

**Constraint enforcement:**

```sql
ALTER TABLE categories ADD CONSTRAINT valid_bounds CHECK (lft < rgt);
ALTER TABLE categories ADD CONSTRAINT positive_bounds CHECK (lft > 0 AND rgt > 0);
```

## Details

### Advanced Topics

**Gap-based numbering:** Leave gaps between lft/rgt values (e.g., increment by 100 instead of 1). This allows some inserts without renumbering -- the new node fits in the gap. When gaps are exhausted, perform a full renumbering in batch. Reduces average write cost at the expense of occasional expensive rebuilds.

**Hybrid adjacency list + nested sets:** Store both `parent_id` and `lft/rgt`. Use adjacency list for writes (update parent_id, O(1)), rebuild nested set numbers in batch. Use nested sets for reads (subtree queries without recursion). This is the most practical approach for hierarchies that change moderately.

**Nested intervals:** Use rational numbers (fractions) instead of integers for lft/rgt. New nodes can always be inserted between existing values without renumbering. Adds mathematical complexity but eliminates the O(n) write cost entirely.

### Engine Differences

MySQL nested sets work identically at the SQL level -- the same queries, same indexing strategy.

MySQL's default transaction isolation (REPEATABLE READ) provides stronger consistency guarantees during renumbering than PostgreSQL's default (READ COMMITTED). Concurrent readers in MySQL see a consistent snapshot even during renumbering. However, explicit locking is still recommended in both engines to prevent concurrent writers from corrupting the tree.

MySQL lacks advisory locks. Use `GET_LOCK('categories_tree', 10)` (named lock with 10-second timeout) as the equivalent of PostgreSQL's `pg_advisory_xact_lock()`. Note that `GET_LOCK` is session-scoped, not transaction-scoped -- release explicitly with `RELEASE_LOCK()`.

### Real-World Case Studies

**Retail product catalog with 50K categories, updated weekly via batch import.** The category tree changes every Monday when the merchandising team uploads a new CSV. Nested sets enabled "all products in Electronics and subcategories" aggregation in 2ms versus 45ms with recursive CTE on the same data. The weekly batch rebuild (full renumbering of all 50K nodes) takes 3 seconds -- entirely acceptable for a once-per-week operation. During the rebuild, the previous tree remains queryable via a blue-green table swap pattern.

## Source

- [Joe Celko -- Trees and Hierarchies in SQL](https://www.amazon.com/dp/1558609202)
- [Wikipedia -- Nested Set Model](https://en.wikipedia.org/wiki/Nested_set_model)

## Process

1. Read the key concepts to understand MPTT numbering and the read/write tradeoff.
2. Apply nested sets only for hierarchies with high read-to-write ratios.
3. Verify that all modifications are wrapped in transactions and that subtree queries use the composite `(lft, rgt)` index.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-adjacency-list, db-closure-table, db-hierarchical-data

## Success Criteria

- Nested sets are used only for read-heavy, write-rare hierarchies.
- All tree modifications are wrapped in transactions with appropriate locking.
- Composite index on `(lft, rgt)` is present for range queries.
- The tree is validated after batch operations to confirm `lft`/`rgt` invariants hold.
