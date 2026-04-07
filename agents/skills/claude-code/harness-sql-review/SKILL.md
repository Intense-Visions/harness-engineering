# Harness SQL Review

> Adversarial review of SQL queries for performance anti-patterns, missing indexes, N+1 queries, and unsafe operations. Analyzes raw SQL, ORM-generated queries, and migration scripts to produce optimization recommendations with estimated impact.

## When to Use

- When reviewing a PR that adds or modifies SQL queries, repository methods, or database access patterns
- When investigating slow database performance or timeout issues
- When adding new database tables or indexes and validating query access patterns
- NOT for schema design or migration safety (use harness-database)
- NOT for data pipeline DAG structure or ETL patterns (use harness-data-pipeline)
- NOT for ORM selection or configuration decisions (use harness-database)

## Process

### Phase 1: SCAN -- Locate SQL Queries

1. **Resolve project root.** Use provided path or cwd.

2. **Detect SQL dialect.** Determine the database from project configuration:
   - PostgreSQL: `DATABASE_URL` containing `postgres`, Prisma `provider = "postgresql"`, `pg` package
   - MySQL: `DATABASE_URL` containing `mysql`, Prisma `provider = "mysql"`, `mysql2` package
   - SQLite: `.sqlite` or `.db` files, Prisma `provider = "sqlite"`, `better-sqlite3` package
   - MSSQL: `DATABASE_URL` containing `sqlserver`, `mssql` or `tedious` package
   - Override with `--dialect` if auto-detection fails

3. **Extract raw SQL queries.** Scan source files for:
   - SQL string literals: template literals containing `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`
   - Query builder calls: `.query()`, `.raw()`, `.execute()`, `$queryRaw`, `$executeRaw`
   - SQL files: `*.sql` in `queries/`, `src/**/sql/`, migration directories
   - Stored procedures and views referenced in application code

4. **Extract ORM queries.** Identify ORM usage and extract the implied SQL:
   - **Prisma:** `findMany`, `findUnique`, `include`, `select` with nested relations
   - **TypeORM:** `createQueryBuilder`, `find` with `relations`, `@OneToMany` eager loading
   - **Sequelize:** `findAll` with `include`, raw queries
   - **Knex:** query chain analysis (`.select()`, `.where()`, `.join()`)
   - **Drizzle:** query builder chains and relational queries

5. **Scope to PR changes.** If triggered by a PR, focus on queries in changed files. Also scan unchanged files that import changed models (they may be affected by schema changes).

6. **Build query inventory.** For each query, record:
   - Source file and line number
   - Query type (SELECT, INSERT, UPDATE, DELETE, DDL)
   - Tables accessed
   - Whether it is in a loop (potential N+1)
   - Estimated complexity (simple, join, subquery, CTE, window function)

---

### Phase 2: ANALYZE -- Evaluate Query Patterns

1. **Detect N+1 queries.** The most common and impactful anti-pattern:
   - Look for queries inside loops: `for` / `forEach` / `map` containing `await db.query`
   - Look for ORM eager loading gaps: `findMany` followed by individual `findUnique` per result
   - Look for GraphQL resolvers that query per-field without DataLoader
   - Classify: **Error** if in a known hot path, **Warning** if in administrative code

2. **Detect missing indexes.** For each `WHERE`, `JOIN`, and `ORDER BY` clause:
   - Identify the columns being filtered, joined, or sorted
   - Check if a supporting index exists (read migration files, `CREATE INDEX` statements, Prisma `@@index`)
   - Flag unindexed columns on tables likely to be large (referenced in multiple queries or with `count` operations)
   - Recommend composite indexes when queries filter on multiple columns

3. **Detect full table scans.** Flag queries that:
   - Use `SELECT *` on large tables without a `WHERE` clause
   - Use `LIKE '%pattern%'` (leading wildcard prevents index use)
   - Use functions on indexed columns in `WHERE` (`WHERE LOWER(email) = ...`)
   - Use `OR` across different columns without index support
   - Use `NOT IN` with large subqueries

4. **Detect unsafe operations.** Flag queries that:
   - `UPDATE` or `DELETE` without a `WHERE` clause
   - Use `TRUNCATE` in application code (should be migration/admin only)
   - Perform DDL (`ALTER TABLE`, `DROP`) in application code
   - Use `SELECT ... FOR UPDATE` without a transaction
   - Have unbounded result sets (`SELECT` without `LIMIT` on user-facing endpoints)

