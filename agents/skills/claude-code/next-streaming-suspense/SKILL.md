# Next.js Streaming and Suspense

> Stream server-rendered HTML progressively using Suspense boundaries and loading.tsx

## When to Use

- Pages with slow data fetches where showing a skeleton immediately improves perceived performance
- Preventing a single slow component from blocking the entire page render
- Implementing loading UI without client-side state management
- Building shell-first UX (instant layout, streamed content)
- Integrating with React 18 concurrent features and Suspense-aware libraries

## Instructions

1. Create `loading.tsx` alongside `page.tsx` in any route segment — Next.js wraps the page in a `<Suspense>` boundary automatically.
2. Wrap individual slow components in `<Suspense fallback={<Skeleton />}>` for finer-grained streaming control.
3. Start data fetches before `await` to allow parallel fetching — initiate promises, then await them after wrapping in Suspense.
4. Use the `use()` hook in Client Components to unwrap a Promise passed as a prop, suspending until it resolves.
5. Never `await` a fetch at the top of a layout that wraps a Suspense boundary — this negates streaming by blocking the boundary parent.
6. Prioritize streaming for above-the-fold content — wrap below-the-fold slow sections in Suspense instead.
7. Keep `loading.tsx` as a Server Component — it can import static UI without any JS shipped to the client.

```typescript
// app/dashboard/page.tsx — parallel fetch with streaming
import { Suspense } from 'react';
import { MetricsSkeleton, ActivitySkeleton } from '@/components/skeletons';
import { Metrics } from './metrics';
import { Activity } from './activity';

export default function DashboardPage() {
  // Initiate fetches in parallel — do NOT await here
  const metricsPromise = fetchMetrics();
  const activityPromise = fetchActivity();

  return (
    <div>
      <Suspense fallback={<MetricsSkeleton />}>
        <Metrics promise={metricsPromise} />
      </Suspense>
      <Suspense fallback={<ActivitySkeleton />}>
        <Activity promise={activityPromise} />
      </Suspense>
    </div>
  );
}

// app/dashboard/metrics.tsx — async Server Component
async function Metrics({ promise }: { promise: Promise<Metric[]> }) {
  const metrics = await promise; // suspends until resolved
  return <MetricsList items={metrics} />;
}
```

## Details

Next.js implements streaming via HTTP chunked transfer encoding. The server sends the initial HTML shell immediately, then streams additional HTML chunks as Suspense boundaries resolve. The browser progressively renders each chunk without waiting for the full response.

**Suspense boundary placement:** Each `<Suspense>` boundary is an independent streaming unit. Content outside boundaries renders synchronously. Deeply nested boundaries allow granular streaming — the outermost boundary controls the shell, inner boundaries control content slots.

**loading.tsx convention:** Next.js automatically wraps `page.tsx` in a Suspense boundary when `loading.tsx` exists in the same directory. The `loading.tsx` file is the fallback. This is equivalent to `<Suspense fallback={<Loading />}><Page /></Suspense>`.

**Parallel vs sequential data fetching:** Two `await`s in sequence cause a waterfall — each fetch waits for the previous. Starting both fetches before any `await` (or using `Promise.all`) enables parallelism. With Suspense, each async Server Component can independently suspend without blocking siblings.

**Error handling with Suspense:** Pair each `<Suspense>` boundary with an `<ErrorBoundary>` (or co-locate `error.tsx`) to handle fetch failures gracefully within that stream segment.

**Trade-offs:** Streaming increases TTFB perception because the shell arrives fast, but Time to Fully Loaded may be similar. Streaming works best when content has natural priority ordering (fast shell, slower content).

## Source

https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
