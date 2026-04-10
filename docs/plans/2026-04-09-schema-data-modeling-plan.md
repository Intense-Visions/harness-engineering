# Plan: Database Design Skills -- Phase 3: Schema and Data Modeling

**Date:** 2026-04-09
**Spec:** docs/changes/database-design-skills/proposal.md
**Estimated tasks:** 12
**Estimated time:** ~55 minutes

## Goal

Author 11 database knowledge skills covering Schema Patterns (6) and Data Modeling Patterns (5) that teach durable data structure design patterns for relational databases.

## Observable Truths (Acceptance Criteria)

1. When `ls agents/skills/claude-code/ | grep "^db-"` is run, 29 directories are listed (18 from Phase 1+2 + 11 new: `db-polymorphic-associations`, `db-entity-attribute-value`, `db-adjacency-list`, `db-nested-sets`, `db-closure-table`, `db-temporal-data`, `db-time-series`, `db-hierarchical-data`, `db-graph-in-relational`, `db-document-in-relational`, `db-audit-trail`).
2. Each new skill.yaml passes schema validation: `type: knowledge`, empty `tools: []`, `cognitive_mode: advisory-guide`, `tier: 3`, `state.persistent: false`, `platforms: [claude-code, gemini-cli, cursor, codex]`, and a `metadata.upstream` provenance link.
3. Each new SKILL.md contains all required sections: `## When to Use`, `## Instructions` (with `### Key Concepts`, `### Worked Example`, `### Anti-Patterns`, `### PostgreSQL Specifics`), `## Details` (with `### Advanced Topics`, `### Engine Differences`, `### Real-World Case Studies`), `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
4. Each SKILL.md is 150-250 lines with PostgreSQL-primary examples and at least one MySQL callout where behavior differs materially.
5. No SKILL.md contains ORM-specific syntax (no Prisma/Drizzle code).
6. Each skill.yaml has `related_skills` cross-referencing other `db-*` skills (Phase 1-3) and relevant ORM skills where applicable.
7. When `harness validate` is run, validation passes.

## File Map

```
CREATE agents/skills/claude-code/db-polymorphic-associations/skill.yaml
CREATE agents/skills/claude-code/db-polymorphic-associations/SKILL.md
CREATE agents/skills/claude-code/db-entity-attribute-value/skill.yaml
CREATE agents/skills/claude-code/db-entity-attribute-value/SKILL.md
CREATE agents/skills/claude-code/db-adjacency-list/skill.yaml
CREATE agents/skills/claude-code/db-adjacency-list/SKILL.md
CREATE agents/skills/claude-code/db-nested-sets/skill.yaml
CREATE agents/skills/claude-code/db-nested-sets/SKILL.md
CREATE agents/skills/claude-code/db-closure-table/skill.yaml
CREATE agents/skills/claude-code/db-closure-table/SKILL.md
CREATE agents/skills/claude-code/db-temporal-data/skill.yaml
CREATE agents/skills/claude-code/db-temporal-data/SKILL.md
CREATE agents/skills/claude-code/db-time-series/skill.yaml
CREATE agents/skills/claude-code/db-time-series/SKILL.md
CREATE agents/skills/claude-code/db-hierarchical-data/skill.yaml
CREATE agents/skills/claude-code/db-hierarchical-data/SKILL.md
CREATE agents/skills/claude-code/db-graph-in-relational/skill.yaml
CREATE agents/skills/claude-code/db-graph-in-relational/SKILL.md
CREATE agents/skills/claude-code/db-document-in-relational/skill.yaml
CREATE agents/skills/claude-code/db-document-in-relational/SKILL.md
CREATE agents/skills/claude-code/db-audit-trail/skill.yaml
CREATE agents/skills/claude-code/db-audit-trail/SKILL.md
```

_Skeleton not produced -- rigor level is fast._

## Tasks

All 11 skill-authoring tasks (Tasks 1-11) are **parallelizable** -- they have no dependencies on each other. Task 12 (validation) depends on all 11 completing.

---

### Task 1: Author db-polymorphic-associations skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 2-11)
**Files:** `agents/skills/claude-code/db-polymorphic-associations/skill.yaml`, `agents/skills/claude-code/db-polymorphic-associations/SKILL.md`

1. Create directory `agents/skills/claude-code/db-polymorphic-associations/`

2. Create `agents/skills/claude-code/db-polymorphic-associations/skill.yaml`:

```yaml
name: db-polymorphic-associations
version: '1.0.0'
description: Single-table inheritance, class-table inheritance, and shared foreign key patterns for polymorphic data
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-first-normal-form
  - db-third-normal-form
  - db-denormalization
  - db-entity-attribute-value
  - db-document-in-relational
  - prisma-schema-design
  - drizzle-schema-definition
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - polymorphic-association
  - single-table-inheritance
  - class-table-inheritance
  - concrete-table-inheritance
  - discriminator-column
  - shared-foreign-key
metadata:
  author: community
  upstream: 'martinfowler.com/eaaCatalog/singleTableInheritance.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-polymorphic-associations/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Polymorphic Associations`
- Quote: one-sentence summary -- modeling inheritance hierarchies and type-varying relationships in relational databases using STI, CTI, or shared FK patterns
- `## When to Use`: entities sharing a common interface but with type-specific columns (e.g., notifications targeting users, teams, or organizations), content types with shared metadata but different payloads, payment methods (card, bank, wallet) with different fields
- `## Instructions`:
  - `### Key Concepts`: Three strategies for modeling "a row can reference one of several entity types":
    1. **Single-Table Inheritance (STI)**: One table, discriminator column (`type`), nullable type-specific columns. `CREATE TABLE vehicles (id serial PRIMARY KEY, type varchar NOT NULL, make varchar, payload_capacity_kg int, passenger_count int);` -- trucks use payload_capacity_kg, cars use passenger_count. Fast queries (no joins), but NULLs proliferate and CHECK constraints become complex.
    2. **Class-Table Inheritance (CTI)**: Shared base table + per-type tables joined by FK. `vehicles` has common columns; `trucks` and `cars` each have a `vehicle_id FK` and type-specific columns. Clean normalization, enforced constraints, but reads require JOINs.
    3. **Concrete-Table Inheritance**: No shared table -- each type gets its own table with duplicated common columns. Simplest queries per type, but cross-type queries require UNION ALL. Violates DRY at the schema level.
    4. **Polymorphic FK anti-pattern**: `commentable_type + commentable_id` without a real FK constraint. Explain why this breaks referential integrity and what to use instead (exclusive arcs or an intermediate association table).
  - `### Worked Example`: Content management system with `comments` that can belong to `posts`, `videos`, or `photos`. Show the anti-pattern (`commentable_type/commentable_id`), then the correct CTI approach with an intermediate `commentable_items` table and exclusive-arc CHECK constraint: `CHECK ((post_id IS NOT NULL)::int + (video_id IS NOT NULL)::int + (photo_id IS NOT NULL)::int = 1)`. Show the query to fetch comments for a post with the JOIN.
  - `### Anti-Patterns`: polymorphic FK without real constraint (`commentable_type/commentable_id` -- no referential integrity, no cascading deletes, no index efficiency), STI with more than 5-6 type-specific columns (table becomes mostly NULL), using EAV when polymorphic associations would be cleaner, not adding CHECK constraints on exclusive arcs.
  - `### PostgreSQL Specifics`: Table inheritance (`CREATE TABLE trucks INHERITS (vehicles)`) -- PostgreSQL-specific feature that maps directly to CTI. Limitations: foreign keys do not propagate to child tables, unique constraints are per-table not across hierarchy. `ONLY` keyword to query just the parent table. PostgreSQL 10+ partitioning supersedes INHERITS for most new designs.