5. **Detect join inefficiencies.** Evaluate:
   - Cartesian products (missing `ON` clause or cross join without intent)
   - Joining on non-indexed columns
   - Joining large tables without filtering first (suggest subquery or CTE)
   - Multiple joins that could be replaced with a single denormalized query
   - Correlated subqueries that could be rewritten as joins

6. **Detect transaction issues.** Check for:
   - Long-running transactions (multiple queries without commit)
   - Read-after-write without transaction isolation
   - Deadlock-prone patterns (acquiring locks in inconsistent order)
   - Missing transactions on multi-step writes

---

### Phase 3: OPTIMIZE -- Produce Recommendations

1. **Generate optimized query alternatives.** For each finding, provide:
   - The original query (with file location)
   - The optimized alternative
   - Explanation of why the optimization helps
   - Estimated impact (order of magnitude: "reduces from O(N) queries to O(1)")

2. **Recommend index additions.** For each missing index:

   ```sql
   -- Recommended: speeds up user lookup by email in login flow
   -- Estimated impact: O(N) full scan -> O(log N) index seek
   CREATE INDEX idx_users_email ON users (email);
   ```

   Include:
   - Index type recommendation (B-tree, hash, GIN, GiST) based on query pattern
   - Composite index column order (most selective first)
   - Partial index suggestions when queries always filter on a condition

3. **Recommend batching strategies for N+1.** Provide specific alternatives:
   - ORM eager loading: show the `include` / `relations` / `with` syntax
   - DataLoader pattern: show the DataLoader implementation for GraphQL resolvers
   - `WHERE IN` batching: show the batched query for loop-based N+1
   - SQL `JOIN` rewrite: show how to combine parent + child in one query

4. **Recommend query rewrites.** For complex subqueries and inefficient patterns:
   - Correlated subquery -> JOIN or CTE
   - `NOT IN` -> `NOT EXISTS` (NULL-safe and often faster)
   - Multiple `UNION` -> single query with `CASE WHEN`
   - `DISTINCT` on large result sets -> `GROUP BY` or `EXISTS`
   - `SELECT *` -> explicit column list

5. **Prioritize by impact.** Order recommendations:
   - N+1 queries in hot paths (highest impact)
   - Missing indexes on high-traffic queries
   - Unsafe operations (correctness risk)
   - Query rewrites for efficiency
   - Style and readability improvements

---

### Phase 4: VALIDATE -- Verify Optimization Correctness

1. **Verify semantic equivalence.** For every rewritten query:
   - Does it return the same result set as the original?
   - Does it handle NULL values the same way? (`NOT IN` vs `NOT EXISTS` differs on NULLs)
   - Does it handle empty sets the same way?
   - Does it maintain the same ordering?

2. **Verify index recommendations.** For each proposed index:
   - Does the index cover the query it is intended to speed up?
   - Does the index column order match the query filter order?
   - Will the index cause write performance degradation? (flag if table has heavy write load)
   - Are there existing indexes that already cover this query? (avoid duplicates)

3. **Check for regression risks.** Flag:
   - Index additions on tables with high write throughput (may slow inserts)
   - Query rewrites that increase memory usage (e.g., large `IN` lists)
   - Eager loading that may fetch too much data (the "N+1 overcorrection" of loading everything)
   - Batched queries that exceed the database's parameter limit

4. **Output structured report.** Present findings in review format:

   ```
   SQL Review: [PASS/NEEDS_ATTENTION/FAIL]
   Queries analyzed: N
   Findings: E errors, W warnings, I info

   ERRORS:
   [SQL-N1-001] src/repositories/OrderRepository.ts:45
     N+1 query in getOrdersWithItems(): queries items per order in loop
     Current: 1 + N queries (N = number of orders)
     Recommended: Single query with JOIN or Prisma include
     Impact: O(N) -> O(1) database round trips

   [SQL-UNSAFE-001] src/services/CleanupService.ts:23
     DELETE without WHERE clause: db.execute("DELETE FROM temp_records")
     Risk: Deletes all records if called outside intended context
     Recommended: Add WHERE clause with date filter or use TRUNCATE in migration

   WARNINGS:
   [SQL-IDX-001] src/repositories/UserRepository.ts:78
     Missing index: WHERE email = ? on users table (estimated 500K rows)
     Recommended: CREATE INDEX idx_users_email ON users (email);
   ```

