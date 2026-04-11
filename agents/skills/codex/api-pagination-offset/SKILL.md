# Offset/Limit Pagination

> OFFSET/LIMIT PAGINATION IS THE SIMPLEST PAGINATION MODEL BUT CARRIES HIDDEN COSTS — COUNT(\*) QUERIES ARE EXPENSIVE ON LARGE TABLES, CONCURRENT INSERTS AND DELETES CAUSE PAGE DRIFT THAT DUPLICATES OR SKIPS ROWS, AND HIGH OFFSETS FORCE FULL INDEX SCANS THAT MAKE DEEP PAGES ORDERS OF MAGNITUDE SLOWER THAN PAGE ONE.

## When to Use

- Building an admin UI with numbered page controls where users jump directly to page N
- Designing a read-heavy endpoint on a table with infrequent writes where page drift is acceptable
- Implementing search results pagination where the total hit count must be displayed
- Prototyping a list endpoint before write patterns are well understood
- Reviewing a PR that adds offset pagination to a high-write feed or activity log
- Evaluating whether an existing offset endpoint should migrate to cursor or keyset pagination
- Designing export endpoints where the client iterates all rows in order and write concurrency is low
- Supporting a legacy frontend that stores and navigates by page number in the URL

## Instructions

### Key Concepts

1. **Offset and Limit** — `LIMIT n` restricts the result set to `n` rows. `OFFSET k` skips the first `k` rows before applying the limit. Together they select a window: `OFFSET 20 LIMIT 10` returns rows 21–30. The API surface maps directly: `?page=3&per_page=10` translates to `OFFSET (3-1)*10 = 20`.

   ```sql
   SELECT * FROM articles
   ORDER BY created_at DESC
   LIMIT 10 OFFSET 20;
   ```

2. **Total Count and Pagination Math** — Offset pagination almost always requires a total count so the client can render page numbers and a "last page" link. This requires a separate `SELECT COUNT(*) FROM articles WHERE ...` query using the same filters. On tables with millions of rows, this query can take hundreds of milliseconds and scales poorly. Cache the count aggressively or compute it asynchronously.

3. **Page Drift** — If a row is inserted at the top of a sorted result set between page 1 and page 2 requests, every subsequent page shifts by one row. Page 2 now starts where page 1 ended — the first row of page 2 duplicates the last row of page 1. Conversely, a deletion causes a row to be skipped. Page drift is unavoidable in offset pagination under concurrent writes and must be documented as a known limitation.

4. **Deep Offset Performance** — Database engines execute `OFFSET k` by fetching and discarding `k` rows before returning the result window. At `OFFSET 100000`, the engine scans and discards 100,000 rows on every page request regardless of indexes. This makes page 10,000 exponentially more expensive than page 1. Impose a maximum offset (e.g., `OFFSET <= 10000`) and redirect callers to cursor pagination for deeper traversal.

5. **UI Implications** — Numbered page controls, "Go to page N" inputs, and total-result counts are natural UI patterns for offset pagination. Infinite scroll and "load more" patterns are a poor fit — they mask page drift and encourage deep offsets. For infinite scroll, prefer cursor pagination and omit total counts.

### Worked Example

The Twilio REST API uses offset pagination on its resource list endpoints, providing `page`, `page_size`, `first_page_uri`, `next_page_uri`, and `previous_page_uri` in every response:

**Request page 1:**

```http
GET /2010-04-01/Accounts/AC123/Messages.json?PageSize=2
Authorization: Basic base64(ACsid:auth_token)
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "messages": [
    { "sid": "MM001", "body": "Hello world",  "date_created": "2024-03-15" },
    { "sid": "MM002", "body": "How are you?", "date_created": "2024-03-14" }
  ],
  "page": 0,
  "page_size": 2,
  "first_page_uri": "/2010-04-01/Accounts/AC123/Messages.json?Page=0&PageSize=2",
  "next_page_uri": "/2010-04-01/Accounts/AC123/Messages.json?Page=1&PageSize=2&PageToken=PASMxxx",
  "previous_page_uri": null,
  "uri": "/2010-04-01/Accounts/AC123/Messages.json?Page=0&PageSize=2"
}
```

**Request page 2:**

```http
GET /2010-04-01/Accounts/AC123/Messages.json?Page=1&PageSize=2&PageToken=PASMxxx
Authorization: Basic base64(ACsid:auth_token)
```

Note that Twilio augments the page number with a `PageToken` to mitigate drift — a hybrid approach that preserves numbered navigation while reducing the worst-case drift to a single page boundary.

### Anti-Patterns

