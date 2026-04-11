# Filtering and Sorting

> WELL-DESIGNED FILTER AND SORT PARAMETERS GIVE CLIENTS PRECISE CONTROL OVER RESULT SETS WITHOUT REQUIRING BESPOKE ENDPOINTS — BUT POORLY DESIGNED QUERY PARAMETERS INVITE INJECTION ATTACKS, PRODUCE UNINDEXED TABLE SCANS, AND LEAK INTERNAL SCHEMA DETAILS THAT BECOME BREAKING CHANGES WHEN THE DATA MODEL EVOLVES.

## When to Use

- Designing query parameters for a list endpoint that returns large result sets
- Implementing server-side filtering so clients do not download all records and filter in memory
- Choosing a filter operator syntax (`?status=active` vs. `?filter[status]=active` vs. `?q=status:active`)
- Adding multi-field sorting with direction control (`?sort=-created_at,name`)
- Reviewing a PR that passes filter parameters directly into a SQL query without sanitization
- Building a search-like endpoint that needs range queries, `IN` lists, and substring matches
- Evaluating whether a filter field should be backed by an index before exposing it in the API
- Designing filter parameter naming for consistency across multiple list endpoints in an API surface

## Instructions

### Key Concepts

1. **Filter Operator Vocabulary** — Define a consistent set of operators for every filter-capable field. At minimum, support equality and set membership. For orderable types (dates, numbers, strings), support range operators:

   | Operator    | Meaning                       | Example                             |
   | ----------- | ----------------------------- | ----------------------------------- |
   | `eq`        | Exact match (default)         | `?status=active`                    |
   | `ne`        | Not equal                     | `?filter[status][ne]=archived`      |
   | `gt`, `lt`  | Greater/less than (exclusive) | `?filter[amount][gt]=100`           |
   | `gte`,`lte` | Greater/less than or equal    | `?filter[created][gte]=2024-01-01`  |
   | `in`        | Member of a set               | `?filter[status][in]=active,paused` |
   | `contains`  | Substring or array contains   | `?filter[name][contains]=acme`      |
   | `null`      | Is null / is not null         | `?filter[deleted_at][null]=true`    |

2. **Sort Syntax** — Use a single `sort` parameter with comma-separated fields. Prefix a field name with `-` to indicate descending order. This convention is followed by JSON:API and many major APIs and is unambiguous:

   ```
   ?sort=-created_at,name       → ORDER BY created_at DESC, name ASC
   ?sort=priority,-updated_at   → ORDER BY priority ASC, updated_at DESC
   ```

   Reject unknown sort fields with `400 Bad Request` and a list of allowed sort fields in the error body. Never silently ignore unsupported sort fields.

3. **Filter Injection Prevention** — Filter parameters must never be interpolated directly into SQL. Always use parameterized queries or a query builder that maps field names to safe column references through an explicit allow-list. An API that passes `?filter[field]=users WHERE 1=1--` to a raw SQL string is vulnerable to SQL injection. Map every filterable field name to a concrete column reference in code; reject any field name not on the allow-list with `400 Bad Request`.

4. **Performance Hints and Index Budget** — Every filterable field exposed in the API should be backed by a database index. Before adding a new filter field, verify the query plan. Exposing an un-indexed field in a public API invites callers to trigger full table scans at scale. Document which filter combinations are supported and which trigger a hint that index coverage is partial (e.g., `?filter[free_text]` triggers a full-text index, not a B-tree scan).

5. **Filter Combination Semantics** — When multiple filter parameters are present, document whether they combine as AND (the default and most intuitive) or OR. Most REST APIs use AND semantics: `?status=active&priority=high` returns records where both conditions are true. If OR semantics are needed, make them explicit: `?filter[or][0][status]=active&filter[or][1][status]=paused` or accept a structured filter body via POST.

6. **Sort Stability** — When no sort parameter is specified, use a stable default that does not change between requests. An unstable default sort (e.g., database insertion order without a tiebreaker) causes non-deterministic page ordering that breaks cursor pagination. Always include the primary key as the final tiebreaker in any sort, whether default or client-specified.

### Worked Example

The GitHub REST API provides fine-grained filtering and sorting on its Issues endpoint, demonstrating production-grade query parameter design:

**Filter by state and assignee, sorted by comment count descending:**

```http
GET /repos/octocat/hello-world/issues?state=open&assignee=monalisa&sort=comments&direction=desc&per_page=5
Authorization: Bearer ghp_...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-RateLimit-Remaining: 59

[
  {
    "id": 1001,
    "number": 42,
    "title": "Fix the login bug",
    "state": "open",
    "comments": 14,
    "assignee": { "login": "monalisa" },
    "created_at": "2024-02-10T09:00:00Z",
    "updated_at": "2024-03-15T10:00:00Z"
  },
  {
    "id": 998,
    "number": 39,
    "title": "Update README",
    "state": "open",
    "comments": 3,
    "assignee": { "login": "monalisa" },
    "created_at": "2024-01-20T08:00:00Z",
    "updated_at": "2024-03-10T11:00:00Z"
  }
]
```

**Filter by date range using `since`:**

```http
GET /repos/octocat/hello-world/issues?state=closed&since=2024-01-01T00:00:00Z
Authorization: Bearer ghp_...
```

