# Cursor-Based Pagination

> CURSOR-BASED PAGINATION REPLACES NUMERIC OFFSETS WITH OPAQUE POSITION TOKENS — EACH CURSOR ENCODES EXACTLY WHERE THE CLIENT LEFT OFF, ELIMINATING PAGE DRIFT WHEN ROWS ARE INSERTED OR DELETED BETWEEN REQUESTS AND ENABLING CONSISTENT TRAVERSAL OF LIVE DATASETS.

## When to Use

- Designing pagination for a feed, activity log, or timeline where rows are continuously inserted
- Implementing `next_page_token` or `after` cursor parameters on list endpoints
- Migrating an offset-paginated endpoint that exhibits page drift under concurrent writes
- Building mobile clients that scroll through infinite feeds and cannot afford gaps or duplicates
- Implementing the Relay connection specification for a GraphQL-backed REST API
- Exposing large result sets (>10,000 rows) where deep offset scans degrade database performance
- Designing bidirectional traversal (forward and backward) through an ordered collection
- Reviewing a PR that returns raw database primary keys as pagination cursors

## Instructions

### Key Concepts

1. **Opaque Cursor** — A cursor is a position token that is intentionally opaque to the client. The server encodes whatever internal position data it needs (a timestamp, a sort key, a composite of multiple columns) and base64-encodes the result so clients cannot parse or construct cursors manually. Opacity allows the server to change the internal encoding without a breaking API change.

   ```
   Internal:  { "id": 8821, "created_at": "2024-03-15T10:22:00Z" }
   Encoded:   eyJpZCI6ODgyMSwiY3JlYXRlZF9hdCI6IjIwMjQtMDMtMTVUMTA6MjI6MDBaIn0=
   ```

2. **Forward Pagination** — The client passes an `after` cursor to retrieve the page that follows a known position. The server decodes the cursor, constructs a `WHERE` clause that selects rows strictly after the encoded position, and applies `LIMIT n`. The response includes a `next_cursor` when more results exist and omits it (or returns null) when the collection is exhausted.

3. **Backward Pagination** — The client passes a `before` cursor to traverse in reverse. The server selects rows strictly before the encoded position with the sort direction reversed, then re-reverses the result set before returning it so the response order matches the canonical collection order. Not all APIs implement backward pagination — document the capability explicitly.

4. **Cursor Stability Guarantees** — A cursor must remain valid for a reasonable window (typically 24–72 hours). If the sort key column is mutable (e.g., `updated_at`), cursor-encoded values may no longer identify the same logical position after an update. Prefer immutable sort keys (e.g., monotonic `id` or `created_at`) for cursor stability. Document the expiry window in the API reference.

5. **Page Size Negotiation** — Accept a `limit` (or `per_page`) parameter with a capped maximum. Return the actual page size used in the response alongside the cursor, even when the client specifies `limit`. This allows clients to detect when the server reduced their requested page size.

6. **has_more Flag** — Rather than computing total count (expensive), return a boolean `has_more` (or `has_next_page` / `has_previous_page` in Relay). To determine `has_more`, request `LIMIT n+1` rows from the database and return only `n` — if the extra row exists, `has_more = true`.

### Worked Example

GitHub's REST API uses cursor-based pagination via `Link` headers and an opaque `cursor` parameter on the GraphQL API. The REST List Issues endpoint demonstrates the pattern:

**Request page 1:**

```http
GET /repos/octocat/hello-world/issues?per_page=2&state=open
Authorization: Bearer ghp_...
```

```http
HTTP/1.1 200 OK
Link: <https://api.github.com/repos/octocat/hello-world/issues?per_page=2&state=open&after=Y3Vyc29yOnYyOpHOAAFBUQ%3D%3D>; rel="next"
Content-Type: application/json

[
  { "id": 100, "number": 42, "title": "Fix build" },
  { "id": 99,  "number": 41, "title": "Add tests"  }
]
```

**Request the next page using the cursor from the `Link` header:**

```http
GET /repos/octocat/hello-world/issues?per_page=2&state=open&after=Y3Vyc29yOnYyOpHOAAFBUQ%3D%3D
Authorization: Bearer ghp_...
```

```http
HTTP/1.1 200 OK
Link: <https://api.github.com/repos/octocat/hello-world/issues?per_page=2&state=open&after=Y3Vyc29yOnYyOpHOAAFBUQ%3D%3D>; rel="prev",
      <https://api.github.com/repos/octocat/hello-world/issues?per_page=2&state=open&after=Y3Vyc29yOnYyOpHOAAFBUM%3D%3D>; rel="next"

[
  { "id": 98, "number": 40, "title": "Update docs" },
  { "id": 97, "number": 39, "title": "Refactor auth" }
]
```

The GitHub GraphQL API uses the Relay connection spec with `edges`, `node`, `pageInfo.endCursor`, `pageInfo.hasNextPage` — a canonical reference implementation of cursor pagination at scale.

### Anti-Patterns

