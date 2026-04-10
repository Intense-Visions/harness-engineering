# Closure Table

> Storing all ancestor-descendant pairs in a separate table for O(1) subtree and ancestor lookups with manageable write costs.

## When to Use

- Hierarchies needing both fast reads and moderate write performance (permission systems, category trees with frequent updates)
- Threaded discussions where ancestry queries are common
- When you need to query ancestors, descendants, or path length without recursion
- When referential integrity on the hierarchy is required (unlike nested sets, closure tables use real FKs)

## Instructions

### Key Concepts

Two tables: the **node table** and a **closure table** storing every ancestor-descendant pair:

```sql
CREATE TABLE categories (
  id   serial PRIMARY KEY,
  name varchar NOT NULL
);

CREATE TABLE category_paths (
  ancestor_id   int NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  descendant_id int NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  depth         int NOT NULL DEFAULT 0,
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX idx_paths_descendant ON category_paths (descendant_id, depth);
```

**Every node has a self-referencing row** (ancestor=self, descendant=self, depth=0). This is critical -- it simplifies descendant-count queries and ensures consistent results.

**Key queries -- all O(1) with indexes:**

| Query                  | SQL                                                             |
| ---------------------- | --------------------------------------------------------------- |
| All descendants of X   | `WHERE ancestor_id = X AND depth > 0`                           |
| All ancestors of X     | `WHERE descendant_id = X AND depth > 0`                         |
| Direct children of X   | `WHERE ancestor_id = X AND depth = 1`                           |
| Is A an ancestor of B? | `WHERE ancestor_id = A AND descendant_id = B` (existence check) |
| Path length A to B     | `SELECT depth WHERE ancestor_id = A AND descendant_id = B`      |

**Insert a new node** under parent P:

```sql
-- Copy all ancestor paths of the parent, pointing to the new node, with depth + 1
INSERT INTO category_paths (ancestor_id, descendant_id, depth)
SELECT cp.ancestor_id, NEW_ID, cp.depth + 1
FROM category_paths cp
WHERE cp.descendant_id = P
UNION ALL
SELECT NEW_ID, NEW_ID, 0;  -- self-referencing row
```

**Delete a node and its subtree:** Remove all closure rows where `descendant_id` is in the subtree. With `ON DELETE CASCADE` on the closure table FK, deleting from `categories` handles this automatically.

### Worked Example

An organizational permission hierarchy:

```sql
INSERT INTO categories (id, name) VALUES
  (1, 'Company'),
  (2, 'Engineering'),
  (3, 'Backend'),
  (4, 'Frontend'),
  (5, 'Design');

-- Closure table rows (all ancestor-descendant pairs):
INSERT INTO category_paths (ancestor_id, descendant_id, depth) VALUES
  (1, 1, 0), (2, 2, 0), (3, 3, 0), (4, 4, 0), (5, 5, 0),  -- self-refs
  (1, 2, 1), (1, 3, 2), (1, 4, 2), (1, 5, 1),                -- Company's descendants
  (2, 3, 1), (2, 4, 1);                                        -- Engineering's descendants
```

**All descendants of Engineering:**

```sql
SELECT c.* FROM categories c
JOIN category_paths cp ON c.id = cp.descendant_id
WHERE cp.ancestor_id = 2 AND cp.depth > 0;
-- Returns: Backend, Frontend
```

**Is Company an ancestor of Backend?**

```sql
SELECT EXISTS(
  SELECT 1 FROM category_paths
  WHERE ancestor_id = 1 AND descendant_id = 3
);
-- Returns: true
```

**Adding "DevOps" under Engineering:**

```sql
INSERT INTO categories (id, name) VALUES (6, 'DevOps');

INSERT INTO category_paths (ancestor_id, descendant_id, depth)
SELECT cp.ancestor_id, 6, cp.depth + 1
FROM category_paths cp WHERE cp.descendant_id = 2
UNION ALL SELECT 6, 6, 0;
-- Creates: (6,6,0), (2,6,1), (1,6,2)
```

### Anti-Patterns

