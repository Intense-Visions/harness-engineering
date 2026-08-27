# Proposal: Fail loud on GitHub Search `incomplete_results` truncation

Refs #1532 (deferred slice of the rate-limit-aware fan-out governor landed in PR #1589).

## Problem

PR #1589 made the GitHub fan-out rate-limit-aware and introduced a hard
fail-on-truncation rule for the GitHub HTTP layer (`GitHubHttp`): a throttled
fetch throws `ThrottledFetchError`, and a paginated GET that is server-truncated
(a short page still advertising `Link: rel="next"`) throws `TruncatedFetchError`
rather than returning a silently-short list.

That work explicitly deferred one truncation channel: the **GitHub Search API**.
Search endpoints (`/search/issues`, `/search/code`, …) return an envelope
`{ total_count, incomplete_results, items }` and set `incomplete_results: true`
when the query timed out or was truncated server-side. A consumer that reads
`items` without inspecting `incomplete_results` treats a partial result as
complete — the exact silent-under-fetch failure mode (287/430 repos read as
zero) that motivated #1532, just on a different API family.

At the time of this change there is **no live GitHub Search API call site** in
the codebase — `github.search` exists only as a per-resource budget key
(`limit: 10/min` in `workflow/config.ts`) reserved for the search family. The
fix is therefore build-out: add the canonical search plumbing with the
truncation check baked in, so the first (and every) consumer fails loud by
construction rather than re-discovering the trap.

## Goals

- Detect `incomplete_results: true` on any GitHub Search response in the
  fetch/search path and throw the **existing** `TruncatedFetchError`
  (from `@harness-engineering/core` → `fleet/rate-budget`, landed in #1589) —
  do NOT define a new error type.
- Keep it consistent with how #1589 handles paginate-truncation: the truncated
  operation FAILS instead of returning accumulated-so-far items.
- Byte-identical behaviour when `incomplete_results` is `false` or absent.
- Wire the check into a real, reachable search call site so a reviewer can
  trace a live search → the `incomplete_results` check → `TruncatedFetchError`.

## Non-goals (remaining deferred siblings of #1532)

- Cross-process / cross-run cooldown sharing of the search budget.
- Broader per-API truncation coverage beyond search + paginate.
- Migrating the existing list-based `fetchAll()` onto the Search API (search
  caps at 1000 results + 10 req/min; the label-list endpoint is correct there).

## Design

### 1. `GitHubHttp.search<T>()` — the search call site

A new method on the existing budget-aware `GitHubHttp` (the same class #1589
wired throttle/paginate-truncation into). It issues Search API GETs through the
same `request()` path (so it inherits the shared per-resource budget, shared
backoff, and throw-on-throttle for free), then:

- Parses the search envelope `{ total_count, incomplete_results, items }`.
- If `incomplete_results === true` → `throw new TruncatedFetchError(resource, url)`.
- Otherwise accumulates `items` and paginates normally (search paginates via
  `Link: rel="next"`; for search, a `rel="next"` link is _ordinary_ paging, NOT
  truncation — `incomplete_results` is the truncation signal, so rel=next is
  followed rather than treated as a failure).

`incomplete_results` absent or `false` → the `=== true` guard is false → no
throw → identical accumulation as before (byte-identical requirement).

### 2. `GitHubIssuesTrackerAdapter.searchFeatures(query)` — the live consumer

A real, reachable public capability: free-text search over harness-managed
issues in the adapter's configured repo. It builds a repo-scoped query
(`<query> repo:owner/repo`, confused-deputy-consistent with the rest of the
adapter), issues it through a `github.search`-budgeted `GitHubHttp`, maps the
result items to `TrackedFeature[]`, and returns a `Result`. A
`TruncatedFetchError` thrown by the plumbing is caught by the adapter's
try/catch and surfaced as `Err(...)` — fail-loud, never a silently-short list.

The search request is budgeted under the `github.search` resource
(10 req/min per #1532's measurement) via a dedicated `GitHubHttp` instance,
distinct from the `github.core` client used by the list/CRUD path.

## Acceptance criteria

- [ ] A search response with `incomplete_results: true` throws
      `TruncatedFetchError` (the existing type) — no partial `items` returned.
- [ ] A search response with `incomplete_results: false` returns its items.
- [ ] A search response with `incomplete_results` absent behaves identically to
      `false` (byte-identical).
- [ ] `searchFeatures()` surfaces the truncation as `Err`, and returns mapped
      features on the happy path.
- [ ] The search path is budgeted under `github.search`.
