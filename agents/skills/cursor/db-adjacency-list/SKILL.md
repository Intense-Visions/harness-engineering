# Adjacency List

> The simplest hierarchical model where each row stores a reference to its parent, traversed with recursive CTEs for subtree and ancestor queries.

## When to Use

- Organizational charts and reporting hierarchies
- Category trees for e-commerce or content management
- Comment threads and discussion forums
- File system directory structures
- Any hierarchy where writes are frequent and full-tree reads are uncommon

## Instructions

### Key Concepts

Each row has a `parent_id` foreign key pointing to the same table. Root nodes have `parent_id IS NULL`:

```sql
CREATE TABLE categories (
  id        serial PRIMARY KEY,
  name      varchar NOT NULL,
  parent_id int REFERENCES categories(id)
);

CREATE INDEX idx_categories_parent ON categories (parent_id);
```

**Direct parent/child queries** are trivial:

```sql
-- Direct children of category 5:
SELECT * FROM categories WHERE parent_id = 5;

-- Parent of category 12:
SELECT p.* FROM categories p
JOIN categories c ON c.parent_id = p.id
WHERE c.id = 12;
```

**Subtree queries** require recursive CTEs:

```sql
WITH RECURSIVE subtree AS (
  -- Anchor: start from the target node
  SELECT id, name, parent_id, 0 AS depth
  FROM categories WHERE id = 5

  UNION ALL

  -- Recursive: find children of current level
  SELECT c.id, c.name, c.parent_id, s.depth + 1
  FROM categories c
  JOIN subtree s ON c.parent_id = s.id
)
SELECT * FROM subtree ORDER BY depth, name;
```

**Ancestor queries** reverse the join direction:

```sql
WITH RECURSIVE ancestors AS (
  SELECT id, name, parent_id, 0 AS depth
  FROM categories WHERE id = 42

  UNION ALL

  SELECT c.id, c.name, c.parent_id, a.depth + 1
  FROM categories c
  JOIN ancestors a ON a.parent_id = c.id
)
SELECT * FROM ancestors ORDER BY depth DESC;
```

The `depth` counter enables level-aware formatting and depth-limited queries (`WHERE depth < 3` in the recursive term).

### Worked Example

Category tree for an e-commerce site:

```sql
INSERT INTO categories (id, name, parent_id) VALUES
  (1, 'Electronics', NULL),
  (2, 'Computers', 1),
  (3, 'Laptops', 2),
  (4, 'Desktops', 2),
  (5, 'Phones', 1),
  (6, 'Accessories', 1),
  (7, 'USB-C Cables', 6);
```

**All subcategories of Electronics (id=1):**

```sql
WITH RECURSIVE tree AS (
  SELECT id, name, parent_id, 1 AS depth FROM categories WHERE id = 1
  UNION ALL
  SELECT c.id, c.name, c.parent_id, t.depth + 1
  FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree WHERE depth > 0 ORDER BY depth, name;
```

Returns: Accessories, Computers, Phones (depth 1), then Desktops, Laptops, USB-C Cables (depth 2).

**Ancestors of USB-C Cables (id=7) up to root:**

```sql
WITH RECURSIVE path AS (
  SELECT id, name, parent_id FROM categories WHERE id = 7
  UNION ALL
  SELECT c.id, c.name, c.parent_id
  FROM categories c JOIN path p ON p.parent_id = c.id
)
SELECT * FROM path;
```

Returns: USB-C Cables -> Accessories -> Electronics.

**Depth-limited query (max 2 levels from Electronics):**

Add `WHERE t.depth < 2` in the recursive term to stop at depth 2.

### Anti-Patterns

