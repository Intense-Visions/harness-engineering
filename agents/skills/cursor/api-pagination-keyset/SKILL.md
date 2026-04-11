# Keyset Pagination

> KEYSET PAGINATION NAVIGATES LARGE RESULT SETS BY REMEMBERING THE LAST SEEN ROW'S SORT KEY RATHER THAN COUNTING SKIPPED ROWS — EACH PAGE QUERY BECOMES AN EFFICIENT INDEX SEEK THAT PERFORMS IDENTICALLY WHETHER YOU ARE ON PAGE 1 OR PAGE 1,000,000, MAKING IT THE ONLY PAGINATION STRATEGY THAT SCALES RELIABLY BEYOND TEN MILLION ROWS.

## When to Use

- Paginating tables with 10M+ rows where deep offset scans cause unacceptable query latency
- Designing an export or ETL endpoint that iterates all rows of a large table without holding a database cursor open
- Building an audit log or event stream where strict sequential consistency matters more than random access
- Replacing an offset pagination endpoint that has hit Elasticsearch's or PostgreSQL's deep-offset performance wall
- Implementing cursor pagination and choosing what data to encode inside the cursor token
- Designing a list endpoint for a resource sorted by a composite key (e.g., `tenant_id + created_at + id`)
- Reviewing a PR that uses OFFSET on a table expected to exceed one million rows
- Evaluating performance characteristics of keyset vs. cursor vs. offset for a specific access pattern

## Instructions

### Key Concepts

1. **The Seek Method** — Keyset pagination uses a `WHERE` predicate on the sort key columns rather than `OFFSET`. Given the last seen row with sort values `(col_a = v_a, col_b = v_b)`, the next page query is `WHERE (col_a, col_b) > (v_a, v_b) ORDER BY col_a, col_b LIMIT n`. The database resolves this with a single index seek to `(v_a, v_b)` and reads forward — no rows are scanned and discarded. Query cost is constant regardless of depth.

2. **Composite Key Design** — The sort key must uniquely identify a row to guarantee no rows are skipped or duplicated across page boundaries. A single non-unique column (e.g., `status`) is insufficient. A composite key of `(sort_column, id)` — where `id` is the unique primary key — always produces a unique, stable sort position even when `sort_column` has duplicate values.

   ```sql
   -- Wrong: status is not unique; rows with identical status straddle pages arbitrarily
   WHERE status > 'active' ORDER BY status

   -- Correct: (status, id) is unique and stable
   WHERE (status, id) > ('active', 8821) ORDER BY status, id
   ```

3. **Sort Order Stability** — The sort order applied in the `WHERE` clause must exactly match the `ORDER BY` clause. Mixing ascending and descending directions across columns requires adjusting the row-value comparison accordingly:

   ```sql
   -- All DESC: reverse the inequality
   WHERE (created_at, id) < ('2024-03-15T10:22:00Z', 8821)
   ORDER BY created_at DESC, id DESC
   ```

   An index on `(created_at DESC, id DESC)` resolves this with a single seek.

4. **Index Requirements** — Keyset pagination is only fast when a composite index exists on exactly the columns used in the `WHERE` and `ORDER BY` clauses, in the same order and direction. Missing or misaligned indexes cause full table scans that are worse than offset pagination. Verify the query plan shows an index seek (`Index Scan` or `Index Only Scan` in PostgreSQL, not `Seq Scan`).

5. **No Random Access** — Keyset pagination cannot jump to page N without traversing pages 1 through N-1. There is no equivalent of `?page=50`. Callers must follow the `next_key` token sequentially. This makes keyset pagination incompatible with numbered page controls but ideal for sequential iteration and infinite scroll.

6. **Null Handling** — Null values in sort key columns require explicit handling. In SQL, `NULL` sorts last in ascending order and first in descending order by default (database-dependent). If sort key columns are nullable, add a `IS NOT NULL` constraint in the `WHERE` clause or encode null handling explicitly in the cursor.

### Worked Example

Stripe's Events API exposes a high-volume append-only log of all events for an account. Stripe uses keyset pagination internally, surfacing it via `starting_after` and `ending_before` parameters that accept resource IDs (opaque to callers but encoded from the primary key + timestamp):

**Request first page of events:**

```http
GET /v1/events?limit=3&type=payment_intent.succeeded
Authorization: Bearer sk_example_...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "object": "list",
  "data": [
    { "id": "evt_001", "type": "payment_intent.succeeded", "created": 1710500400 },
    { "id": "evt_002", "type": "payment_intent.succeeded", "created": 1710500200 },
    { "id": "evt_003", "type": "payment_intent.succeeded", "created": 1710500100 }
  ],
  "has_more": true,
  "url": "/v1/events"
}
```

**Request next page using `starting_after` with the last seen ID:**

```http
GET /v1/events?limit=3&type=payment_intent.succeeded&starting_after=evt_003
Authorization: Bearer sk_example_...
```

```http
HTTP/1.1 200 OK

{
  "object": "list",
  "data": [
    { "id": "evt_004", "type": "payment_intent.succeeded", "created": 1710500000 },
    { "id": "evt_005", "type": "payment_intent.succeeded", "created": 1710499900 },
    { "id": "evt_006", "type": "payment_intent.succeeded", "created": 1710499800 }
  ],
  "has_more": true
}
```