1. **Exposing raw database IDs as cursors.** Returning `"cursor": "8821"` leaks internal implementation details, lets clients construct arbitrary cursors that bypass intended access controls, and makes it impossible to change the internal ID scheme. Always base64-encode an opaque payload. Even if the payload is just an integer today, opacity preserves the option to change it.

2. **Using mutable columns as the sole cursor key.** If the cursor encodes `updated_at` and rows are frequently updated, a client mid-pagination may re-see rows it already received or skip rows whose `updated_at` was bumped between pages. Use an immutable monotonic column (`id`, `created_at`) as the primary cursor key. If the client must sort by a mutable field, use a composite cursor of `(mutable_field, id)` so `id` breaks ties and the position remains unique and stable.

3. **Returning a total count alongside every cursor page.** `SELECT COUNT(*)` on large tables acquires a table scan or index scan that is often more expensive than the page query itself. Cursor pagination's primary advantage over offset is avoiding this scan. If a UI needs a total count, compute it asynchronously and cache it, or switch to an approximate count (`pg_class.reltuples` in PostgreSQL). Never block the paginated response on a live COUNT.

4. **Accepting client-constructed cursors without validation.** If a client can construct an arbitrary cursor value, it may bypass row-level security, access soft-deleted records, or enumerate internal IDs. Always decode, validate schema, and verify the encoded values fall within the caller's access scope before using cursor data in a query.

## Details

### Relay Connection Specification

The [Relay cursor connection specification](https://relay.dev/graphql/connections.htm) defines a canonical shape that many REST and GraphQL APIs follow:

```json
{
  "data": {
    "edges": [
      { "cursor": "Y3Vyc29yMQ==", "node": { "id": "1", "name": "Alice" } },
      { "cursor": "Y3Vyc29yMg==", "node": { "id": "2", "name": "Bob" } }
    ],
    "pageInfo": {
      "startCursor": "Y3Vyc29yMQ==",
      "endCursor": "Y3Vyc29yMg==",
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

Adopting this shape for REST responses reduces integration friction for teams already using Relay on the frontend and documents a well-understood contract.

### Cursor Encoding in SQL

For a table sorted by `created_at DESC, id DESC`, the forward-pagination query given a decoded cursor `{created_at: "2024-03-15T10:22:00Z", id: 8821}` is:

```sql
SELECT * FROM events
WHERE (created_at, id) < ('2024-03-15T10:22:00Z', 8821)
ORDER BY created_at DESC, id DESC
LIMIT 26  -- request 26 to detect has_next_page; return 25
```

This row-value comparison is supported by PostgreSQL, MySQL 8+, and SQLite and uses composite indexes efficiently without an OFFSET scan.

### Real-World Case Study: Slack

Slack's Web API uses cursor pagination (`next_cursor` in `response_metadata`) for all list endpoints including `conversations.list`, `users.list`, and `channels.history`. Before migrating from offset to cursor pagination, Slack reported that deep-offset queries on the `channels.history` endpoint (messages at offset 50,000+) caused p99 response times exceeding 8 seconds on large workspaces. After the migration to cursor-based pagination using composite `(ts, channel_id)` cursors, p99 latency for equivalent page fetches dropped to under 80ms — a 100x improvement — because each page query became a bounded index seek rather than a full table scan.

## Source

- [Relay Cursor Connections Specification](https://relay.dev/graphql/connections.htm)
- [GitHub REST API Pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)
- [Slack API — Pagination](https://api.slack.com/docs/pagination)
- [RFC 5988 — Web Linking (Link header)](https://www.rfc-editor.org/rfc/rfc5988)
- [Use The Index, Luke — No Offset](https://use-the-index-luke.com/no-offset/)

## Process

1. Choose the sort key for the cursor: prefer immutable columns (`id`, `created_at`). If the client sorts by a mutable field, design a composite cursor of `(sort_field, id)`.
2. Implement cursor encoding: serialize the position payload as JSON, base64url-encode it, and validate the schema on decode before trusting any field.
3. Write the page query using a row-value comparison (`WHERE (col_a, col_b) < (val_a, val_b)`) with `LIMIT n+1` to detect `has_more` without a COUNT query.
4. Return the last row's encoded cursor as `next_cursor` (omit the field or return null when `has_more` is false). Include `has_more` as an explicit boolean.
5. Document cursor lifetime (e.g., "cursors are valid for 24 hours") and the behavior when an expired cursor is submitted (return `400 Bad Request` with error code `cursor_expired`).

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-pagination-offset, api-pagination-keyset, graphql-pagination-patterns, api-filtering-sorting

## Success Criteria

- Cursors are opaque to clients: base64-encoded payloads that clients cannot parse or construct manually.
- Page queries use row-value comparisons or equivalent index seeks — no OFFSET clause on the paginated query.
- `has_more` is determined by fetching `n+1` rows, not by COUNT(\*).
- Expired or malformed cursors return `400 Bad Request` with a machine-readable error code, not a 500.
- Cursor lifetime is documented in the API reference with explicit expiry and renewal behavior.