1. **Multiple self-JOINs for fixed-depth trees.** Hard-coding `JOIN categories c2 ON c1.parent_id = c2.id JOIN categories c3 ON c2.parent_id = c3.id` breaks when depth changes. Use recursive CTEs.
2. **Not indexing `parent_id`.** The recursive CTE does a lookup per level. Without an index, each step triggers a sequential scan.
3. **Infinite loop risk without cycle detection.** Corrupt data with circular references causes infinite recursion. Use PostgreSQL 14+ `CYCLE` clause or track visited nodes in an array.
4. **Fetching the entire tree when only a subtree is needed.** Always anchor the recursive CTE to the target node, not the root.

### PostgreSQL Specifics

PostgreSQL 14+ provides built-in cycle detection and traversal control:

```sql
WITH RECURSIVE tree AS (
  SELECT id, name, parent_id FROM categories WHERE id = 1
  UNION ALL
  SELECT c.id, c.name, c.parent_id
  FROM categories c JOIN tree t ON c.parent_id = t.id
)
SEARCH DEPTH FIRST BY id SET ordercol
CYCLE id SET is_cycle USING path
SELECT * FROM tree WHERE NOT is_cycle ORDER BY ordercol;
```

- `CYCLE id SET is_cycle USING path` -- automatic cycle detection
- `SEARCH BREADTH FIRST BY id SET ordercol` -- level-order traversal
- `SEARCH DEPTH FIRST BY id SET ordercol` -- pre-order traversal

An index on `parent_id` is critical. Without it, each recursive step performs a sequential scan on the entire table.

## Details

### Advanced Topics

**Materialized path hybrid:** Store a `path` column (e.g., `/1/6/7/`) alongside `parent_id`. Subtree queries become `WHERE path LIKE '/1/6/%'` -- no recursion needed. The `ltree` extension in PostgreSQL provides native path operations with GiST indexing. See db-hierarchical-data for a full comparison.

**Performance characteristics:** Subtree queries cost O(depth) recursive steps, each scanning indexed child rows. For balanced trees this is efficient. For deep chains (depth > 100), performance degrades. Consider closure tables for deep hierarchies with frequent subtree reads.

**Combining with closure table:** Use adjacency list for writes (simple parent_id update) and maintain a closure table for reads. This hybrid offers the best of both models at the cost of maintaining two data structures.

### Engine Differences

MySQL 8.0+ supports `WITH RECURSIVE` with compatible syntax. Earlier MySQL versions require stored procedures or application-layer recursion for tree traversal.

Key MySQL differences:

- MySQL lacks `CYCLE` and `SEARCH` clauses -- cycle detection must be done manually by tracking visited IDs in a VARCHAR path column
- MySQL has a `cte_max_recursion_depth` system variable (default 1000, configurable) that limits recursion depth
- MySQL recursive CTE performance is comparable to PostgreSQL for shallow trees (depth < 20)

### Real-World Case Studies

**Reddit-style comment threading with 50M comments.** Maximum thread depth of 20 levels. Adjacency list with a recursive CTE fetches a full thread (average 200 comments) in 8ms using a composite index on `(parent_id, created_at)`. The team evaluated migrating to nested sets but abandoned the effort: every new comment would require renumbering O(n) rows in the thread, and comments are inserted frequently. The adjacency list's O(1) insert was the deciding factor.

## Source

- [PostgreSQL WITH Queries](https://www.postgresql.org/docs/current/queries-with.html)
- [SQL Antipatterns by Bill Karwin -- Naive Trees chapter](https://pragprog.com/titles/bksqla/sql-antipatterns/)

## Process

1. Read the key concepts to understand adjacency list structure and recursive CTE traversal.
2. Apply the pattern with proper indexing on `parent_id` and cycle detection for untrusted data.
3. Verify with EXPLAIN ANALYZE that recursive CTEs use index scans at each level.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-nested-sets, db-closure-table, db-hierarchical-data, db-query-rewriting

## Success Criteria

- Adjacency list tables have an index on `parent_id`.
- Subtree and ancestor queries use recursive CTEs, not hard-coded multi-level JOINs.
- Cycle detection is in place for hierarchies with untrusted or user-generated data.
- Depth limits are applied to prevent runaway recursion.
