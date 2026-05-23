# Pattern: Skeleton (Content-Matched)

> Paper pattern authored against the catalog/patterns schema (spec lines 233–259).
> Sprint 0 deliverable #2 of 3 paper patterns.

```yaml
id: pattern-skeleton-content-matched
kind: pattern
name: Skeleton (Content-Matched)
version: 1
status: stable
authoredAt: 2026-05-23
contributors: [@chadjw]
source:
  ref: 'linear-app#loading-state'
  url: https://linear.app
applicableTo:
  - { kind: 'component-name', match: 'Spinner' }
  - { kind: 'component-name', match: 'Loading' }
  - { kind: 'jsx-text', match: 'Loading...' }
when: |
  Loading state is represented by a generic spinner or "Loading..." text
  that gives no preview of what's about to appear. Eye lands on the
  spinner, then has to re-orient when content arrives. This punishes
  the user for waiting.
suggest: |
  Replace with a content-matched skeleton that mirrors the layout of
  the about-to-appear content (same row counts, same column widths,
  same aspect ratios). Use a subtle shimmer (gradient sweep, 1.5s
  cycle) or a static muted-fill. Skeleton blocks should match the
  expected text width within ~20% so the layout doesn't reflow on
  arrival.
  Pair with `prefers-reduced-motion` to disable the shimmer animation
  (fall back to static fill).
before: |
  {isLoading && <Spinner />}
  {data && <UserList users={data} />}
after: |
  {isLoading && (
    <UserListSkeleton rows={data?.length ?? 5} />
  )}
  {data && <UserList users={data} />}

  // UserListSkeleton mirrors UserList: same avatar circle, same
  // 60%-width name bar, same 40%-width metadata bar per row.
findingTemplate:
  code: CRAFT-P002
  tier: polish
  impact: large
```

## Notes for schema-fit review

- `applicableTo` here matches on `component-name` (text-match on
  imported component) and `jsx-text` (text inside JSX). Both are new
  `kind` values relative to the spring-physics pattern — schema must
  remain open-ended on `kind`.
- The before/after example spans multiple lines including a comment.
  Schema literal blocks must allow embedded comments.
- `impact: large` is appropriate even though `tier: polish` — schema
  must allow any tier × impact combination per spec line 131-132.