- `## Details`:
  - `### Advanced Topics`: using JSONB for type-specific columns (hybrid approach -- see db-document-in-relational), exclusive-arc constraint patterns with generated columns, performance comparison of STI vs CTI at scale (STI wins for reads, CTI wins for writes and constraint enforcement).
  - `### Engine Differences`: MySQL lacks table inheritance. STI and CTI must be implemented manually with JOINs and application logic. MySQL CHECK constraints are enforced since 8.0.16 (earlier versions parse but ignore them). MySQL ENUM can serve as a discriminator column with stricter type enforcement than VARCHAR.
  - `### Real-World Case Studies`: SaaS notification system with 6 target types. Started with polymorphic FK (`target_type/target_id`), discovered orphaned rows after a table rename. Migrated to CTI with exclusive-arc constraint. Orphan rate dropped to zero, query performance unchanged (JOIN overhead < 1ms on indexed FKs).
- `## Source`: Martin Fowler -- Patterns of Enterprise Application Architecture (STI/CTI/Concrete), PostgreSQL inheritance docs
- `## Process`: standard 3-step (read, apply, verify)
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: polymorphic relationships use real FK constraints, correct inheritance strategy chosen for the access pattern

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-polymorphic-associations/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-polymorphic-associations knowledge skill`

---

### Task 2: Author db-entity-attribute-value skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1, 3-11)
**Files:** `agents/skills/claude-code/db-entity-attribute-value/skill.yaml`, `agents/skills/claude-code/db-entity-attribute-value/SKILL.md`

1. Create directory `agents/skills/claude-code/db-entity-attribute-value/`

2. Create `agents/skills/claude-code/db-entity-attribute-value/skill.yaml`:

```yaml
name: db-entity-attribute-value
version: '1.0.0'
description: EAV pattern for dynamic attributes -- when justified, why usually avoided, and alternatives
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-polymorphic-associations
  - db-document-in-relational
  - db-first-normal-form
  - db-denormalization
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - EAV
  - entity-attribute-value
  - dynamic-schema
  - key-value
  - sparse-columns
  - metadata-table
metadata:
  author: community
  upstream: 'en.wikipedia.org/wiki/Entity%E2%80%93attribute%E2%80%93value_model'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-entity-attribute-value/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Entity-Attribute-Value (EAV)`
- Quote: one-sentence summary -- a schema pattern for storing dynamic, user-defined attributes as rows instead of columns, usually avoided in favor of JSONB or polymorphic alternatives
- `## When to Use`: truly user-defined attributes where the attribute set is unknown at design time (e.g., product catalog with 10K+ varying attributes), medical records with thousands of possible observation types, legacy systems where the EAV pattern is already entrenched
- `## Instructions`:
  - `### Key Concepts`: EAV stores data as `(entity_id, attribute_name, attribute_value)` triples instead of columns. Show the schema: `CREATE TABLE product_attributes (product_id int REFERENCES products(id), attribute_name varchar NOT NULL, attribute_value text, PRIMARY KEY (product_id, attribute_name));`. Explain the core tradeoff: maximum flexibility for schema evolution, but loss of type safety, constraint enforcement, and query efficiency. Pivoting EAV rows back to columns for reporting requires complex crosstab queries. Explain why EAV violates First Normal Form (values of different types in one column) and makes it impossible to enforce NOT NULL, CHECK, or FK constraints per attribute.
  - `### Worked Example`: E-commerce product catalog. Products have standard columns (name, price, sku) in a `products` table. Custom attributes (color, size, wattage, material) stored in EAV `product_attributes` table. Show: (1) inserting attributes, (2) querying "all products where color = 'red' AND size = 'large'" -- requires self-join or crosstab, (3) the equivalent query with JSONB `WHERE attrs->>'color' = 'red' AND attrs->>'size' = 'large'` -- dramatically simpler. Conclude with the recommendation: prefer JSONB for most EAV use cases.
  - `### Anti-Patterns`: using EAV for attributes that are known at design time (just add columns), storing typed data as text without validation, not adding a `value_type` discriminator column when EAV is unavoidable, using EAV when JSONB would serve the same purpose with better indexing and simpler queries, querying EAV without proper indexes on (attribute_name, attribute_value).
  - `### PostgreSQL Specifics`: JSONB as the primary alternative -- supports GIN indexing, containment operators (`@>`), key-exists checks, and partial indexes on JSON paths. `CREATE INDEX ON products USING gin (attrs jsonb_path_ops);` enables fast attribute queries. PostgreSQL hstore extension as a lightweight key-value alternative to full JSONB.
- `## Details`:
  - `### Advanced Topics`: crosstab queries with `tablefunc` extension (`SELECT * FROM crosstab(...)`), typed EAV with separate value tables per type (entity_id, attribute_id, int_value / text_value / date_value), performance at scale (EAV with 100M+ rows -- indexing strategies, partitioning by entity type).
  - `### Engine Differences`: MySQL 5.7+ supports JSON columns but with weaker indexing than PostgreSQL JSONB. MySQL requires generated columns + B-tree indexes for JSON path queries: `ALTER TABLE products ADD COLUMN color varchar GENERATED ALWAYS AS (attrs->>'$.color') VIRTUAL; CREATE INDEX ON products(color);`. MySQL lacks GIN indexes and containment operators.
  - `### Real-World Case Studies`: Healthcare system with 50K distinct observation types. Original EAV schema with 2B rows, queries taking 30+ seconds for patient timelines. Migration path: kept EAV for rare attributes, moved top-100 attributes (95% of queries) to dedicated columns. Query time dropped from 30s to 200ms for common lookups while preserving flexibility for rare attributes.
- `## Source`: SQL Antipatterns by Bill Karwin (EAV chapter), PostgreSQL JSON docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: EAV only used when attribute set is genuinely unbounded, JSONB preferred for most dynamic-attribute needs

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-entity-attribute-value/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-entity-attribute-value knowledge skill`

---

### Task 3: Author db-adjacency-list skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-2, 4-11)
**Files:** `agents/skills/claude-code/db-adjacency-list/skill.yaml`, `agents/skills/claude-code/db-adjacency-list/SKILL.md`

1. Create directory `agents/skills/claude-code/db-adjacency-list/`

2. Create `agents/skills/claude-code/db-adjacency-list/skill.yaml`:

```yaml
name: db-adjacency-list
version: '1.0.0'
description: Parent-child hierarchies via self-referencing foreign key, recursive CTEs, and depth queries
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-nested-sets
  - db-closure-table
  - db-hierarchical-data
  - db-query-rewriting
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - adjacency-list
  - parent-child
  - self-referencing-fk
  - recursive-CTE
  - hierarchy
  - tree-structure
  - WITH-RECURSIVE
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/queries-with.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-adjacency-list/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Adjacency List`
- Quote: one-sentence summary -- the simplest hierarchical model where each row stores a reference to its parent, traversed with recursive CTEs
- `## When to Use`: organizational charts, category trees, comment threads, file system structures, any hierarchy where writes are frequent and full-tree reads are uncommon
- `## Instructions`:
  - `### Key Concepts`: Each row has a `parent_id` FK pointing to the same table. Root nodes have `parent_id IS NULL`. Schema: `CREATE TABLE categories (id serial PRIMARY KEY, name varchar NOT NULL, parent_id int REFERENCES categories(id));`. Direct parent/child queries are trivial: `WHERE parent_id = ?`. Subtree queries require recursive CTEs: `WITH RECURSIVE tree AS (SELECT * FROM categories WHERE id = ? UNION ALL SELECT c.* FROM categories c JOIN tree t ON c.parent_id = t.id) SELECT * FROM tree;`. Ancestor queries reverse the direction: join on `t.parent_id = c.id`. Add a `depth` counter in the recursive CTE for level-aware formatting.
  - `### Worked Example`: Category tree for an e-commerce site. Show: (1) schema creation, (2) inserting 3 levels of categories, (3) recursive CTE to fetch all subcategories of "Electronics", (4) ancestor query from "USB-C Cables" up to root, (5) depth-limited query (max 3 levels) using `WHERE depth < 3` in the recursive term. Show EXPLAIN ANALYZE output demonstrating CTE Scan behavior.
  - `### Anti-Patterns`: using multiple JOINs for fixed-depth trees instead of recursive CTE (breaks when depth changes), not indexing `parent_id` (recursive CTE does a lookup per level), infinite loop risk without cycle detection (`CYCLE` clause in PostgreSQL 14+ or manual `path` tracking), fetching the entire tree when only a subtree is needed.
  - `### PostgreSQL Specifics`: `WITH RECURSIVE ... CYCLE id SET is_cycle USING path` (PostgreSQL 14+) for automatic cycle detection. `SEARCH BREADTH FIRST BY id SET ordercol` and `SEARCH DEPTH FIRST BY id SET ordercol` for controlling traversal order. Index on `parent_id` is critical -- without it, each recursive step does a Seq Scan.