5. **Verify no new anti-patterns introduced.** Check that recommended optimizations do not introduce new problems (e.g., a JOIN recommendation that creates a Cartesian product, or an index recommendation on a column already indexed).

---

## Harness Integration

- **`harness skill run harness-sql-review`** -- Primary command for SQL query analysis.
- **`harness validate`** -- Run after applying query optimizations to verify project health.
- **`Glob`** -- Used to locate SQL files, repository files, DAO classes, and migration scripts.
- **`Grep`** -- Used to extract SQL strings, query builder calls, ORM methods, and index definitions.
- **`Read`** -- Used to read query files, repository implementations, and schema definitions.
- **`Write`** -- Used to generate optimized query files and index migration scripts.
- **`Bash`** -- Used to run `EXPLAIN` queries when database connection is available and to check migration files.
- **`emit_interaction`** -- Used to present the review report and confirm optimization approach for complex rewrites.

## Success Criteria

- All SQL queries in scope are inventoried with source location and type
- N+1 patterns are detected in both raw SQL and ORM usage
- Missing indexes are identified with specific `CREATE INDEX` recommendations
- Unsafe operations are flagged with risk assessment
- Optimized alternatives are semantically equivalent to originals
- Recommendations are prioritized by estimated performance impact
- Report follows structured format with actionable findings

## Examples

### Example: Express.js API with Prisma ORM

```
Phase 1: SCAN
  Dialect: PostgreSQL (detected from DATABASE_URL)
  ORM: Prisma 5.10
  Queries found: 34 (28 Prisma, 4 $queryRaw, 2 $executeRaw)
  Scope: PR diff (3 changed repository files)

Phase 2: ANALYZE
  [SQL-N1-001] src/routes/orders.ts:67
    findMany orders then findUnique for each order's customer
    Pattern: 1 query for orders + N queries for customers
  [SQL-IDX-001] src/routes/products.ts:23
    findMany with where: { category: catId, status: "active" }
    No composite index on (category_id, status)
  [SQL-UNSAFE-001] src/routes/admin.ts:89
    $executeRaw DELETE FROM sessions (no WHERE clause)

Phase 3: OPTIMIZE
  N+1 fix: Use Prisma include: { customer: true }
  Index: CREATE INDEX idx_products_category_status ON products (category_id, status);
  Safety: Add WHERE expired_at < NOW() to session cleanup

Phase 4: VALIDATE
  All rewrites produce equivalent results: YES
  Index does not duplicate existing: YES (checked schema.prisma)
  Report: FAIL (1 N+1 error, 1 unsafe operation, 1 missing index)
```

### Example: Django REST Framework with Raw SQL

```
Phase 1: SCAN
  Dialect: PostgreSQL (detected from DATABASES setting)
  ORM: Django ORM + 6 raw SQL queries
  Queries found: 52 (46 ORM, 6 raw)
  Scope: full project audit

Phase 2: ANALYZE
  [SQL-N1-001] views/analytics.py:34
    for report in reports: report.author.name (lazy loading author per report)
  [SQL-SCAN-001] queries/search.sql:12
    WHERE description LIKE '%' || search_term || '%' (leading wildcard, full scan)
  [SQL-JOIN-001] views/dashboard.py:78
    3 sequential queries that could be a single JOIN
  [SQL-TXN-001] views/transfer.py:45
    Debit + credit operations without @transaction.atomic

Phase 3: OPTIMIZE
  N+1: Add select_related('author') to queryset
  Search: Recommend PostgreSQL full-text search with GIN index:
    CREATE INDEX idx_items_description_gin ON items USING GIN (to_tsvector('english', description));
  Join: Combine 3 queries into single query with LEFT JOIN
  Transaction: Wrap debit+credit in @transaction.atomic

Phase 4: VALIDATE
  All optimizations preserve correctness: YES
  Full-text search returns equivalent results: YES (for word-boundary matches)
  Report: FAIL (1 N+1, 1 missing transaction) + 2 warnings
```

### Example: Go Service with sqlx and Raw Queries

