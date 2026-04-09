# React Suspense Pattern

> Declaratively handle async loading states with React Suspense boundaries

## When to Use

- Lazy-loading components with `React.lazy()` — Suspense is required
- Data fetching with Suspense-enabled libraries (React Query, SWR with suspense option, Relay)
- You want loading states co-located with the UI rather than scattered in `useEffect`
- Building React 18+ applications with concurrent features

## Instructions

1. Wrap any component that may suspend with `<Suspense fallback={<LoadingUI />}>`.
2. Place Suspense boundaries at the granularity you want loading states — one per page, per section, or per widget.
3. Always pair Suspense boundaries with `<ErrorBoundary>` to handle promise rejections.
4. For lazy imports, use `React.lazy(() => import('./Component'))`.
5. Do not put Suspense boundaries inside loops — create a reusable wrapper component instead.

```typescript
const HeavyChart = React.lazy(() => import('./HeavyChart'));

function Dashboard() {
  return (
    <ErrorBoundary fallback={<p>Failed to load chart</p>}>
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## Details

Suspense works by components "throwing" a promise when they are not ready. React catches the promise at the nearest Suspense boundary and renders the fallback until the promise resolves.

**React 18 changes:** `startTransition` lets you mark state updates as non-urgent, preventing Suspense fallbacks from showing for fast transitions (the previous content stays visible until the new content is ready).

**Library support:** Not all data-fetching approaches support Suspense. Use libraries that explicitly support it (`useSuspenseQuery` in React Query, `use()` hook in React 18+ with compatible data sources).

**Common mistake:** Placing the Suspense boundary too high (at the page level) shows a full-page spinner for small widget loads. Granular boundaries improve perceived performance.

## Source

https://patterns.dev/react/suspense-pattern

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
