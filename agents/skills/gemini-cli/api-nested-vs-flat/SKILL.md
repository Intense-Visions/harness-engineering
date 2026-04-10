# Nested vs Flat Resource URLs

> Nested URLs express ownership hierarchies; flat URLs with query parameters express arbitrary membership or filtering. The decision affects URL stability, caching, access control, and client complexity.

## When to Use

- Designing a URL structure for a resource that belongs to a parent (comments on a post, items in an order)
- Deciding whether a resource should live at `/parents/{id}/children` or `/children?parentId={id}`
- Reviewing a PR that adds a deeply nested route (three or more levels)
- Evaluating URL stability when a resource might be re-parented or accessed in multiple contexts
- Explaining to a team why `/users/42/posts/7/comments/3/likes` is problematic

## Instructions

### Key Concepts

**Nested URLs** encode the parent-child relationship in the path:

```
GET /users/42/posts
GET /users/42/posts/7/comments
```

**Flat URLs with filters** move the parent relationship to a query parameter:

```
GET /posts?userId=42
GET /comments?postId=7
```

**Decision criteria:**

| Signal                                           | Prefer Nested                        | Prefer Flat                   |
| ------------------------------------------------ | ------------------------------------ | ----------------------------- |
| Resource cannot exist without parent             | Yes (comment without post)           | No                            |
| Resource has only one parent type                | Yes                                  | No (if multiple parent types) |
| Client always knows the parent ID                | Yes                                  | Depends                       |
| Resource is accessed in multiple parent contexts | No                                   | Yes                           |
| URL depth would exceed 2 levels                  | No                                   | Yes                           |
| Access control is scoped to parent               | Yes (URL structure aids enforcement) | No                            |

**The two-level rule:** Nest a maximum of two levels. `/users/42/posts` is acceptable. `/users/42/posts/7/comments` is at the limit. `/users/42/posts/7/comments/3/likes` is too deep — flatten it.

**Flattening deep hierarchies:**

```
# Deep (avoid)
GET /users/42/posts/7/comments/3/likes

# Flat (prefer)
GET /likes?commentId=3

# Or: flat canonical URL with nested alias
GET /comments/3/likes   (nested, 2 levels from canonical comment resource)
```

### Worked Example

A blogging platform has posts, comments, and likes on comments.

**Draft 1 — fully nested:**

```
GET    /users/42/posts                     → user's posts
GET    /users/42/posts/7                   → single post
POST   /users/42/posts/7/comments          → add comment
GET    /users/42/posts/7/comments          → post's comments
POST   /users/42/posts/7/comments/3/likes  → like a comment
GET    /users/42/posts/7/comments/3/likes  → comment's likes
```

Problem: to fetch comment 3's likes, the client must know the user ID (42), post ID (7), and comment ID (3). If the comment is later moved to a different post, every URL breaks. The client must carry the full ancestry chain.

**Draft 2 — two-level nesting with flat deep resources:**

```
GET    /posts?authorId=42                  → filter by author (flat)
GET    /posts/7                            → canonical post URL (flat)
POST   /posts/7/comments                  → comments on a post (1 level nesting, OK)
GET    /posts/7/comments                  → comments on a post
POST   /comments/3/likes                  → likes on a comment (1 level nesting, OK)
GET    /comments/3/likes                  → comment's likes
```

Likes also get a canonical flat address:

```
GET    /likes?commentId=3                 → same data, filterable
```

The client no longer needs the post's parent user to fetch a comment's likes. Comment 3 has a canonical URL (`/comments/3`) that is stable even if the comment moves to a different post.

**Access control with nested URLs:**

Nested URLs make scope-based access control natural. Middleware can extract the parent ID from the path and enforce ownership before the handler runs:

```
GET /organizations/org-7/projects/proj-12/members
```

The middleware verifies the requester belongs to `org-7` before checking project membership. The ownership chain is explicit in the URL. This is a genuine benefit of nesting.

### Anti-Patterns

1. **Deep nesting beyond two levels.** Each additional level makes URLs brittle (break on re-parenting), harder to cache, and harder to construct for clients. `/a/{id}/b/{id}/c/{id}/d/{id}` is a symptom of modeling the database schema rather than the access patterns.

2. **Duplicating the same resource under multiple parents.** If comments are accessible at both `/posts/7/comments/3` and `/articles/7/comments/3`, you have two canonical URLs for the same resource. Clients and caches disagree on staleness. Pick one canonical URL; use the other as an alias with a redirect if needed.

3. **Nesting resources that can have multiple parent types.** A file attached to a message, a project, and an invoice should live at `/files/{id}` with filters (`?messageId=`, `?projectId=`), not nested under each parent type.

4. **Using nested URLs to express filtering.** `/users/42/orders/active` — is `active` a sub-resource or a filter? If it is a filter, use `/orders?userId=42&status=active`. Reserve nesting for genuine ownership relationships.

## Details

### When Flat Wins: The Multi-Parent Problem

GitHub's pull request reviews illustrate the tradeoff:

```
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

This is deep (4 levels) but each ancestor is required context: you cannot review a pull request without knowing the repo and owner. The full ancestry is always available to the client. GitHub accepts the depth because the parent chain is always known and stable.

Contrast with tags, which can belong to issues, pull requests, or releases:

```
# What GitHub does NOT do:
GET /repos/{owner}/{repo}/issues/{issue_number}/labels  (nested)
GET /repos/{owner}/{repo}/labels                        (flat — label registry)
```

Labels are fetched from the issue context when reviewing an issue, but the label registry is flat. Multi-parent resources that need to be listed independently belong at a flat URL.

### Canonical URL and Aliases

A resource should have one canonical URL. Nested URLs can serve as scoped aliases that redirect to the canonical form:

```
GET /posts/7/comments/3
→ 301 Moved Permanently
Location: /comments/3
```

Or serve the same response from both paths and set `Content-Location: /comments/3` to signal the canonical address. This keeps nested URLs useful for navigation while ensuring cache consistency.

## Source

- Masse, M. "REST API Design Rulebook" O'Reilly (2011)
- [Microsoft REST API Guidelines — URL Structure](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md)
- [GitHub REST API Docs](https://docs.github.com/en/rest) — practical examples of nesting vs flat
- [RFC 3986 — URI Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986)

## Process

1. For each resource, ask: "Can this resource exist without its parent?" If no, nesting is appropriate. If yes, flat with filter parameters is safer.
2. Count nesting depth. If the URL exceeds 2 levels, flatten deeper children to their own top-level collection with filter parameters.
3. Check for multi-parent resources. If a resource belongs to more than one parent type, use a flat canonical URL with filter parameters.
4. Define a canonical URL for every resource. Nested aliases may exist but must redirect to or agree with the canonical.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-resource-modeling, api-filtering-sorting, api-resource-granularity

## Success Criteria

- URL nesting does not exceed two levels for any resource.
- Resources that can exist independently of their parent have a canonical flat URL.
- Multi-parent resources use flat URLs with query parameter filters.
- Every resource has exactly one canonical URL; nested aliases redirect to the canonical form.