GitHub's parameter naming is flat (`sort`, `direction`, `state`) rather than bracket-notation. This is a pragmatic choice for a small, fixed operator set. For APIs with many operators or dynamic filter fields, bracket notation (`filter[field][op]=value`) scales better.

### Anti-Patterns

1. **Passing filter parameter values directly into SQL strings.** A query like `"SELECT * FROM users WHERE " + params["filter"]` is a textbook SQL injection vulnerability. Always use parameterized queries. Map filter field names to column references through an explicit allow-list in code:

   ```python
   # Wrong
   cursor.execute(f"SELECT * FROM orders WHERE {field} = '{value}'")

   # Correct
   ALLOWED_FIELDS = {"status": "orders.status", "created_at": "orders.created_at"}
   column = ALLOWED_FIELDS.get(field)
   if column is None:
       raise ValidationError(f"Unknown filter field: {field}")
   cursor.execute(f"SELECT * FROM orders WHERE {column} = %s", [value])
   ```

2. **Exposing un-indexed filter fields without documentation.** Allowing `?filter[description][contains]=invoice` on a varchar column without a full-text index causes a sequential scan on every request. At 1M+ rows, this degrades response time to seconds and can saturate the database under moderate traffic. Either add an index, use a dedicated search engine for text filters, or explicitly document that certain filters are not suitable for high-frequency use.

3. **Silently ignoring unknown filter or sort fields.** When a caller typos a filter field (`?staus=active`), a silent ignore returns the full unfiltered result set — the caller believes the filter was applied and may make incorrect decisions based on the unfiltered data. Always return `400 Bad Request` with a descriptive error listing the valid field names. This surfaces typos immediately rather than causing silent data quality bugs.

4. **Using sort without a tiebreaker.** `ORDER BY updated_at DESC` is non-deterministic when multiple rows share the same `updated_at` timestamp. The database may return these rows in different orders on each query, causing cursor pagination to skip or repeat rows. Always append the primary key as the final sort tiebreaker: `ORDER BY updated_at DESC, id DESC`.

## Details

### RSQL: A Standard Filter Grammar

[RSQL](https://github.com/jirutka/rsql-parser) (RESTful Service Query Language) is a superset of the FIQL feed query language that provides a URL-safe filter expression syntax used by several enterprise APIs:

```
?q=status==active;priority=gt=2     # status == active AND priority > 2
?q=status==active,status==paused    # status == active OR status == paused
?q=name=*acme*                       # name contains "acme"
```

RSQL is particularly useful when the filter space is large and dynamically defined, as in admin APIs or data-exploration endpoints. For most product APIs, simpler bracket-notation or flat key-value parameters are sufficient and easier for clients to construct without a library.

### Combining Filters with Pagination

When filter and sort parameters are combined with cursor pagination, every filter and sort value must be included in every subsequent page request — the cursor alone does not carry them. Design the paginated endpoint to treat `after`, `sort`, and all `filter` parameters as a single atomic query specification. If a client changes a filter parameter while advancing pages, treat it as a new query starting from page 1.

### Real-World Case Study: Salesforce SOQL-Style Filtering

Salesforce's REST API exposes a SOQL (Salesforce Object Query Language) endpoint that accepts structured queries as URL-encoded strings: `?q=SELECT+Id,Name+FROM+Account+WHERE+Industry='Technology'+ORDER+BY+Name+LIMIT+5`. For customers running large-scale reporting on multi-million-row orgs, Salesforce reported that migrating common filter patterns from ad-hoc field enumeration to indexed SOQL predicates reduced average query execution time by 73% and cut database CPU load by 45% during peak reporting windows.

## Source

- [JSON:API — Filtering](https://jsonapi.org/format/#fetching-filtering)
- [GitHub REST API — List repository issues](https://docs.github.com/en/rest/issues/issues#list-repository-issues)
- [OWASP — SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [RSQL Parser](https://github.com/jirutka/rsql-parser)
- [Stripe API — List all charges (filtering example)](https://stripe.com/docs/api/charges/list)

## Process

1. Define the allow-list of filterable fields: for each field, specify its type (string, number, date, enum), supported operators, and the backing database column. Reject any field name not on the allow-list with `400 Bad Request`.
2. Choose a filter parameter syntax (flat key-value, bracket notation, or RSQL) and document it consistently across all list endpoints in the API.
3. Implement parameterized query construction: map field names to column references in code, never via string interpolation. Verify the query plan for every filterable field; add indexes where missing.
4. Define and document sort field support: allowed sort fields, default sort, sort direction syntax (`-` prefix for DESC). Always append the primary key as a sort tiebreaker.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-nested-vs-flat, api-pagination-cursor, api-field-selection, db-query-rewriting

## Success Criteria

- All filter field names are validated against an explicit allow-list before use in query construction; unknown fields return `400 Bad Request`.
- Filter values are passed to the database via parameterized queries, never string interpolation.
- Every filterable field exposed in the API is backed by a database index; un-indexed filter fields are documented with performance caveats.
- Sort parameters include the primary key as a tiebreaker to ensure deterministic ordering.
- Filter combination semantics (AND vs. OR) are documented in the API reference for every list endpoint.
