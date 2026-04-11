# Conditional Requests

> CONDITIONAL REQUESTS LET CLIENTS MAKE HTTP REQUESTS CONTINGENT ON RESOURCE STATE — PREVENTING REDUNDANT TRANSFERS WITH 304 NOT MODIFIED AND ENABLING OPTIMISTIC CONCURRENCY CONTROL WITH 412 PRECONDITION FAILED. WITHOUT CONDITIONAL REQUESTS, EVERY GET TRANSFERS THE FULL BODY AND EVERY PUT RISKS OVERWRITING CONCURRENT CHANGES.

## When to Use

- Implementing cache revalidation for a polling client that frequently re-fetches the same resource
- Adding optimistic concurrency control to a PUT or PATCH endpoint to prevent lost updates
- Preventing duplicate creation with a conditional PUT (`If-None-Match: *`)
- Diagnosing 304 or 412 responses from an HTTP client or CDN
- Implementing efficient polling where clients receive a 304 when nothing has changed
- Deciding between ETag-based and timestamp-based conditional logic
- Building a file storage API (S3-style) where overwrite protection is required
- Reviewing code that re-fetches an entire resource list on every interval without conditional headers

## Instructions

### Key Concepts

1. **If-None-Match** — The client sends a stored ETag value; the server returns `304 Not Modified` if the current ETag matches (the resource has not changed), or `200 OK` with a new body and ETag if it has changed. Used on GET/HEAD requests for cache revalidation. Also supports `If-None-Match: *` to check for resource non-existence (useful for conditional creation with PUT).

   ```http
   GET /issues/42
   If-None-Match: "etag-v7"
   ```

   If unchanged:

   ```http
   HTTP/1.1 304 Not Modified
   ETag: "etag-v7"
   Cache-Control: max-age=60
   ```

   If changed:

   ```http
   HTTP/1.1 200 OK
   ETag: "etag-v8"
   Content-Type: application/json

   { "id": 42, "title": "Updated title", ... }
   ```

2. **If-Modified-Since** — The client sends a stored `Last-Modified` timestamp; the server returns `304 Not Modified` if the resource has not changed since that time. Weaker than ETags (second-level granularity). When both `If-None-Match` and `If-Modified-Since` are present, `If-None-Match` takes precedence (RFC 9110).

   ```http
   GET /releases/latest
   If-Modified-Since: Thu, 09 Apr 2026 14:30:00 GMT
   ```

3. **If-Match** — The client sends a stored ETag; the server proceeds only if the current ETag matches. If the ETag has changed (someone else modified the resource), the server returns `412 Precondition Failed`. Used on PUT/PATCH/DELETE to implement optimistic concurrency control — the write is rejected if the resource was modified since the client last read it.

   ```http
   PATCH /orders/ord_123
   If-Match: "etag-v3"
   Content-Type: application/merge-patch+json

   { "status": "shipped" }
   ```

   If ETag still matches (no concurrent modification):

   ```http
   HTTP/1.1 200 OK
   ETag: "etag-v4"
   ```

   If ETag changed (concurrent write detected):

   ```http
   HTTP/1.1 412 Precondition Failed
   Content-Type: application/problem+json

   { "type": "https://api.example.com/errors/conflict",
     "title": "Precondition Failed",
     "detail": "The resource was modified by another client. Re-fetch and retry." }
   ```

4. **If-Unmodified-Since** — Timestamp-based equivalent of `If-Match`. Less precise than ETag-based `If-Match`. The server proceeds only if the resource has not been modified since the specified time.

5. **If-None-Match: \*** — A special form that tests for non-existence. The server proceeds only if the resource does not exist. Used with PUT to implement safe creation: create the resource only if no resource exists at this URL. Returns `412 Precondition Failed` if a resource already exists.

   ```http
   PUT /configs/feature-flags
   If-None-Match: *
   Content-Type: application/json

   { "darkMode": false, "betaFeatures": [] }
   ```

6. **304 Not Modified** — The server's response when a conditional GET/HEAD condition evaluates to "not changed." The response has no body; the client uses its cached copy. The response must still include relevant headers: `ETag`, `Last-Modified`, `Cache-Control`, `Vary`, `Expires`. Omitting `Last-Modified` breaks clients using `If-Modified-Since` on subsequent requests. This is the primary bandwidth-saving mechanism for polling APIs and CDN revalidation.

### Worked Example

GitHub's REST API implements both 304-based cache revalidation and ETag-based write protection:

**Initial fetch — store ETag and Last-Modified for future requests:**

```http
GET /repos/github/docs/contents/README.md
Authorization: Bearer ghp_...
```

```http
HTTP/1.1 200 OK
ETag: "abc123"
Last-Modified: Wed, 08 Apr 2026 10:00:00 GMT
Cache-Control: private, max-age=60
Content-Type: application/vnd.github.v3+json

{ "name": "README.md", "sha": "abc123", "content": "...", "encoding": "base64" }
```

**Polling revalidation — conditional GET with stored ETag:**

```http
GET /repos/github/docs/contents/README.md
Authorization: Bearer ghp_...
If-None-Match: "abc123"
```

```http
HTTP/1.1 304 Not Modified
ETag: "abc123"
Cache-Control: private, max-age=60
```

No body — the client reuses the cached response. Bandwidth cost: ~200 bytes (headers only) vs. ~3 KB (full response).

**Update file with optimistic concurrency (If-Match on PUT):**