The underlying query is equivalent to:

```sql
SELECT * FROM events
WHERE type = 'payment_intent.succeeded'
  AND (created, id) < (1710500100, 'evt_003')
ORDER BY created DESC, id DESC
LIMIT 4  -- fetch 4 to determine has_more
```

### Anti-Patterns

1. **Using a non-unique column as the sole keyset column.** If two rows share the same value in the sort column, the seek predicate `WHERE col > value` may skip one of them or include both depending on which side of the page boundary they fall. Rows in the tie zone shift unpredictably as pages are requested. Always add the primary key as a tiebreaker to make every sort position unique.

2. **Applying keyset pagination without a matching composite index.** The entire performance benefit of keyset pagination depends on an index seek. If the index does not exist or is ordered differently than the query, the database falls back to a sequential scan. Always run `EXPLAIN` before deploying a keyset-paginated endpoint and confirm the plan shows an index seek. A missing index on a 50M-row table can make page 2 slower than offset page 1.

3. **Trying to support random page access with keyset pagination.** Adding a `?page=N` shortcut to a keyset endpoint requires executing N-1 seeks to find the start of page N, which is equivalent to the offset scan keyset is designed to avoid. If random access by page number is genuinely required, use offset pagination for those endpoints and keyset for the sequential-export endpoints. Do not hybridize.

4. **Returning the raw sort key in the API response without encoding it.** Returning `"next_after_created": "2024-03-15T10:22:00Z"` leaks the internal sort schema and prevents future changes to the sort key design. Wrap the keyset values in a base64-encoded opaque cursor token, just as with cursor pagination, so the encoding can evolve without a breaking API change.

## Details

### Row-Value Comparison Support

| Database       | Row-value comparison       | Composite index seek | Notes                                     |
| -------------- | -------------------------- | -------------------- | ----------------------------------------- |
| PostgreSQL 14+ | yes                        | yes                  | Full support; index-only scan possible    |
| MySQL 8.0+     | yes                        | yes                  | Supported; verify index direction matches |
| SQLite 3.37+   | yes                        | yes                  | Full support                              |
| SQL Server     | limited                    | partial              | Use equivalent AND/OR expansion           |
| DynamoDB       | yes (via LastEvaluatedKey) | yes (sort key)       | Native keyset via `ExclusiveStartKey`     |

For SQL Server, expand row-value comparison manually:

```sql
WHERE (created_at < @v_created)
   OR (created_at = @v_created AND id < @v_id)
```

### Real-World Case Study: Shopify Admin API

Shopify's Admin REST API historically used offset pagination on high-volume endpoints like `GET /admin/api/2024-01/orders.json`. As merchant stores scaled to millions of orders, deep offset queries (`?page=500&limit=250`) caused timeout errors on the database tier. Shopify migrated these endpoints to keyset pagination using `page_info` cursor tokens (base64-encoded keyset values) in 2020. After migration, Shopify reported that 95th-percentile query latency for paginated order list requests dropped from 3.2 seconds (at deep offsets) to under 40ms at any page depth — an 80x improvement at the tail. The offset-based `page` parameter was deprecated and removed in API version 2021-04.

## Source

- [Use The Index, Luke — The Seek Method (No Offset)](https://use-the-index-luke.com/no-offset/)
- [Shopify API — Paginate results with the REST Admin API](https://shopify.dev/docs/api/usage/pagination-rest)
- [Stripe API — Pagination](https://stripe.com/docs/api/pagination)
- [PostgreSQL — Row Constructors](https://www.postgresql.org/docs/current/sql-expressions.html#SQL-SYNTAX-ROW-CONSTRUCTORS)
- [Markus Winand — We need tool support for keyset pagination](https://use-the-index-luke.com/blog/2013-07/pagination-done-the-postgresql-way)

## Process

1. Identify the sort columns: choose an immutable or append-only column (e.g., `created_at`) as the primary sort key and add the unique primary key as a tiebreaker to form a composite sort key.
2. Verify a composite index exists on `(sort_col ASC/DESC, id ASC/DESC)` in the exact direction matching the query. Run `EXPLAIN` to confirm an index seek, not a sequential scan.
3. Implement the seek predicate as a row-value comparison: `WHERE (sort_col, id) > (last_sort_val, last_id)` for ascending, `< ` for descending.
4. Encode the last row's sort key values as a base64-encoded opaque cursor token in the response. Accept this token as the `after` parameter on subsequent requests. Validate the token on decode.
5. Fetch `LIMIT n+1` rows and return only `n`; set `has_more = true` if the extra row exists. Do not run a separate COUNT query.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-pagination-cursor, api-pagination-offset, db-btree-index, db-covering-index

## Success Criteria

- Every keyset-paginated endpoint has a composite index on its sort key columns; query plans show index seeks, not sequential scans.
- Sort keys are composite — primary sort column plus primary key — ensuring uniqueness at every page boundary.
- Keyset values returned to clients are wrapped in opaque base64-encoded cursor tokens, not exposed as raw column values.
- `has_more` is determined by fetching `n+1` rows; no COUNT(\*) query runs per page request.
- Deep-page latency (page 10,000+) is within 10% of first-page latency under production load.
