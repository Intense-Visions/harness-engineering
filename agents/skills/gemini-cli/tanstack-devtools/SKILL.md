# TanStack Query DevTools

> Inspect cache state, query status, and network activity using the React Query DevTools panel

## When to Use

- Debugging why a query is refetching unexpectedly
- Inspecting cache entries to verify data shape and freshness
- Verifying that mutations correctly invalidate the expected queries
- Checking query key structures and deduplication behavior
- Understanding `staleTime`, `gcTime`, and observer counts for performance tuning

## Instructions

1. Install `@tanstack/react-query-devtools` as a dev dependency — never ship it to production accidentally.
2. Import and render `<ReactQueryDevtools>` inside your `QueryClientProvider` — it mounts a floating panel in the browser.
3. Use `initialIsOpen={false}` (default) to keep the panel collapsed at startup — it opens on demand via the TanStack logo button.
4. Use `buttonPosition` to move the toggle button away from UI elements: `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`.
5. Guard with a process.env check or use dynamic import to ensure DevTools code is never bundled in production builds.
6. Use the query panel's "Refetch" button to manually trigger a refetch — useful for testing refetch behavior without network changes.
7. Click a query entry to see its key, status (`fresh`, `stale`, `fetching`, `paused`), `staleTime`, `gcTime`, observer count, and cached data.

```typescript
// app/providers.tsx — QueryClientProvider with DevTools
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60 * 1000 },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools only loads in development — tree-shaken in production */}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  );
}

// Alternative: dynamic import to guarantee no production bundle impact
import dynamic from 'next/dynamic';

const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(() =>
        import('@tanstack/react-query-devtools').then(mod => ({
          default: mod.ReactQueryDevtools,
        }))
      )
    : () => null;
```

## Details

The React Query DevTools panel has three main areas:

**Query panel (left sidebar):** Lists all cached queries with color-coded status indicators. Green = fresh, yellow = stale, gray = inactive, blue = fetching, red = error. The number in parentheses is the observer count — how many components are currently subscribed to that query.

**Query details (right panel):** Clicking a query shows its full key, current status, `staleTime`, `gcTime`, last updated timestamp, observer count, and the raw cached data in an expandable JSON tree. This is the primary tool for debugging key mismatches and stale data issues.

**Actions:** Each query entry has actions: `Refetch` (triggers an immediate background refetch), `Invalidate` (marks stale and refetches active), `Reset` (removes cached data), and `Remove` (evicts from cache). These allow debugging cache behavior without modifying code.

**Status meanings:**

- `fresh`: data is within `staleTime` — will not refetch on mount
- `stale`: `staleTime` expired — will refetch on next mount or window focus
- `fetching`: active network request in progress
- `paused`: query is paused (offline or network issue)
- `inactive`: no components are subscribed — GC timer is running
- `error`: last fetch failed

**Observer count:** An observer count of `0` means no component is mounted that uses this query — the GC timer is running. Once it hits `0` and `gcTime` expires, the entry is removed. Multiple observers on the same query means multiple components share one cache entry.

**Production safety:** `@tanstack/react-query-devtools` is automatically excluded from production builds when using Next.js or Vite's tree-shaking if imported conditionally. The `process.env.NODE_ENV === 'development'` guard ensures zero bundle impact.

## Source

https://tanstack.com/query/latest/docs/framework/react/devtools

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