- `## Details`:
  - `### Advanced Topics`: materialized path hybrid (storing `path` column like `/1/5/12/` alongside parent_id for fast subtree queries via `LIKE '/1/5/%'`), `ltree` extension in PostgreSQL for native path operations, performance characteristics (O(depth) for subtree query, O(n) worst case for deep/wide trees), combining with closure table for read-heavy workloads.
  - `### Engine Differences`: MySQL 8.0+ supports `WITH RECURSIVE` (earlier versions require stored procedures or application-layer recursion). MySQL lacks `CYCLE` and `SEARCH` clauses -- cycle detection must be done manually with a path column. MySQL recursive CTE has a `cte_max_recursion_depth` limit (default 1000, configurable).
  - `### Real-World Case Studies`: Reddit-style comment threading with 50M comments, max depth 20. Adjacency list with recursive CTE fetches a full thread (avg 200 comments) in 8ms with index on `(parent_id, created_at)`. Attempted migration to nested sets abandoned due to write amplification on frequent comment insertions.
- `## Source`: PostgreSQL WITH queries docs, SQL Antipatterns by Bill Karwin (Naive Trees chapter)
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: adjacency list used with recursive CTEs, parent_id indexed, cycle detection in place for untrusted data

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-adjacency-list/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-adjacency-list knowledge skill`

---

### Task 4: Author db-nested-sets skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-3, 5-11)
**Files:** `agents/skills/claude-code/db-nested-sets/skill.yaml`, `agents/skills/claude-code/db-nested-sets/SKILL.md`

1. Create directory `agents/skills/claude-code/db-nested-sets/`

2. Create `agents/skills/claude-code/db-nested-sets/skill.yaml`:

```yaml
name: db-nested-sets
version: '1.0.0'
description: Left/right numbering for hierarchies -- fast reads, expensive writes, and when to use
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-adjacency-list
  - db-closure-table
  - db-hierarchical-data
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - nested-sets
  - left-right
  - MPTT
  - modified-preorder-tree-traversal
  - hierarchy
  - tree-reads
metadata:
  author: community
  upstream: 'en.wikipedia.org/wiki/Nested_set_model'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-nested-sets/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Nested Sets`
- Quote: one-sentence summary -- encoding hierarchy position with left/right boundary numbers for O(1) subtree and ancestor queries at the cost of expensive writes
- `## When to Use`: read-heavy hierarchies that rarely change (product category taxonomies, geographic region trees, organizational hierarchies updated quarterly), reporting that needs subtree aggregation without recursion
- `## Instructions`:
  - `### Key Concepts`: Each node stores `lft` and `rgt` values assigned via modified preorder tree traversal (MPTT). Schema: `CREATE TABLE categories (id serial PRIMARY KEY, name varchar NOT NULL, lft int NOT NULL, rgt int NOT NULL);`. Key queries become simple range checks: subtree of node X = `WHERE lft BETWEEN X.lft AND X.rgt`; ancestors of node X = `WHERE lft < X.lft AND rgt > X.rgt`; leaf nodes = `WHERE rgt = lft + 1`; subtree size = `(rgt - lft - 1) / 2`. Inserts require updating all nodes with `lft` or `rgt` >= insertion point (O(n) writes). Deletes similarly require renumbering.
  - `### Worked Example`: Product taxonomy. Show: (1) a 3-level tree with assigned lft/rgt values (diagram with numbers), (2) "all subcategories of Electronics" as `WHERE lft BETWEEN 2 AND 11` (no recursion, no joins), (3) "all ancestors of USB Cables" as `WHERE lft < 8 AND rgt > 9 ORDER BY lft`, (4) inserting a new category -- show the UPDATE statements that shift all rgt/lft values, wrapping in a transaction for atomicity. Show the cost: inserting one node updates O(n) rows.
  - `### Anti-Patterns`: using nested sets for frequently changing hierarchies (every insert/delete/move touches O(n) rows), not wrapping modifications in transactions (partial renumbering corrupts the tree), not adding indexes on `(lft, rgt)` (the whole point is fast range queries), mixing adjacency list queries with nested sets without maintaining both.
  - `### PostgreSQL Specifics`: Composite index `CREATE INDEX ON categories (lft, rgt);` for subtree queries. `SELECT FOR UPDATE` on the category table during modifications to prevent concurrent renumbering conflicts. Alternatively, use advisory locks: `SELECT pg_advisory_xact_lock(1)` before any nested set modification.
- `## Details`:
  - `### Advanced Topics`: gap-based numbering (leave gaps between lft/rgt to reduce renumbering frequency), combining nested sets with adjacency list (store both `parent_id` and `lft/rgt` -- adjacency list for writes, nested sets for reads), nested intervals (rational numbers instead of integers, avoids renumbering entirely but adds complexity).
  - `### Engine Differences`: MySQL nested sets work identically at the SQL level. MySQL's default transaction isolation (REPEATABLE READ) provides stronger guarantees during renumbering than PostgreSQL's default (READ COMMITTED) -- but explicit locking is still recommended in both. MySQL lacks advisory locks -- use `GET_LOCK()` instead.
  - `### Real-World Case Studies`: Retail product catalog with 50K categories, updated weekly via batch import. Nested sets enabled "all products in Electronics and subcategories" aggregation in 2ms vs 45ms with recursive CTE. Weekly batch rebuild of the entire tree (full renumbering) takes 3s -- acceptable for weekly cadence.
- `## Source`: Joe Celko -- Trees and Hierarchies in SQL, Wikipedia Nested Set Model
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: nested sets used only for read-heavy/write-rare hierarchies, modifications wrapped in transactions with appropriate locking

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-nested-sets/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-nested-sets knowledge skill`

---

### Task 5: Author db-closure-table skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-4, 6-11)
**Files:** `agents/skills/claude-code/db-closure-table/skill.yaml`, `agents/skills/claude-code/db-closure-table/SKILL.md`

1. Create directory `agents/skills/claude-code/db-closure-table/`

2. Create `agents/skills/claude-code/db-closure-table/skill.yaml`:

```yaml
name: db-closure-table
version: '1.0.0'
description: Ancestor-descendant pair table for fast path queries and flexible hierarchy operations
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-adjacency-list
  - db-nested-sets
  - db-hierarchical-data
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - closure-table
  - ancestor-descendant
  - path-query
  - transitive-closure
  - hierarchy
  - tree-operations