```
Phase 1: SCAN
  Dialect: PostgreSQL (detected from connection string)
  Query library: sqlx
  Queries found: 28 (all raw SQL in repository files)
  SQL files: 12 in queries/ directory

Phase 2: ANALYZE
  [SQL-N1-001] internal/repo/order_repo.go:56
    GetOrdersByUser calls GetItemsByOrderID in loop
  [SQL-IDX-001] queries/search_users.sql:3
    WHERE created_at > $1 AND status = $2 ORDER BY created_at
    Missing composite index on (status, created_at)
  [SQL-PERF-001] queries/report_daily.sql:8
    Correlated subquery for calculating running total
    Recommend: window function SUM() OVER (ORDER BY date)

Phase 3: OPTIMIZE
  N+1: Rewrite with single query using LEFT JOIN and GROUP BY
  Index: CREATE INDEX idx_users_status_created ON users (status, created_at);
  Rewrite: Replace correlated subquery with:
    SELECT date, amount, SUM(amount) OVER (ORDER BY date) as running_total
    FROM daily_revenue;

Phase 4: VALIDATE
  Window function produces identical results: YES
  Index column order matches query pattern: YES (equality on status, range on created_at)
  Report: NEEDS_ATTENTION (1 N+1 error, 1 missing index, 1 query rewrite)
```

## Rationalizations to Reject

| Rationalization                                                                                   | Reality                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The ORM handles query optimization automatically"                                                | ORMs generate syntactically correct queries but do not detect N+1 patterns, choose optimal join strategies, or add missing indexes. The ORM executes what the code asks for. A `findMany` followed by per-item `findUnique` calls in a loop is an N+1 regardless of which ORM executes it. |
| "That endpoint is only called by admins so performance doesn't matter"                            | Admin endpoints frequently become user-facing as products grow. An N+1 query on a 10-row table becomes a crisis when the table grows to 100,000 rows. Query correctness should not be conditional on current data volume.                                                                  |
| "We can add indexes later if performance becomes a problem"                                       | Adding indexes to large production tables requires exclusive locks or online rebuild procedures that carry risk. Identifying and adding the correct index during development, before the table grows, costs minutes instead of hours of planned maintenance.                               |
| "That DELETE without a WHERE clause is wrapped in application logic that only calls it correctly" | Application logic has bugs. A missing WHERE clause is a single misrouted request away from deleting the entire table. Database safety constraints must not depend on application-layer correctness.                                                                                        |
| "The query is fast in development — the test database only has 100 rows"                          | Development databases do not represent production query plans. Full table scans, missing indexes, and N+1 patterns only manifest at production data volumes. Static analysis catches these issues regardless of local data size.                                                           |

## Gates

- **No approving N+1 queries in user-facing hot paths.** An N+1 query in an endpoint called per page load is always an error. It must be fixed with eager loading, batching, or a JOIN before the PR can merge.
- **No recommending indexes without checking for duplicates.** Before recommending a new index, verify no existing index covers the same columns. Duplicate indexes waste write performance and storage.
- **No rewriting queries without semantic equivalence verification.** Every optimized query must produce the same result set as the original, including NULL handling and ordering. If equivalence cannot be confirmed, flag the rewrite as "needs manual verification."
- **No ignoring unsafe DELETE/UPDATE without WHERE.** These are always errors regardless of context. Even if the developer intends to delete all records, it should be an explicit `TRUNCATE` or have a documented justification.

## Escalation

- **When query optimization requires schema changes:** If the best optimization involves adding a column, denormalizing a table, or changing a relationship, flag it: "Optimal fix for SQL-N1-001 requires a denormalized `customer_name` column on orders. This is a schema change that needs harness-database review."
- **When EXPLAIN ANALYZE is needed but no database connection is available:** Report that static analysis has limits: "SQL-IDX-001 is flagged based on static analysis. Running EXPLAIN ANALYZE on the actual database would confirm whether a sequential scan is occurring. Consider adding `--explain` with a database connection."
- **When an N+1 pattern is intentional:** If the developer asserts the N+1 is acceptable (e.g., N is always small, capped at 5), require documentation: "Add a comment explaining the bounded N (max 5) and a test asserting the bound."
- **When ORM-generated SQL cannot be optimized without dropping to raw SQL:** Present the tradeoff: "Prisma cannot express this query efficiently. Options: (A) use `$queryRaw` for this specific query, (B) accept the suboptimal query with a performance budget note, (C) restructure the data access pattern."
