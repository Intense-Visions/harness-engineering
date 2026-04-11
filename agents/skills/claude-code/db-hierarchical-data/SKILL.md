# Hierarchical Data Selection Guide

> Choosing between adjacency list, nested sets, closure table, and materialized path based on read/write ratio, query patterns, and tree depth.

## When to Use

- Any time you need to model a tree or hierarchy in a relational database
- This skill is the entry point that routes to the specific pattern skills (db-adjacency-list, db-nested-sets, db-closure-table)
- When evaluating which hierarchy model fits your workload before committing to a schema

## Instructions

### Key Concepts

Four approaches exist for modeling hierarchies in relational databases. Each trades off read performance, write performance, storage, and integrity differently:

| Operation             | Adjacency List     | Nested Sets | Closure Table   | Materialized Path  |
| --------------------- | ------------------ | ----------- | --------------- | ------------------ |
| Insert node           | O(1)               | O(n)        | O(depth)        | O(1)               |
| Delete node           | O(1)               | O(n)        | O(subtree)      | O(subtree)         |
| Move subtree          | O(1)               | O(n)        | O(subtree^2)    | O(subtree)         |
| Get children          | O(1) indexed       | O(1)        | O(1)            | O(1) pattern match |
| Get subtree           | O(depth) recursive | O(1) range  | O(1) join       | O(1) LIKE          |
| Get ancestors         | O(depth) recursive | O(1) range  | O(1) join       | O(1) split         |
| Get depth             | Recursive          | Computed    | Stored          | Count separators   |
| Storage overhead      | None               | 2 cols/row  | O(N log N) rows | 1 col/row          |
| Referential integrity | FK enforced        | App-level   | FK enforced     | App-level          |

**Decision rules:**

1. **Write-heavy with simple parent-child queries** -- adjacency list. O(1) inserts, recursive CTEs for occasional subtree reads.
2. **Read-heavy, rarely changing** -- nested sets. O(1) subtree queries via range checks, but O(n) writes.
3. **Read-heavy with moderate writes, need referential integrity** -- closure table. O(1) reads via join, O(depth) writes.
4. **Simple hierarchy on PostgreSQL** -- materialized path with `ltree`. Compact, GiST-indexable, good read/write balance.

### Worked Example

Three scenarios demonstrating which model to choose:

**Scenario 1: Comment threading (frequent inserts, rare full-tree reads)**

Choose **adjacency list**. Comments are inserted constantly. Full-thread reads (subtree) happen only when a user opens a thread. The recursive CTE cost is acceptable for occasional reads:

```sql
-- O(1) insert
INSERT INTO comments (body, parent_id) VALUES ('Reply', 42);

-- Occasional subtree read via recursive CTE
WITH RECURSIVE thread AS (
  SELECT * FROM comments WHERE id = 1
  UNION ALL
  SELECT c.* FROM comments c JOIN thread t ON c.parent_id = t.id
)
SELECT * FROM thread;
```

**Scenario 2: Product taxonomy (updated weekly, queried constantly)**

Choose **nested sets** or **closure table**. The taxonomy changes once a week but "all products in Electronics" runs thousands of times per day:

```sql
-- Nested sets: O(1) subtree read, no recursion
SELECT * FROM categories WHERE lft BETWEEN 2 AND 11;

-- Closure table: O(1) subtree read via join
SELECT c.* FROM categories c
JOIN category_paths cp ON c.id = cp.descendant_id
WHERE cp.ancestor_id = 5;
```

If the taxonomy needs referential integrity, prefer closure table. If pure read speed matters most, prefer nested sets.

**Scenario 3: RBAC permission hierarchy (moderate changes, frequent "is ancestor?" checks)**

Choose **closure table**. The "is X an ancestor of Y?" check is a single-row existence query:

```sql
SELECT EXISTS(
  SELECT 1 FROM role_paths
  WHERE ancestor_id = 10 AND descendant_id = 42
);
-- 0.2ms with index
```

### Anti-Patterns

1. **Choosing a model without analyzing read/write ratio.** The decision matrix above exists for a reason. Profile your workload before committing.
2. **Using nested sets for write-heavy hierarchies.** O(n) per insert is catastrophic for high-write workloads. Use adjacency list.
3. **Using adjacency list when subtree queries dominate and depth is large.** Recursive CTE performance degrades linearly with depth. For trees deeper than 20 levels with frequent subtree reads, consider closure table.
4. **Using materialized path without ltree extension.** Manual string parsing (`LIKE '/1/5/%'`) is fragile, prone to injection, and cannot use specialized indexes. Use `ltree` on PostgreSQL.
5. **Mixing models without documenting which queries use which.** If you maintain both adjacency list and closure table, document that writes go through parent_id and reads go through the closure table.