metadata:
  author: community
  upstream: 'dirk.blog/2008/01/04/closure-tables/'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-closure-table/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Closure Table`
- Quote: one-sentence summary -- storing all ancestor-descendant pairs in a separate table for O(1) subtree and ancestor lookups with manageable write costs
- `## When to Use`: hierarchies needing both fast reads and moderate write performance (permission systems, category trees with frequent updates, threaded discussions), when you need to query ancestors, descendants, or path length without recursion
- `## Instructions`:
  - `### Key Concepts`: Two tables: the node table and a closure table storing every ancestor-descendant pair. Schema: `CREATE TABLE categories (id serial PRIMARY KEY, name varchar NOT NULL); CREATE TABLE category_paths (ancestor_id int REFERENCES categories(id), descendant_id int REFERENCES categories(id), depth int NOT NULL DEFAULT 0, PRIMARY KEY (ancestor_id, descendant_id));`. Every node has a self-referencing row (ancestor=self, descendant=self, depth=0). Queries: subtree = `WHERE ancestor_id = ? AND depth > 0`; ancestors = `WHERE descendant_id = ? AND depth > 0`; direct children = `WHERE ancestor_id = ? AND depth = 1`; path length between two nodes = single row lookup. Inserts: add self-row + copy ancestor rows of parent with depth+1. Deletes: remove all rows where descendant_id is in the subtree. Moves: delete subtree paths, re-insert under new parent.
  - `### Worked Example`: Permission hierarchy. Show: (1) creating 4-level org chart, (2) populating closure table (show all generated pairs), (3) "all descendants of Engineering" = `SELECT c.* FROM categories c JOIN category_paths cp ON c.id = cp.descendant_id WHERE cp.ancestor_id = 5 AND cp.depth > 0`, (4) "is user X an ancestor of team Y?" = single-row existence check, (5) inserting a new team under Engineering -- show the INSERT that copies ancestor paths. Contrast query simplicity with adjacency list recursive CTE.
  - `### Anti-Patterns`: forgetting the self-referencing row (depth=0) -- breaks descendant-count queries, not using a depth column (forces path reconstruction for level queries), storing only direct parent-child pairs (defeats the purpose -- that is just adjacency list), not indexing both `(ancestor_id, depth)` and `(descendant_id, depth)`.
  - `### PostgreSQL Specifics`: Use `INSERT INTO category_paths SELECT cp.ancestor_id, NEW_ID, cp.depth + 1 FROM category_paths cp WHERE cp.descendant_id = PARENT_ID UNION ALL SELECT NEW_ID, NEW_ID, 0;` for atomic inserts. Partial index `CREATE INDEX ON category_paths (ancestor_id) WHERE depth = 1;` for direct-children queries. Foreign key with `ON DELETE CASCADE` on the closure table to auto-clean when nodes are deleted.
- `## Details`:
  - `### Advanced Topics`: storage overhead analysis (a balanced tree of N nodes produces O(N log N) closure rows; a degenerate chain produces O(N^2)), comparison with materialized path (`ltree` in PostgreSQL), hybrid approach storing both adjacency list parent_id and closure table for different query patterns, batch operations (subtree move as DELETE + INSERT).
  - `### Engine Differences`: MySQL closure tables work identically. MySQL lacks partial indexes -- use a regular composite index `(ancestor_id, depth)` instead. MySQL's `INSERT ... SELECT` works the same way for populating closure rows. Performance difference: PostgreSQL's hash joins on the closure table outperform MySQL's nested loop joins for large subtree queries.
  - `### Real-World Case Studies`: RBAC permission system with 200K roles in a 15-level hierarchy. Checking "does user X have permission Y?" requires ancestor traversal. With adjacency list + recursive CTE: 12ms avg. With closure table: 0.3ms (single indexed join). Closure table added 1.2M rows (6x the node count) but the read performance justified the storage.
- `## Source`: Bill Karwin -- SQL Antipatterns (Closure Table chapter), Dirk Riehle -- Closure Tables
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: closure table populated with self-referencing rows, both ancestor and descendant indexes present, insert/delete operations maintain closure integrity

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-closure-table/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-closure-table knowledge skill`

---

### Task 6: Author db-temporal-data skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-5, 7-11)
**Files:** `agents/skills/claude-code/db-temporal-data/skill.yaml`, `agents/skills/claude-code/db-temporal-data/SKILL.md`

1. Create directory `agents/skills/claude-code/db-temporal-data/`

2. Create `agents/skills/claude-code/db-temporal-data/skill.yaml`:

```yaml
name: db-temporal-data
version: '1.0.0'
description: Valid-time, transaction-time, and bitemporal tables for tracking data as it changes over time
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-audit-trail
  - db-time-series
  - db-denormalization
  - events-event-sourcing
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - temporal
  - valid-time
  - transaction-time
  - bitemporal
  - slowly-changing-dimension
  - SCD
  - tstzrange
  - time-travel-query
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/rangetypes.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-temporal-data/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Temporal Data`
- Quote: one-sentence summary -- modeling when facts are true (valid-time), when they were recorded (transaction-time), or both (bitemporal), enabling time-travel queries and regulatory audit
- `## When to Use`: insurance policies with effective dates, price histories, employee role changes, regulatory requirements to reconstruct past states, any domain where "what was true at time T?" is a query requirement
- `## Instructions`:
  - `### Key Concepts`: Three temporal dimensions:
    1. **Valid-time** (application time): when the fact is true in the real world. Columns: `valid_from`, `valid_to`. Example: employee salary effective 2024-01-01 to 2024-12-31.
    2. **Transaction-time** (system time): when the row was stored in the database. Columns: `recorded_at`, `superseded_at`. Tracks the database's knowledge -- never manually edited.
    3. **Bitemporal**: both dimensions combined. Answers "what did the system believe was true about time T, as of database time S?"
       Slowly Changing Dimensions (SCD) types: Type 1 (overwrite), Type 2 (new row with date range -- most common), Type 3 (previous/current columns), Type 6 (hybrid). Show SCD Type 2 schema using PostgreSQL range types: `CREATE TABLE employee_salaries (id serial, employee_id int, salary numeric, valid_range tstzrange NOT NULL, EXCLUDE USING gist (employee_id WITH =, valid_range WITH &&));`. The exclusion constraint prevents overlapping valid periods.
  - `### Worked Example`: Insurance policy pricing. Show: (1) SCD Type 2 table with `tstzrange` valid period, (2) inserting initial price, (3) "changing" price by closing old range and inserting new row, (4) querying "what was the price on 2024-06-15?" using `WHERE valid_range @> '2024-06-15'::timestamptz`, (5) bitemporal query "what did we think the price was on June 15, as recorded before the July correction?" adding `AND recorded_at < '2024-07-01'`.
  - `### Anti-Patterns`: using `updated_at` as a substitute for temporal modeling (loses history), overlapping valid periods without exclusion constraints, storing temporal data without range types (managing two columns manually is error-prone), using SCD Type 1 (overwrite) when audit trail is required, `NULL` for "current" end date instead of `upper(valid_range) IS NULL` with range type infinity.
  - `### PostgreSQL Specifics`: Range types (`tstzrange`, `daterange`) with built-in operators: `@>` (contains), `&&` (overlaps), `-|-` (adjacent). GiST index for range columns: `CREATE INDEX ON policies USING gist (valid_range);`. Exclusion constraints with `btree_gist` extension for preventing overlaps. SQL:2011 temporal support is partially implemented in PostgreSQL (system-versioned tables are not yet native -- use triggers or temporal_tables extension).