1. **Forgetting the self-referencing row (depth=0).** Breaks descendant-count queries and the insert pattern that copies ancestor rows.
2. **Not using a depth column.** Without depth, you cannot distinguish direct children from deeper descendants or compute path lengths without additional queries.
3. **Storing only direct parent-child pairs.** That is just an adjacency list with extra storage. The closure table must store ALL ancestor-descendant pairs.
4. **Not indexing both directions.** You need `(ancestor_id, depth)` for descendant queries AND `(descendant_id, depth)` for ancestor queries.
5. **Not using ON DELETE CASCADE on the closure table.** Manual cleanup of closure rows when deleting nodes is error-prone.

### PostgreSQL Specifics

**Atomic insert** using a single statement:

```sql
INSERT INTO category_paths (ancestor_id, descendant_id, depth)
SELECT cp.ancestor_id, $new_id, cp.depth + 1
FROM category_paths cp
WHERE cp.descendant_id = $parent_id
UNION ALL
SELECT $new_id, $new_id, 0;
```

**Partial index** for direct-children queries (depth=1 only):

```sql
CREATE INDEX idx_paths_direct_children
ON category_paths (ancestor_id) WHERE depth = 1;
```

**Foreign key with cascading delete** ensures closure rows are cleaned up automatically:

```sql
ALTER TABLE category_paths
  ADD CONSTRAINT fk_ancestor FOREIGN KEY (ancestor_id)
    REFERENCES categories(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_descendant FOREIGN KEY (descendant_id)
    REFERENCES categories(id) ON DELETE CASCADE;
```

## Details

### Advanced Topics

**Storage overhead analysis:** A balanced tree of N nodes with branching factor B and height H produces O(N \* H) closure rows. For a balanced binary tree of 1000 nodes (H ~10), that is about 10K closure rows -- 10x the node count. A degenerate chain (linked list) of N nodes produces O(N^2/2) rows -- worst case.

**Comparison with materialized path:** The `ltree` extension in PostgreSQL provides path-based hierarchy queries with GiST indexing. Materialized paths use less storage (one column per row vs O(N log N) closure rows) but lack the referential integrity of closure tables. See db-hierarchical-data for a full comparison.

**Subtree move operation:** Moving a subtree from parent A to parent B requires: (1) DELETE all paths from ancestors-of-A to descendants-of-subtree-root, (2) INSERT new paths from ancestors-of-B to descendants-of-subtree-root. This is O(subtree_size \* depth) operations.

**Hybrid approach:** Maintain both `parent_id` (adjacency list) for simple parent lookups and the closure table for complex hierarchy queries. The adjacency list parent_id column adds negligible storage and simplifies direct-parent queries.

### Engine Differences

MySQL closure tables work identically at the SQL level. The same schema, queries, and insert patterns apply.

Key MySQL differences:

- MySQL lacks partial indexes -- use a regular composite index `(ancestor_id, depth)` instead of a filtered index on `depth = 1`
- MySQL's `INSERT ... SELECT` works the same way for populating closure rows
- MySQL supports `ON DELETE CASCADE` on foreign keys identically
- Performance note: PostgreSQL's hash joins on the closure table outperform MySQL's nested-loop joins for large subtree queries on tables with 100K+ closure rows

### Real-World Case Studies

**RBAC permission system with 200K roles in a 15-level hierarchy.** The core query "does user X have permission Y?" requires ancestor traversal -- checking if any of the user's role ancestors has the target permission. With adjacency list and recursive CTE: 12ms average. With closure table: 0.3ms average (single indexed join on `category_paths`). The closure table added 1.2M rows (6x the node count) but the 40x read performance improvement justified the storage. Role additions happen ~50/day; the insert cost (copying ~15 ancestor rows per new role) is negligible.

## Source

- [Bill Karwin -- SQL Antipatterns (Closure Table)](https://pragprog.com/titles/bksqla/sql-antipatterns/)
- [Dirk Riehle -- Closure Tables](https://dirk.blog/2008/01/04/closure-tables/)

## Process

1. Read the key concepts to understand the two-table structure and self-referencing rows.
2. Apply the closure table pattern with proper indexes on both `(ancestor_id, depth)` and `(descendant_id, depth)`.
3. Verify that insert operations correctly populate all ancestor-descendant pairs and that queries return expected results.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-adjacency-list, db-nested-sets, db-hierarchical-data

## Success Criteria

- Closure table is populated with self-referencing rows (depth=0) for every node.
- Both ancestor-direction and descendant-direction indexes are present.
- Insert and delete operations maintain closure integrity (no orphaned pairs).
- Subtree and ancestor queries use indexed joins, not recursive CTEs.
