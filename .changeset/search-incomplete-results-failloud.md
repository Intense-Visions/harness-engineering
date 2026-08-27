---
'@harness-engineering/core': minor
---

Fail loud on GitHub Search API truncation (Refs #1532). `GitHubHttp` gains a
budget-aware `search()` method that throws the existing `TruncatedFetchError`
when a search response reports `incomplete_results: true`, instead of returning
the partial `items` as if complete — the search-API counterpart to the
paginate-truncation guard landed in #1589. `GitHubIssuesTrackerAdapter.searchFeatures()`
wires this into a real, `github.search`-budgeted call site: a truncated search
is surfaced as `Err`, never a silently-short feature list. Byte-identical when
`incomplete_results` is `false` or absent.
