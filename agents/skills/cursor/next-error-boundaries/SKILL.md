# Next.js Error Boundaries

> Handle runtime errors and missing routes gracefully with error.tsx and not-found.tsx

## When to Use

- Displaying a user-friendly error UI when a route segment throws during rendering or data fetching
- Providing a recovery mechanism (retry button) without reloading the entire page
- Customizing the 404 page for missing routes or resources
- Isolating errors so one failing segment does not crash the entire application
- Handling global uncaught errors at the root layout level

## Instructions

1. Create `error.tsx` in a route segment directory to catch errors thrown by that segment's `page.tsx` or its Server Components.
2. Mark `error.tsx` as a Client Component with `'use client'` — error boundaries must be Client Components.
3. Accept `error: Error & { digest?: string }` and `reset: () => void` props — `digest` is a server-side error ID for log correlation; `reset` re-renders the segment.
4. Create `global-error.tsx` in `app/` to catch errors from the root layout — it replaces the entire layout including `<html>` and `<body>`, so include them.
5. Call `notFound()` from `next/navigation` inside any Server Component to trigger the nearest `not-found.tsx`.
6. Create `not-found.tsx` in `app/` for a global 404 page, or in any route segment for segment-specific 404s.
7. Nest `error.tsx` closer to the throwing component to limit the error UI scope — a top-level `error.tsx` catches all descendant errors but shows a large recovery region.
8. Log the `error.digest` to your error monitoring service (Sentry, Datadog) to correlate client-visible errors with server logs.

```typescript
// app/dashboard/error.tsx — segment error boundary
'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert">
      <h2>Something went wrong loading the dashboard</h2>
      <p className="text-sm text-gray-500">Error ID: {error.digest}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// app/posts/[slug]/not-found.tsx — segment-specific 404
export default function PostNotFound() {
  return (
    <div>
      <h1>Post not found</h1>
      <p>The post you are looking for does not exist or has been removed.</p>
    </div>
  );
}

// app/posts/[slug]/page.tsx — triggering not-found
import { notFound } from 'next/navigation';

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await fetchPost(params.slug);
  if (!post) notFound(); // triggers not-found.tsx
  return <article>{post.content}</article>;
}
```

## Details

Next.js automatically wraps each route segment in a React error boundary when `error.tsx` exists. The error boundary catches errors thrown during rendering, in event handlers, or in asynchronous data fetching within that segment.

**Error propagation:** Errors bubble up through React's component tree until they reach an error boundary. Without `error.tsx`, unhandled errors propagate to the root and show the default Next.js error page (development) or a blank white screen (production).

**`reset()` function:** Calling `reset()` attempts to re-render the content within the error boundary. If the underlying error was transient (e.g., a network blip), the reset succeeds. If the error persists, the error boundary catches it again. Combine with a retry counter to avoid infinite loops.

**`global-error.tsx` vs `error.tsx`:** `error.tsx` in `app/` catches errors from the root page but not from the root layout. `global-error.tsx` catches errors from the root layout itself (e.g., a broken navigation component). `global-error.tsx` must render `<html>` and `<body>` because it replaces the entire document.

**Server vs client error messages:** In production, error messages thrown on the server are not forwarded to the client to avoid leaking sensitive details. Only the `digest` ID is passed. In development, full error details are shown. This asymmetry is intentional — use the digest to look up errors in server logs.

**not-found.tsx placement:** A `not-found.tsx` in a segment catches `notFound()` calls from that segment only. A `not-found.tsx` in `app/` serves as the global 404 fallback for all routes.

## Source

https://nextjs.org/docs/app/building-your-application/routing/error-handling