### PostgreSQL Specifics

**ltree extension** for materialized path -- the recommended default for PostgreSQL users who need hierarchy queries without closure table complexity:

```sql
CREATE EXTENSION ltree;

CREATE TABLE categories (
  id   serial PRIMARY KEY,
  name varchar NOT NULL,
  path ltree NOT NULL
);

CREATE INDEX idx_categories_path ON categories USING gist (path);

-- Insert with path
INSERT INTO categories (name, path) VALUES
  ('Electronics', 'electronics'),
  ('Computers', 'electronics.computers'),
  ('Laptops', 'electronics.computers.laptops');
```

**ltree operators:**

- `@>` ancestor check: `'electronics' @> 'electronics.computers.laptops'` -- true
- `<@` descendant check: `'electronics.computers.laptops' <@ 'electronics'` -- true
- `~` regex match: `path ~ '*.computers.*'`
- `?` lquery match: `path ? 'electronics.*{1,2}'` -- depth 1-2 under electronics

**GiST index on path** enables fast ancestor/descendant checks without joins or recursion. `ltree` is often the best balance of simplicity and performance for PostgreSQL hierarchies.

## Details

### Advanced Topics

**Hybrid models** combine two approaches for different query patterns:

- **Adjacency list + closure table:** parent_id for simple parent lookups and O(1) inserts; closure table for subtree and ancestor queries. Maintain both on write.
- **Adjacency list + materialized path:** parent_id for writes; path column (ltree or VARCHAR) for subtree reads. Rebuild paths in batch.

**Migration between models:**

- Adjacency list to closure table: recursive CTE computes all ancestor-descendant pairs
- Adjacency list to nested sets: recursive traversal assigns lft/rgt numbers
- Any model to materialized path: recursive CTE builds path strings

**Depth limits and performance cliffs:**

- Adjacency list: linear degradation past depth 20-30 (each recursive step is a query)
- Nested sets: no depth performance impact (range query regardless of depth)
- Closure table: no depth performance impact (single join), but storage grows with depth
- Materialized path: path string length grows linearly; ltree supports up to 65535 labels

### Engine Differences

MySQL lacks the `ltree` extension. Materialized path on MySQL requires:

- VARCHAR column with string path like `/1/5/12/`
- B-tree index with prefix matching: `WHERE path LIKE '/1/5/%'`
- No specialized operators -- all path logic is string manipulation
- Limited to B-tree prefix scans (no GiST)

**MySQL recommendations by workload:**

- Write-heavy: adjacency list with `WITH RECURSIVE` (MySQL 8.0+)
- Read-heavy: closure table (works identically in MySQL)
- Simple hierarchy: adjacency list is usually sufficient given MySQL 8.0's CTE support

MySQL nested sets work identically to PostgreSQL but lack exclusion constraints for integrity validation.

### Real-World Case Studies

**Three companies, three choices:**

1. **Slack-like messaging:** Adjacency list. 1B messages total, threads rarely exceed depth 5. Insert latency under 1ms. Recursive CTE for thread display adds 3-8ms -- acceptable since threads are loaded on-demand.

2. **Amazon-like product taxonomy:** Nested sets. 200K categories, rebuilt nightly from the merchandising system. Subtree queries ("all products in Electronics") complete in under 1ms. The nightly rebuild (full renumbering) takes 4 seconds.

3. **AWS-like IAM:** Closure table. 500K permission nodes in a 15-level hierarchy. "Is X an ancestor of Y?" completes in 0.2ms. Node additions average 50/day -- each insert copies ~15 closure rows. The 1.5M closure row overhead (3x node count) is justified by the 40x speedup on ancestry checks.

## Source

- [Bill Karwin -- SQL Antipatterns (Trees chapter)](https://pragprog.com/titles/bksqla/sql-antipatterns/)
- [PostgreSQL ltree](https://www.postgresql.org/docs/current/ltree.html)

## Process

1. Read the decision matrix to understand the tradeoffs of each hierarchy model.
2. Profile your read/write ratio and dominant query patterns to select the appropriate model.
3. Verify the selected model meets performance requirements with EXPLAIN ANALYZE on representative queries.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-adjacency-list, db-nested-sets, db-closure-table, db-graph-in-relational

## Success Criteria

- Hierarchy model is selected based on measured read/write ratio and query patterns, not defaulting to adjacency list for every case.
- The selection decision is documented with rationale.
- Performance is validated with EXPLAIN ANALYZE on the dominant query pattern.