- `## Details`:
  - `### Advanced Topics`: SQL:2011 temporal standard (`FOR SYSTEM_TIME AS OF`), temporal_tables PostgreSQL extension, gap detection queries (`WHERE NOT EXISTS` with range adjacency), temporal joins (`WHERE a.valid_range && b.valid_range`), partitioning temporal tables by valid_from for archival.
  - `### Engine Differences`: MySQL lacks range types and exclusion constraints. Temporal data requires `valid_from DATETIME` and `valid_to DATETIME` columns with application-level overlap prevention. MySQL 8.0 does not support SQL:2011 temporal tables. MariaDB 10.3+ supports system-versioned tables (`WITH SYSTEM VERSIONING`) -- the only major open-source engine with native temporal support.
  - `### Real-World Case Studies`: Financial compliance system tracking 10M account balances. Regulators require reconstructing balance at any historical date. SCD Type 2 with `tstzrange` and GiST index. Point-in-time queries answer "what was balance on date X?" in 3ms. Bitemporal extension added after an audit found late-arriving corrections -- enabled "what did we report on date X, before the correction on date Y?"
- `## Source`: PostgreSQL range types docs, Snodgrass -- Developing Time-Oriented Database Applications
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: temporal tables use range types with exclusion constraints, SCD type chosen matches business requirements, point-in-time queries verified

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-temporal-data/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-temporal-data knowledge skill`

---

### Task 7: Author db-time-series skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-6, 8-11)
**Files:** `agents/skills/claude-code/db-time-series/skill.yaml`, `agents/skills/claude-code/db-time-series/SKILL.md`

1. Create directory `agents/skills/claude-code/db-time-series/`

2. Create `agents/skills/claude-code/db-time-series/skill.yaml`:

```yaml
name: db-time-series
version: '1.0.0'
description: Append-only tables, time-based partitioning, retention policies, and TimescaleDB patterns
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-temporal-data
  - db-audit-trail
  - db-btree-index
  - db-composite-index
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - time-series
  - append-only
  - partitioning
  - retention
  - TimescaleDB
  - hypertable
  - downsampling
  - continuous-aggregate
metadata:
  author: community
  upstream: 'docs.timescale.com/use-timescale/latest/hypertables/'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-time-series/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Time-Series Data`
- Quote: one-sentence summary -- designing append-heavy tables for metrics, events, and logs with time-based partitioning, retention policies, and efficient aggregation
- `## When to Use`: IoT sensor data, application metrics, financial tick data, server logs, any workload that is append-heavy with time-ordered queries and eventual data expiry
- `## Instructions`:
  - `### Key Concepts`: Time-series workloads are characterized by: (1) append-only or append-mostly writes, (2) queries filter by time range, (3) recent data queried more than old data, (4) data has a retention period. Schema design: `CREATE TABLE metrics (time timestamptz NOT NULL, device_id int NOT NULL, temperature float, humidity float) PARTITION BY RANGE (time);`. Key design choices: partition interval (match query granularity -- daily for dashboards, monthly for reports), chunk size (target 25% of available memory per partition for cache efficiency), index strategy (BRIN index on time column -- much smaller than B-tree for sequential data), retention via `DROP` partition (instant vs DELETE which creates dead tuples).
  - `### Worked Example`: IoT sensor monitoring. Show: (1) partitioned table with monthly partitions, (2) BRIN index on time: `CREATE INDEX ON metrics USING brin (time);`, (3) composite B-tree on `(device_id, time)` for per-device queries, (4) time-range query with partition pruning shown in EXPLAIN (`Partitions removed: 10`), (5) retention by dropping old partitions: `DROP TABLE metrics_2023_01;`, (6) continuous aggregation for dashboards: materialized view with hourly rollups.
  - `### Anti-Patterns`: using a single unpartitioned table for time-series (bloat, vacuum pressure, slow range queries), DELETE for retention instead of DROP PARTITION (dead tuples, vacuum overhead), B-tree index on time column for sequential append data (BRIN is 100x smaller), not aligning partition boundaries with query patterns, updating time-series rows (breaks append-only assumption, causes HOT update failures).
  - `### PostgreSQL Specifics`: Native declarative partitioning (`PARTITION BY RANGE`). BRIN indexes -- ideal for time columns because data is physically ordered by insertion time. `pg_partman` extension for automated partition creation and retention. Continuous aggregates via materialized views with `CREATE MATERIALIZED VIEW hourly_metrics AS SELECT time_bucket('1 hour', time), device_id, avg(temperature) FROM metrics GROUP BY 1, 2;`.
- `## Details`:
  - `### Advanced Topics`: TimescaleDB hypertables (automatic chunking, compression, continuous aggregates with real-time aggregation), compression (columnar compression on old chunks -- 90%+ size reduction), `time_bucket()` function, two-step aggregation (pre-aggregate in materialized view, re-aggregate at query time), write-ahead log tuning for high-throughput ingestion (`wal_level`, `synchronous_commit`).
  - `### Engine Differences`: MySQL 8.0 supports `PARTITION BY RANGE` but lacks BRIN indexes. MySQL partitioning has a limit of 8192 partitions. MySQL lacks materialized views -- use summary tables with scheduled events or application-level refresh. MySQL does not have a TimescaleDB equivalent -- consider ClickHouse or InfluxDB for high-volume time-series on MySQL stacks.
  - `### Real-World Case Studies`: Fleet management platform ingesting 500K sensor readings/minute from 100K vehicles. Partitioned by day (30 partitions retained), BRIN index on time, composite B-tree on `(vehicle_id, time)`. Write throughput: 500K rows/minute sustained. Query: "last 24h for vehicle X" in 4ms. Retention: daily cron drops partition older than 30 days (instant, no vacuum needed). Storage: 2TB raw, 200GB with TimescaleDB compression.
