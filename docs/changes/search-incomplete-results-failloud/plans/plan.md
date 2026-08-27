# Plan: Fail loud on GitHub Search `incomplete_results`

Refs #1532. Proposal: `../proposal.md`.

## Tasks

1. **`GitHubHttp.search<T>()`** (`packages/core/src/roadmap/tracker/adapters/github-http.ts`)
   - Add a paginating search method that goes through the existing `request()`
     path (budget + throttle inherited).
   - Parse `{ total_count, incomplete_results, items }`.
   - `incomplete_results === true` → `throw new TruncatedFetchError(this.resource, url)`.
   - `false`/absent → accumulate `items`, follow `Link: rel="next"` normally.
   - Return `{ items, totalCount }`.

2. **`GitHubIssuesTrackerAdapter.searchFeatures(query)`** (`.../adapters/github-issues.ts`)
   - Add a `github.search`-budgeted `GitHubHttp` instance.
   - Build repo-scoped query URL for `/search/issues`.
   - Call `search<RawIssue>()`, filter out PRs, map to `TrackedFeature[]`.
   - Wrap in try/catch → `Result`; `TruncatedFetchError` becomes `Err`.

3. **Tests**
   - `github-http.test.ts`: `search` throws `TruncatedFetchError` on
     `incomplete_results: true`; returns items on `false`; identical on absent.
   - `github-issues.test.ts`: `searchFeatures` returns `Err` on truncation;
     returns mapped features on happy path; scopes the query to the repo.

4. **Docs / gates**
   - `pnpm run generate-docs` if any CLI/reference surface changed (none expected).
   - Rebuild CLI before commit (pre-commit arch gate); `prettier --write`.

## Verification

- `incomplete_results: true` → throws (unit) and → `Err` (adapter).
- `false`/absent → byte-identical returns.
- Live trace: `searchFeatures` → `searchHttp.search` (resource `github.search`)
  → `incomplete_results` check → `TruncatedFetchError` → `Err`.
- All-OS CI green.