1. **Running COUNT(\*) on every page request without caching.** A live `SELECT COUNT(*) FROM large_table WHERE ...` on every API call is frequently the slowest query in the request cycle. For tables with 1M+ rows and complex filter predicates, this query can exceed 500ms. Cache the count with a short TTL (30–60 seconds), compute it in the background, or use approximate counts from database statistics. Document that totals may be slightly stale.

2. **Allowing unbounded offsets.** An endpoint that accepts `?page=999999` will attempt `OFFSET 9999990` on the database, which scans and discards nearly 10 million rows. This is trivially exploitable as a denial-of-service vector and degrades performance for all other requests. Cap the maximum page number (e.g., 500 pages) and return `400 Bad Request` with a suggestion to use cursor pagination for deeper access.

3. **Using offset pagination for high-write collections without documenting page drift.** An activity feed, notification inbox, or audit log with frequent inserts will exhibit visible page drift on every client that holds a page number across network requests. Clients scrolling quickly will see duplicate entries or miss events entirely. Either switch to cursor pagination, document the limitation prominently, or add a `as_of` timestamp parameter that locks the result set to a snapshot.

4. **Returning a zero-indexed page number without documenting it.** Some APIs use `page=0` for the first page (zero-indexed); others use `page=1` (one-indexed). Mixing conventions causes off-by-one errors that are invisible until a client skips the first page in production. Pick one convention, document it clearly, and validate that `page=0` on a one-indexed API returns `400 Bad Request` rather than silently returning no results.

## Details

### Performance Degradation at Scale

| Rows in table | OFFSET 0 | OFFSET 10,000 | OFFSET 100,000 | OFFSET 1,000,000 |
| ------------- | -------- | ------------- | -------------- | ---------------- |
| 1M rows       | ~1ms     | ~12ms         | ~120ms         | N/A (hard cap)   |
| 10M rows      | ~1ms     | ~15ms         | ~150ms         | ~1,500ms         |
| 100M rows     | ~2ms     | ~20ms         | ~200ms         | ~2,000ms+        |

These are approximate query times for a single-column ORDER BY on an indexed column in PostgreSQL. Actual times vary by hardware and query complexity. The takeaway is linear degradation: deep pages are not a corner case — they are a predictable scaling cliff.

### Hybrid Approaches

When the UI genuinely requires page numbers but the dataset is live, consider:

- **Keyset-anchored offset:** Capture the `id` of the first row on page 1 as a snapshot anchor. Subsequent page requests use `WHERE id <= anchor_id` to limit the scan to the snapshot window, then apply OFFSET within that window.
- **Cursor with page number display:** Use cursor pagination internally but map cursor tokens to display page numbers in the client, accepting that "Go to page N" is not supported.

### Real-World Case Study: Elasticsearch / OpenSearch

The Elasticsearch `from`/`size` API (direct equivalent of OFFSET/LIMIT) enforces a hard cap of `index.max_result_window = 10000` by default. Queries with `from + size > 10000` return a `400` error. This cap exists because Elasticsearch must fetch and rank `from + size` documents across all shards before discarding the first `from` results — at large offsets, coordinator memory usage becomes a cluster stability risk. Teams that hit this limit are redirected to the `search_after` API (equivalent to keyset pagination), which is Elasticsearch's recommended pattern for deep pagination of large result sets.

## Source

- [MDN — HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
- [PostgreSQL — LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)
- [Twilio REST API Pagination](https://www.twilio.com/docs/usage/api/paging)
- [Elasticsearch — Paginate search results](https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html)
- [Use The Index, Luke — No Offset](https://use-the-index-luke.com/no-offset/)

## Process

1. Determine the access pattern: if the UI displays page numbers and total count and the dataset has low write frequency, offset pagination is appropriate. If the dataset is a feed or log with high write frequency, prefer cursor or keyset pagination.
2. Choose a page-numbering convention (zero-indexed or one-indexed), document it in the API reference, and validate that out-of-range page numbers return `400 Bad Request`.
3. Implement the COUNT query for total results. Cache the result with a TTL appropriate to the write frequency of the underlying data.
4. Impose a maximum offset cap (e.g., `page * per_page <= 10000`) and return `400 Bad Request` with an error body that references cursor pagination as the alternative.
5. Document page drift as a known limitation in the API reference, especially for collections that receive concurrent writes.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-pagination-cursor, api-pagination-keyset, api-filtering-sorting

## Success Criteria

- Every offset endpoint documents its maximum page depth and returns `400 Bad Request` for requests that exceed it.
- COUNT queries are cached or computed asynchronously; no live COUNT(\*) runs on every page request for tables with 100k+ rows.
- Page-numbering convention (zero- or one-indexed) is documented and validated in request handling.
- Page drift is documented as a known limitation on any endpoint where the underlying collection receives concurrent writes.
- API documentation explicitly recommends cursor or keyset pagination for use cases that require deep traversal or drift-free consistency.