- `## Source`: TimescaleDB docs, PostgreSQL partitioning docs, PostgreSQL BRIN index docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: time-series tables use time-based partitioning with BRIN indexes, retention via partition drop, aggregation via materialized views

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-time-series/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-time-series knowledge skill`

---

### Task 8: Author db-hierarchical-data skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-7, 9-11)
**Files:** `agents/skills/claude-code/db-hierarchical-data/skill.yaml`, `agents/skills/claude-code/db-hierarchical-data/SKILL.md`

1. Create directory `agents/skills/claude-code/db-hierarchical-data/`

2. Create `agents/skills/claude-code/db-hierarchical-data/skill.yaml`:

```yaml
name: db-hierarchical-data
version: '1.0.0'
description: Comparison of adjacency list, nested sets, closure table, and materialized path -- a selection guide
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-adjacency-list
  - db-nested-sets
  - db-closure-table
  - db-graph-in-relational
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - hierarchical-data
  - tree-model
  - hierarchy-selection
  - adjacency-list
  - nested-sets
  - closure-table
  - materialized-path
  - ltree
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/ltree.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-hierarchical-data/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Hierarchical Data Selection Guide`
- Quote: one-sentence summary -- choosing between adjacency list, nested sets, closure table, and materialized path based on read/write ratio, query patterns, and depth
- `## When to Use`: any time you need to model a tree or hierarchy in a relational database -- this skill is the entry point that routes to the specific pattern skills
- `## Instructions`:
  - `### Key Concepts`: Decision matrix comparing four approaches:

    | Operation             | Adjacency List     | Nested Sets | Closure Table   | Materialized Path  |
    | --------------------- | ------------------ | ----------- | --------------- | ------------------ |
    | Insert node           | O(1)               | O(n)        | O(depth)        | O(1)               |
    | Delete node           | O(1)               | O(n)        | O(subtree)      | O(subtree)         |
    | Move subtree          | O(1)               | O(n)        | O(subtree^2)    | O(subtree)         |
    | Get children          | O(1) indexed       | O(1)        | O(1)            | O(1) pattern match |
    | Get subtree           | O(depth) recursive | O(1) range  | O(1) join       | O(1) LIKE          |
    | Get ancestors         | O(depth) recursive | O(1) range  | O(1) join       | O(1) split         |
    | Get depth             | recursive          | computed    | stored          | count separators   |
    | Storage overhead      | none               | 2 cols/row  | O(N log N) rows | 1 col/row          |
    | Referential integrity | FK enforced        | app-level   | FK enforced     | app-level          |

    Decision rules: (1) Write-heavy with simple parent-child queries -> adjacency list. (2) Read-heavy, rarely changing -> nested sets. (3) Read-heavy with moderate writes, need referential integrity -> closure table. (4) Simple hierarchy, PostgreSQL -> materialized path with ltree.

  - `### Worked Example`: Given three scenarios, show which model to choose and why: (1) Comment threading (frequent inserts, rare full-tree reads) -> adjacency list, (2) Product category taxonomy (updated weekly, queried constantly for "all products in Electronics") -> nested sets or closure table, (3) RBAC permission hierarchy (moderate changes, frequent "is ancestor?" checks) -> closure table. For each, show a one-query example demonstrating the key advantage.
  - `### Anti-Patterns`: choosing a model without analyzing read/write ratio, using nested sets for write-heavy hierarchies (O(n) per insert), using adjacency list when subtree queries dominate and depth is large (recursive CTE performance degrades), using materialized path without ltree extension (manual string parsing is fragile), mixing models without documenting which queries use which.
  - `### PostgreSQL Specifics`: `ltree` extension for materialized path -- native operators: `@>` (ancestor), `<@` (descendant), `~` (regex match), `?` (lquery match). `CREATE INDEX ON categories USING gist (path);` for fast ancestor/descendant checks. `ltree` is the recommended default for PostgreSQL users who do not need the complexity of closure tables.

- `## Details`:
  - `### Advanced Topics`: hybrid models (adjacency list + closure table, adjacency list + materialized path), migration between models (how to compute closure table from adjacency list, how to compute nested set numbers from adjacency list), depth limits and performance cliffs for each model, combining hierarchy models with full-text search for "search within subtree" queries.
  - `### Engine Differences`: MySQL lacks `ltree` -- materialized path requires manual VARCHAR with `LIKE 'path/%'` and no specialized indexing (B-tree prefix match only). MySQL closure tables perform comparably to PostgreSQL. MySQL nested sets work identically but lack exclusion constraints for integrity checks. Recommendation for MySQL: adjacency list with recursive CTE (8.0+) or closure table.
  - `### Real-World Case Studies`: Three companies, three choices. (1) Slack-like messaging: adjacency list -- 1B messages, threads rarely exceed depth 5, insert latency < 1ms. (2) Amazon-like product taxonomy: nested sets -- 200K categories, rebuilt nightly, subtree queries < 1ms. (3) AWS-like IAM: closure table -- 500K permission nodes, "is X an ancestor of Y?" in 0.2ms, node additions 50/day.
- `## Source`: Bill Karwin -- SQL Antipatterns (Trees chapter), PostgreSQL ltree docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: hierarchy model selected based on measured read/write ratio and query patterns, not defaulting to adjacency list for every case

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-hierarchical-data/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-hierarchical-data knowledge skill`

---

### Task 9: Author db-graph-in-relational skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-8, 10-11)
**Files:** `agents/skills/claude-code/db-graph-in-relational/skill.yaml`, `agents/skills/claude-code/db-graph-in-relational/SKILL.md`

1. Create directory `agents/skills/claude-code/db-graph-in-relational/`

2. Create `agents/skills/claude-code/db-graph-in-relational/skill.yaml`:

```yaml
name: db-graph-in-relational
version: '1.0.0'
description: Modeling graph relationships in SQL with recursive queries and knowing when to use a graph DB instead
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-adjacency-list
  - db-closure-table
  - db-hierarchical-data
  - db-query-rewriting
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - graph
  - edges
  - vertices
  - recursive-query
  - shortest-path
  - social-graph
  - network-model
  - graph-database
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/queries-with.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-graph-in-relational/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Graph Relationships in Relational Databases`
- Quote: one-sentence summary -- modeling vertices and edges in SQL tables for social graphs, dependency networks, and recommendation systems with recursive queries
- `## When to Use`: social connections (followers, friends), dependency graphs (package managers, build systems), recommendation engines (user-item-user), fraud detection networks, any many-to-many relationship with path traversal queries -- when the graph is a secondary concern and the primary data model is relational
- `## Instructions`:
  - `### Key Concepts`: Basic graph schema: `CREATE TABLE vertices (id serial PRIMARY KEY, label varchar NOT NULL, properties jsonb); CREATE TABLE edges (id serial PRIMARY KEY, source_id int REFERENCES vertices(id), target_id int REFERENCES vertices(id), label varchar NOT NULL, weight float DEFAULT 1.0, properties jsonb);`. Directed vs undirected (store both directions or query with `OR`). Path queries via recursive CTE: find all nodes reachable from X within N hops. Cycle detection: track visited nodes in an array `path int[] DEFAULT ARRAY[source]` and check `target_id != ALL(path)`. Shortest path: BFS with recursive CTE (returns first path found = shortest in unweighted graph). When SQL stops being practical: variable-length paths > 5-6 hops, graph algorithms (PageRank, community detection, centrality), real-time traversals on graphs with > 10M edges.
  - `### Worked Example`: Social network "people you may know" (friends-of-friends). Show: (1) schema with `users` and `friendships` (edges) tables, (2) direct friends query (simple JOIN), (3) friends-of-friends excluding direct friends (2-hop recursive CTE), (4) mutual friends count for ranking recommendations, (5) EXPLAIN ANALYZE showing the cost of 2-hop vs 3-hop traversal. Demonstrate the performance cliff: 2-hop on 1M edges = 50ms, 3-hop = 2s, 4-hop = timeout.
  - `### Anti-Patterns`: storing graph data in a single self-join table when traversal depth varies (use proper vertex/edge tables), unbounded recursive CTEs without depth limits on user-generated graphs (infinite loops or performance explosion), using SQL for graph algorithms like PageRank or shortest-path-with-weights (use a graph DB or application-layer library), not indexing `(source_id)` and `(target_id)` on the edges table.
  - `### PostgreSQL Specifics`: Apache AGE extension adds Cypher query language to PostgreSQL (graph queries without leaving PostgreSQL). `pg_graph` for graph analytics. Recursive CTE with `CYCLE` clause (PG 14+) for automatic cycle detection. JSONB `properties` column on edges/vertices for flexible schema evolution. GIN index on properties for filtered graph queries.
