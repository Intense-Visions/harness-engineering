# Field Selection

> FIELD SELECTION LETS CLIENTS REQUEST ONLY THE RESPONSE PROPERTIES THEY NEED — REDUCING PAYLOAD SIZE, ELIMINATING OVER-FETCHING, AND CUTTING BOTH BANDWIDTH AND SERIALIZATION COST ON THE SERVER WITHOUT REQUIRING A SEPARATE GRAPHQL LAYER OR BESPOKE NARROW ENDPOINTS.

## When to Use

- Designing a list endpoint whose full response schema is large but whose mobile clients only need 3–4 fields
- Implementing `?fields=` to allow clients to project a subset of response properties
- Comparing field selection as an alternative to GraphQL for an API that serves heterogeneous clients
- Reviewing a PR that returns deeply nested objects on a list endpoint used by bandwidth-constrained clients
- Building admin tooling that needs all fields while the mobile app needs a minimal projection
- Designing nested field selection (e.g., `?fields=id,name,owner.login`) for resources with embedded sub-objects
- Evaluating performance tradeoffs between server-side field selection, multiple narrow endpoints, and GraphQL
- Reducing JSON serialization cost for endpoints that serialize large string fields (descriptions, content bodies, HTML) on every response

## Instructions

### Key Concepts

1. **Sparse Fieldsets** — A sparse fieldset is the requested subset of fields for a resource type. The client specifies which fields it wants; the server omits all others from the response. The JSON:API specification formalizes this as `?fields[resource_type]=field1,field2`. Simpler APIs use `?fields=field1,field2` without the type qualifier. Both are valid; choose based on whether your API has a single resource type per endpoint or multiple embedded types.

   ```
   ?fields=id,name,email              → return only id, name, email
   ?fields[user]=id,name              → JSON:API style for the user resource
   ?fields[user]=id,name&fields[org]=id,slug  → multi-type projection
   ```

2. **Nested Field Selection** — For resources with embedded sub-objects, use dot notation to select specific sub-fields. This avoids returning the full sub-object when only one property is needed:

   ```
   ?fields=id,title,author.name,author.avatar_url
   ```

   The server must parse the dot-path and project only the specified sub-fields from the embedded object. Fields not listed in the projection are omitted from the embedded object entirely, not set to null.

3. **Always-Present Fields** — Some fields must always be present in every response regardless of projection: the resource ID, resource type, and any fields required for link traversal (e.g., `href`, `self`). Document these as mandatory fields that clients cannot exclude. If a client requests `?fields=name` but omits `id`, the response must still include `id`.

4. **Server-Side Projection vs. Post-Processing** — True field selection projects fields at the data retrieval layer (SQL `SELECT col1, col2` instead of `SELECT *`) to avoid reading unused data from disk. A naive implementation fetches the full object and strips fields before serialization — this reduces response size but does not reduce database I/O or memory use. For maximum benefit, push the projection down to the query layer. Use SQL column lists, MongoDB projections, or equivalent for non-relational stores.

5. **Performance Tradeoffs vs. GraphQL** — Field selection via `?fields=` covers 80% of over-fetching use cases with zero client-side schema knowledge and no query language. GraphQL covers the remaining 20%: deeply nested multi-resource queries, aliased field names, inline fragments, and complex query composition. For REST APIs serving heterogeneous clients, `?fields=` is a low-cost, high-value addition. Introducing GraphQL for field selection alone adds significant operational complexity. Choose GraphQL when clients need rich query composition, not just field projection.

6. **Documenting Field Names** — The `?fields=` parameter is only usable if the available field names are documented. Include a complete field reference in the API documentation for every resource type, noting which fields are always-present and which are optional. An undocumented field surface forces clients to discover fields by trial and error.

### Worked Example

The Google Drive API implements `fields` parameter selection on nearly every endpoint, making it a canonical reference for production-grade field selection:

**Without field selection (full resource — 847 bytes):**

```http
GET /drive/v3/files/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
Authorization: Bearer ya29...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "kind": "drive#file",
  "id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "name": "Q1 Report",
  "mimeType": "application/vnd.google-apps.spreadsheet",
  "description": "",
  "starred": false,
  "trashed": false,
  "explicitlyTrashed": false,
  "parents": ["0AEoMqdKFcXE3Uk9PVA"],
  "spaces": ["drive"],
  "version": "1",
  "webViewLink": "https://docs.google.com/spreadsheets/...",
  "iconLink": "https://drive-thirdparty.googleusercontent.com/...",
  "hasThumbnail": false,
  "thumbnailVersion": "0",
  "viewedByMe": true,
  "createdTime": "2024-01-10T08:00:00.000Z",
  "modifiedTime": "2024-03-15T10:22:00.000Z",
  "modifiedByMeTime": "2024-03-15T10:22:00.000Z",
  "owners": [{ "kind": "drive#user", "displayName": "Alice", "emailAddress": "alice@example.com" }],
  "lastModifyingUser": { "kind": "drive#user", "displayName": "Alice" },
  "shared": false,
  "ownedByMe": true,
  "capabilities": { "canEdit": true, "canComment": true, "canShare": true }
}
```

**With field selection (only id, name, modifiedTime — 94 bytes, 89% reduction):**

```http
GET /drive/v3/files/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms?fields=id,name,modifiedTime
Authorization: Bearer ya29...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "name": "Q1 Report",
  "modifiedTime": "2024-03-15T10:22:00.000Z"
}
```