```http
PUT /repos/github/docs/contents/README.md
Authorization: Bearer ghp_...
If-Match: "abc123"
Content-Type: application/json

{
  "message": "Update README",
  "content": "<base64-encoded-new-content>",
  "sha": "abc123"
}
```

GitHub's file update API requires the `sha` field (acting as the ETag equivalent in the request body) to match the current file SHA. If another commit changed the file, GitHub returns `409 Conflict` (GitHub's variant of 412 Precondition Failed for this specific endpoint):

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{ "message": "Update is not a fast forward" }
```

**Conditional creation — prevent overwrite of existing config:**

```http
PUT /orgs/myorg/actions/secrets/API_KEY
Authorization: Bearer ghp_...
If-None-Match: *
Content-Type: application/json

{ "encrypted_value": "...", "key_id": "..." }
```

Proceeds only if the secret does not already exist. Returns `412` or `409` if the secret is already present.

### Anti-Patterns

1. **Ignoring ETags on write endpoints.** A PUT endpoint that does not require `If-Match` allows the "lost update" problem: two clients read the same resource, both modify it, and the second write silently overwrites the first. For any resource that might be concurrently modified, require `If-Match` on mutating requests. Return `428 Precondition Required` if the client omits `If-Match` on a protected resource.

2. **Using timestamps instead of ETags for write protection.** `If-Unmodified-Since` has 1-second granularity. Two writes in the same second will not be detected as conflicting. Generate ETags from content hashes for precise conflict detection. Use timestamps only as a fallback when ETag generation is not feasible.

3. **Not returning the new ETag after a successful conditional write.** After a `PATCH` or `PUT` that passes `If-Match`, the server creates a new resource version. Not returning the updated ETag in the response forces the client to re-fetch the resource to get the new ETag for subsequent writes. Always return the updated `ETag` header in the response to mutation requests.

4. **Returning 304 without required headers.** RFC 9110 requires that a `304 Not Modified` response include the same header fields that would have been sent in a `200 OK` response: `Cache-Control`, `ETag`, `Vary`, `Expires`. A `304` missing these headers causes caches to use stale directives from the original response, which may have already expired.

## Details

### Optimistic vs. Pessimistic Concurrency

| Strategy            | Mechanism                                  | Tradeoff                                                    |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Optimistic (HTTP)   | ETag + If-Match; retry on 412              | No locks; low contention; requires client-side retry logic  |
| Pessimistic (locks) | Database row-level lock; held until commit | Prevents conflicts; blocks other writers; lock timeout risk |

For REST APIs, optimistic concurrency via ETags is the standard approach. It scales horizontally without distributed lock coordination. The client reads the resource (gets an ETag), attempts a conditional write (with `If-Match`), and retries with the new ETag on `412 Precondition Failed`. See `db-optimistic-locking` for database-level implementation.

### Conditional Requests and CDN Revalidation

CDNs use conditional requests internally when revalidating stale cache entries with the origin:

```
Client → CDN (stale cache) → Origin: GET /resource, If-None-Match: "old-etag"
Origin → CDN: 304 Not Modified
CDN → Client: 200 OK (from updated CDN cache)
```

This means ETag generation on the origin also benefits CDN efficiency — not just direct client interactions. Weak ETags (`W/"..."`) should be used when the response body may be transformed by the CDN (e.g., compressed differently) and the content is semantically equivalent across encodings.

### Real-World Case Study: Atlassian Confluence REST API

Atlassian's Confluence REST API adopted `If-Match` for page update endpoints after a data loss incident: two users editing the same wiki page simultaneously would overwrite each other's changes with no warning. After adding ETag-based optimistic locking, the API rejects stale writes with `409 Conflict` and returns the current ETag, prompting the client to re-fetch and present a merge UI. In the first month after deployment, lost-update incidents dropped from approximately 200/week to zero. Polling clients using `If-None-Match` on frequently accessed pages reduced bandwidth consumption by 65%.

## Source

- [MDN — HTTP Conditional Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests)
- [RFC 9110 — HTTP Semantics, Section 13 (Conditional Requests)](https://www.rfc-editor.org/rfc/rfc9110#section-13)
- [RFC 9110 — HTTP Semantics, Section 8.8 (Validator Fields)](https://www.rfc-editor.org/rfc/rfc9110#section-8.8)
- [MDN — ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
- [MDN — If-Match](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match)

## Process

1. Identify the use case: cache revalidation (use `If-None-Match` / `If-Modified-Since` on GET) or write conflict detection (use `If-Match` on PUT/PATCH/DELETE).
2. Generate ETags on the server: hash the response body (MD5 or SHA-256) for strong ETags. Expose `ETag` and `Last-Modified` in all GET responses for resources that may be conditionally requested.
3. For GET endpoints: check `If-None-Match` against current ETag; return `304 Not Modified` with cache headers but no body if matching.
4. For PUT/PATCH/DELETE endpoints: check `If-Match` against current ETag; return `412 Precondition Failed` with a problem details body if not matching. Return the updated ETag in the success response.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-http-caching, api-http-methods, db-optimistic-locking, api-status-codes

## Success Criteria

- GET endpoints return `ETag` and `Last-Modified` headers on all cacheable resource responses.
- Conditional GET with a matching `If-None-Match` returns `304 Not Modified` with no body and all required cache headers.
- PUT/PATCH/DELETE endpoints on concurrently-modifiable resources require `If-Match` and return `412 Precondition Failed` on ETag mismatch.
- Successful mutation responses include the updated `ETag` header for the new resource version.
- `304 Not Modified` responses include `Cache-Control`, `ETag`, and `Vary` headers per RFC 9110 requirements.