- `## Details`:
  - `### Advanced Topics`: weighted shortest path (Dijkstra in SQL -- possible but impractical for large graphs), graph partitioning for sharded deployments, bidirectional search (start from both ends, meet in the middle), materialized graph views (pre-compute common traversals), hybrid approach (relational for storage, export to NetworkX/Neo4j for analytics).
  - `### Engine Differences`: MySQL 8.0+ supports recursive CTEs for graph traversal. MySQL lacks the `CYCLE` clause -- manual cycle detection required. MySQL lacks JSONB -- use `JSON` column type with generated columns for indexing. No Apache AGE equivalent for MySQL. MySQL's recursive CTE performance is generally comparable to PostgreSQL for shallow traversals (< 5 hops).
  - `### Real-World Case Studies`: Fraud detection platform modeling transaction networks (5M accounts, 50M transactions as edges). 2-hop queries ("who transacted with someone who transacted with X?") in PostgreSQL: 120ms with indexed edges. 3-hop queries: 8s. Moved 3+ hop analysis to Neo4j while keeping transactional data in PostgreSQL. Hybrid saved 6 months vs full migration to a graph DB.
- `## Source`: PostgreSQL WITH RECURSIVE docs, Apache AGE documentation
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: graph queries bounded by depth, performance validated with EXPLAIN, graph DB considered when traversal exceeds 3-4 hops on large datasets

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-graph-in-relational/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-graph-in-relational knowledge skill`

---

### Task 10: Author db-document-in-relational skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-9, 11)
**Files:** `agents/skills/claude-code/db-document-in-relational/skill.yaml`, `agents/skills/claude-code/db-document-in-relational/SKILL.md`

1. Create directory `agents/skills/claude-code/db-document-in-relational/`

2. Create `agents/skills/claude-code/db-document-in-relational/skill.yaml`:

```yaml
name: db-document-in-relational
version: '1.0.0'
description: JSONB columns for semi-structured data -- when to embed vs normalize, indexing JSON, and hybrid modeling
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-entity-attribute-value
  - db-polymorphic-associations
  - db-first-normal-form
  - db-denormalization
  - db-expression-index
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - JSONB
  - JSON
  - document-store
  - semi-structured
  - embed-vs-normalize
  - GIN-index
  - hybrid-model
  - schemaless
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/datatype-json.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-document-in-relational/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Document Data in Relational Databases`
- Quote: one-sentence summary -- using JSONB columns to store semi-structured data alongside relational tables, with indexing strategies and guidelines for when to embed vs normalize
- `## When to Use`: user preferences/settings, API response caching, form builder configurations, product attributes that vary by type, any data where the schema varies per row but relational integrity matters for core fields
- `## Instructions`:
  - `### Key Concepts`: PostgreSQL JSONB stores binary JSON -- supports indexing, containment checks, and path queries. When to embed in JSONB: data is read/written as a unit, no cross-row queries needed, schema varies per row, no referential integrity needed for embedded data. When to normalize: data is queried independently, needs FK constraints, participates in JOINs, has 1:N relationships that grow unbounded. The hybrid model: relational columns for queryable/constrained fields, JSONB column for flexible/varying fields. Schema: `CREATE TABLE products (id serial PRIMARY KEY, name varchar NOT NULL, price numeric NOT NULL, category_id int REFERENCES categories(id), attrs jsonb DEFAULT '{}');`. Indexing: GIN index for containment/existence: `CREATE INDEX ON products USING gin (attrs);`. Expression index for specific paths: `CREATE INDEX ON products ((attrs->>'color'));`.
  - `### Worked Example`: E-commerce product with type-varying attributes. Show: (1) hybrid table schema (relational + JSONB), (2) inserting products with different attribute sets, (3) containment query: `WHERE attrs @> '{"color": "red"}'` (uses GIN index), (4) path query: `WHERE attrs->>'size' = 'large'` (uses expression index), (5) aggregation on JSON field: `SELECT attrs->>'color', count(*) FROM products GROUP BY 1`, (6) EXPLAIN ANALYZE showing GIN index usage vs sequential scan without index.
  - `### Anti-Patterns`: storing entire entity as JSONB when most fields are known and stable (lose type safety, constraints, and query efficiency), deeply nested JSONB structures (3+ levels make queries unreadable and un-indexable), using JSON instead of JSONB (JSON preserves whitespace/ordering, cannot be indexed), querying JSONB fields in JOINs (terrible performance without expression indexes), JSONB columns > 1MB per row (consider normalizing or external storage).
  - `### PostgreSQL Specifics`: JSONB vs JSON: JSONB is decomposed binary, supports indexing, slightly slower to insert but much faster to query. Operators: `->` (get element as JSON), `->>` (get element as text), `@>` (contains), `?` (key exists), `?&` (all keys exist), `?|` (any key exists). `jsonb_path_query` (SQL/JSON path -- PostgreSQL 12+). GIN index operator classes: `jsonb_ops` (all operators, larger index) vs `jsonb_path_ops` (only `@>`, 2-3x smaller index). `CREATE INDEX ON products USING gin (attrs jsonb_path_ops);` when only using containment queries.
- `## Details`:
  - `### Advanced Topics`: generated columns from JSONB for computed relational columns: `ALTER TABLE products ADD COLUMN color varchar GENERATED ALWAYS AS (attrs->>'color') STORED;` -- queryable, indexable, automatically updated. TOAST storage for large JSONB values. Partial indexes on JSONB paths: `CREATE INDEX ON products ((attrs->>'color')) WHERE attrs ? 'color';`. Migrating from JSONB to relational columns when a field stabilizes. `jsonb_set()`, `jsonb_insert()` for partial updates (avoids rewriting entire JSONB value).
  - `### Engine Differences`: MySQL 5.7+ supports `JSON` column type but lacks JSONB. MySQL requires generated columns + B-tree indexes for JSON path queries -- no GIN equivalent. MySQL `JSON_EXTRACT(col, '$.color')` is the equivalent of PostgreSQL `col->>'color'`. MySQL multi-valued indexes (8.0.17+) can index JSON arrays: `CREATE INDEX ON products ((CAST(attrs->'$.tags' AS UNSIGNED ARRAY)));`. MySQL JSON functions: `JSON_CONTAINS`, `JSON_SEARCH`, `JSON_TABLE` (8.0+) for flattening JSON to rows.
  - `### Real-World Case Studies`: Multi-tenant SaaS platform with custom fields per tenant. Originally used EAV (100M rows, 30s for cross-field queries). Migrated to JSONB `custom_fields` column with GIN index. Same queries in 15ms. Storage reduced 60% (one row per entity vs N rows per entity in EAV). Tenant-specific expression indexes added for the 5 most-queried custom fields.