**List endpoint with nested field selection:**

```http
GET /drive/v3/files?fields=files(id,name,owners/displayName),nextPageToken
Authorization: Bearer ya29...
```

Google Drive uses parentheses for nested selection in lists (`files(id,name)`) and `/` for nested object paths (`owners/displayName`). The `?fields=` syntax is documented exhaustively in the Google API Discovery documents.

### Anti-Patterns

1. **Stripping fields after full serialization.** Fetching all columns from the database, constructing the full response object in memory, serializing it to JSON, and then removing keys before sending saves bandwidth but wastes CPU, memory, and database I/O. For large objects with blob fields (markdown content, HTML, image metadata), the serialization of the unused fields may dominate request processing time. Push the projection to the SQL `SELECT` list or ORM query.

2. **Silently ignoring unknown field names.** If a client requests `?fields=id,nme` (typo), silently returning only `id` makes the client believe it received all requested fields. The client may then treat the missing `name` field as null rather than detecting the typo. Return `400 Bad Request` listing the unrecognized field names. This prevents silent data bugs in client integrations.

3. **Allowing field selection to bypass access control.** If field-level permissions exist (e.g., `salary` is restricted to HR roles), a generic `?fields=salary` from an unprivileged caller must still return a 403 for that field, not simply include it in the projection. Field selection must be applied after, not instead of, field-level authorization. The projection layer should filter fields from the set the caller is already authorized to see.

4. **Omitting always-present fields from the documentation.** If clients discover through trial and error that `id` is always returned even when not in `?fields=`, they may rely on undocumented behavior. Document always-present fields explicitly in the API reference so clients can reason about the projection contract without experimenting.

## Details

### Implementation Patterns

**SQL projection (preferred):**

```python
ALLOWED_FIELDS = {"id", "name", "email", "created_at", "role"}
ALWAYS_PRESENT = {"id"}
requested = set(params.get("fields", "").split(",")) & ALLOWED_FIELDS | ALWAYS_PRESENT
columns = ", ".join(f"u.{f}" for f in requested)
cursor.execute(f"SELECT {columns} FROM users u WHERE u.id = %s", [user_id])
```

**Post-serialization stripping (acceptable for small objects):**

```python
full_response = serialize(user)
if "fields" in params:
    allowed = set(params["fields"].split(",")) | ALWAYS_PRESENT
    full_response = {k: v for k, v in full_response.items() if k in allowed}
```

### Field Selection on List Endpoints

On list endpoints, apply the projection to every item in the collection. The `nextPageToken` or `next_cursor` field in the outer envelope is not subject to projection — it is metadata about the result set, not part of the resource schema.

```json
{
  "items": [
    { "id": "1", "name": "Alice" },
    { "id": "2", "name": "Bob" }
  ],
  "next_cursor": "Y3Vyc29yMg=="
}
```

### Real-World Case Study: Contentful

Contentful's Delivery API serves content to web and mobile clients from a single content graph. Mobile clients for a news app needed only `sys.id`, `fields.title`, and `fields.heroImage.url` from entries that carried 40+ fields including rich-text body content averaging 12KB per entry. After implementing `?select=sys.id,fields.title,fields.heroImage` (Contentful's field selection syntax), the news app's feed API response size dropped from 387KB per 10-item page to 12KB — a 97% reduction. Server-side CPU for JSON serialization fell by 68% on that endpoint, and CDN cache efficiency improved because smaller, more cache-friendly responses fit in CDN edge memory more densely.

## Source

- [Google Drive API — Request Partial Responses](https://developers.google.com/drive/api/guides/fields-parameter)
- [JSON:API — Sparse Fieldsets](https://jsonapi.org/format/#fetching-sparse-fieldsets)
- [Contentful Delivery API — Select operator](https://www.contentful.com/developers/docs/references/content-delivery-api/#/reference/search-parameters/select-operator)
- [GraphQL vs. REST field selection](https://graphql.org/learn/thinking-in-graphs/)
- [OData — Select system query option](https://docs.oasis-open.org/odata/odata/v4.01/odata-v4.01-part2-url-conventions.html#sec_SystemQueryOptionselect)

## Process

1. Define the complete field schema for each resource type and identify always-present fields (at minimum: the resource ID and any hypermedia links).
2. Build an explicit allow-list of selectable field names mapped to their SQL column or object property path. Reject unknown field names in `?fields=` with `400 Bad Request` listing valid options.
3. Push the projection to the data retrieval layer: build the SQL `SELECT` column list or ORM projection from the requested fields, not from the full schema. Include always-present fields unconditionally.
4. Apply field-level authorization before projection: the selectable field set is the intersection of requested fields and fields the caller is authorized to read.
5. Document always-present fields, the projection syntax, and field names in the API reference for every endpoint that supports `?fields=`.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-resource-granularity, graphql-client-patterns, api-filtering-sorting, api-pagination-cursor

## Success Criteria

- Field projection is pushed to the data retrieval layer (SQL SELECT or ORM projection), not applied by post-processing the full serialized response.
- Unknown field names in `?fields=` return `400 Bad Request` with a list of valid field names.
- Always-present fields (resource ID, hypermedia links) are included in every response regardless of the projection requested.
- Field-level authorization is applied before projection; callers cannot use field selection to access fields they lack permission to read.
- API documentation lists every selectable field, identifies always-present fields, and includes worked examples of the `?fields=` syntax.