- `## Source`: PostgreSQL JSON types docs, PostgreSQL JSON functions docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: JSONB used only for varying/semi-structured fields, GIN or expression indexes present for queried paths, stable fields normalized to relational columns

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-document-in-relational/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-document-in-relational knowledge skill`

---

### Task 11: Author db-audit-trail skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-10)
**Files:** `agents/skills/claude-code/db-audit-trail/skill.yaml`, `agents/skills/claude-code/db-audit-trail/SKILL.md`

1. Create directory `agents/skills/claude-code/db-audit-trail/`

2. Create `agents/skills/claude-code/db-audit-trail/skill.yaml`:

```yaml
name: db-audit-trail
version: '1.0.0'
description: Change tracking via triggers or application-level logging with immutable append-only audit logs
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-temporal-data
  - db-time-series
  - db-denormalization
  - events-event-sourcing
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - audit-trail
  - change-tracking
  - trigger-based-audit
  - audit-log
  - immutable-log
  - compliance
  - change-data-capture
  - CDC
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/plpgsql-trigger.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-audit-trail/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Audit Trail`
- Quote: one-sentence summary -- recording who changed what, when, and why, using trigger-based or application-level change tracking with immutable append-only logs
- `## When to Use`: regulatory compliance (SOX, HIPAA, GDPR right-to-know), security audit requirements, debugging production data issues ("who changed this row?"), undo/rollback functionality, change approval workflows
- `## Instructions`:
  - `### Key Concepts`: Two approaches:
    1. **Trigger-based audit**: Database triggers capture every INSERT/UPDATE/DELETE and write to an audit table. Advantages: catches all changes including raw SQL and migrations. Disadvantages: tight coupling to schema, performance overhead, cannot capture application context (which user, which API call).
    2. **Application-level audit**: Application code writes audit records before/after data changes. Advantages: captures business context (user, request ID, reason), can be async. Disadvantages: bypassable by raw SQL, requires discipline in every write path.
       Audit table schema: `CREATE TABLE audit_log (id bigserial PRIMARY KEY, table_name varchar NOT NULL, record_id varchar NOT NULL, action varchar NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')), old_values jsonb, new_values jsonb, changed_by varchar, changed_at timestamptz NOT NULL DEFAULT now(), context jsonb);`. Immutability: no UPDATE or DELETE on audit table. Enforce with: `CREATE RULE no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING; CREATE RULE no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;` or use row-level security.
  - `### Worked Example`: Financial transactions table with trigger-based audit. Show: (1) audit_log table creation, (2) generic audit trigger function in PL/pgSQL that captures OLD and NEW values as JSONB, handles INSERT/UPDATE/DELETE, (3) attaching trigger: `CREATE TRIGGER audit_transactions AFTER INSERT OR UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION audit_trigger();`, (4) performing an UPDATE and showing the resulting audit_log row with old_values/new_values diff, (5) querying audit history: `SELECT * FROM audit_log WHERE table_name = 'transactions' AND record_id = '42' ORDER BY changed_at;`.
  - `### Anti-Patterns`: mutable audit logs (UPDATE/DELETE allowed -- defeats the purpose), storing only new values without old values (cannot determine what changed), per-table audit tables instead of a single generic audit table (schema explosion), synchronous audit writes blocking the main transaction without necessity, not partitioning the audit table by time (grows unbounded, queries slow down).
  - `### PostgreSQL Specifics`: `hstore` extension for computing row diffs: `hstore(NEW) - hstore(OLD)` returns only changed columns. `pg_audit` extension for statement-level audit logging (who ran what SQL). Logical replication / `pgoutput` for change data capture without triggers. `current_setting('app.current_user', true)` for passing application context to triggers via session variables.
- `## Details`:
  - `### Advanced Topics`: Change Data Capture (CDC) with logical replication (Debezium, pgoutput), event sourcing as an audit-native architecture (see events-event-sourcing), audit log partitioning by month with automated retention, JSONB diff computation for efficient storage (store only changed fields), audit log querying patterns (reconstruct row state at any point in time by replaying changes).
  - `### Engine Differences`: MySQL triggers use `OLD` and `NEW` row references similar to PostgreSQL. MySQL lacks `hstore` -- use `JSON_OBJECT()` to serialize row values. MySQL does not support `CREATE RULE` -- enforce immutability via trigger: `CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log rows cannot be deleted';`. MySQL binlog can serve as CDC source (Debezium MySQL connector).
  - `### Real-World Case Studies`: Fintech platform with SOX compliance requirement. All changes to `accounts`, `transactions`, `users` tables tracked via generic trigger function. Audit table partitioned by month, retained for 7 years. 50M audit rows/month, queries for "all changes to account X in last 90 days" in 15ms (partition pruning + index on `(table_name, record_id, changed_at)`). Application context (request_id, user_id) passed via `SET LOCAL app.request_id = '...'` before each transaction.
- `## Source`: PostgreSQL trigger docs, pgAudit extension docs
- `## Process`: standard 3-step
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: audit table is immutable (no UPDATE/DELETE), captures both old and new values, partitioned by time with retention policy

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-audit-trail/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-audit-trail knowledge skill`

---

### Task 12: Validate all 11 skills and update arch baseline

**Depends on:** Tasks 1-11
**Parallelizable:** no
**Files:** none created -- validation only

1. Verify all 11 directories exist:

   ```bash
   ls agents/skills/claude-code/ | grep "^db-" | wc -l
   ```

   Expected: 29 (18 from Phase 1+2 + 11 new)

2. Verify every SKILL.md is 150-250 lines:

   ```bash
   for skill in db-polymorphic-associations db-entity-attribute-value db-adjacency-list db-nested-sets db-closure-table db-temporal-data db-time-series db-hierarchical-data db-graph-in-relational db-document-in-relational db-audit-trail; do
     echo "$skill: $(wc -l < agents/skills/claude-code/$skill/SKILL.md) lines"
   done
   ```

3. Verify required sections in each SKILL.md:

   ```bash
   for skill in db-polymorphic-associations db-entity-attribute-value db-adjacency-list db-nested-sets db-closure-table db-temporal-data db-time-series db-hierarchical-data db-graph-in-relational db-document-in-relational db-audit-trail; do
     echo "=== $skill ==="
     grep -c "## When to Use\|## Instructions\|## Details\|## Source\|## Process\|## Harness Integration\|## Success Criteria" agents/skills/claude-code/$skill/SKILL.md
   done
   ```

   Expected: 7 for each skill

4. Verify no ORM syntax:

   ```bash
   grep -rli "prisma\.\|drizzle\.\|findMany\|findFirst\|schema\.prisma\|drizzle(" agents/skills/claude-code/db-polymorphic-associations/SKILL.md agents/skills/claude-code/db-entity-attribute-value/SKILL.md agents/skills/claude-code/db-adjacency-list/SKILL.md agents/skills/claude-code/db-nested-sets/SKILL.md agents/skills/claude-code/db-closure-table/SKILL.md agents/skills/claude-code/db-temporal-data/SKILL.md agents/skills/claude-code/db-time-series/SKILL.md agents/skills/claude-code/db-hierarchical-data/SKILL.md agents/skills/claude-code/db-graph-in-relational/SKILL.md agents/skills/claude-code/db-document-in-relational/SKILL.md agents/skills/claude-code/db-audit-trail/SKILL.md
   ```

   Expected: no output (no matches)

5. Verify cross-references resolve:

   ```bash
   for skill in db-polymorphic-associations db-entity-attribute-value db-adjacency-list db-nested-sets db-closure-table db-temporal-data db-time-series db-hierarchical-data db-graph-in-relational db-document-in-relational db-audit-trail; do
     echo "=== $skill related_skills ==="
     grep -A 20 "related_skills:" agents/skills/claude-code/$skill/skill.yaml | grep "  - " | while read -r line; do
       ref=$(echo "$line" | sed 's/  - //')
       if [ -d "agents/skills/claude-code/$ref" ]; then
         echo "  OK: $ref"
       else
         echo "  MISSING: $ref"
       fi
     done
   done
   ```

   Expected: all references resolve to existing directories

6. Update arch baseline:

   ```bash
   npx harness arch baseline
   ```

7. Run: `harness validate`

8. Commit: `feat(skills): validate Phase 3 schema and data modeling skills`

[checkpoint:human-verify] -- verify all 11 skills render correctly and content is accurate before proceeding to Phase 4.
