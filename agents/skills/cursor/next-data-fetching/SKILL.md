# Next.js Data Fetching Patterns

> Fetch server-side data efficiently without waterfalls using async Server Components

## When to Use

- Fetching data required to render a page in a Server Component
- Optimizing multiple data dependencies to run in parallel instead of sequentially
- Deciding whether to fetch at the layout, page, or component level
- Passing fetched data to Client Components as props
- Replacing `getServerSideProps` and `getStaticProps` from the Pages Router

## Instructions

1. Fetch data directly in Server Components using `async/await` — no `useEffect` or API abstraction layer needed.
2. Initiate all independent data fetches before any `await` to enable parallel execution.
3. Use `Promise.all()` when all fetches must resolve before rendering — one failure rejects all.
4. Use individual `await`s with Suspense boundaries to stream each fetch result independently as it resolves.
5. Fetch at the lowest component level that needs the data — avoid prop-drilling fetched data through multiple layers.
6. Use `React.cache()` to memoize a fetch function — safe to call in multiple components that need the same data within a request.
7. Avoid fetching in layouts when the data is only needed by a specific page — layouts block the segment render until resolved.
8. Use `server-only` import to mark data access functions and prevent accidental client bundle inclusion.

```typescript
// lib/data.ts — cached data access functions
import { cache } from 'react';
import 'server-only';

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});

export const getPosts = cache(async (userId: string) => {
  return db.post.findMany({ where: { authorId: userId } });
});

// app/users/[id]/page.tsx — parallel fetching
export default async function UserPage({ params }: { params: { id: string } }) {
  // Initiate in parallel — do NOT await immediately
  const userPromise = getUser(params.id);
  const postsPromise = getPosts(params.id);

  // Await both — total time = max(userTime, postsTime), not sum
  const [user, posts] = await Promise.all([userPromise, postsPromise]);

  if (!user) notFound();
  return <UserProfile user={user} posts={posts} />;
}

// app/users/[id]/page.tsx — streaming with Suspense (alternative)
export default function UserPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserContent userId={params.id} />
    </Suspense>
  );
}

async function UserContent({ userId }: { userId: string }) {
  const user = await getUser(userId); // suspends this boundary only
  return <UserProfile user={user} />;
}
```

## Details

In the App Router, data fetching is co-located with the components that need it — no centralized data loading layer required. Server Components can `await` database queries, fetch calls, and SDK methods directly in the component body.

**Sequential vs parallel:** Two `await` statements in sequence create a waterfall — each waits for the previous. Initiating both promises before awaiting either enables parallelism. With `Promise.all`, both start simultaneously and the total time equals the slowest, not the sum.

**`React.cache()` for deduplication:** Multiple Server Components requesting the same data within one render pass will each trigger a separate fetch unless the fetch function is wrapped with `React.cache()`. This is different from the Next.js Data Cache — `React.cache()` deduplicates within a single request only.

**Fetch vs ORM:** `fetch()` in Server Components integrates with the Next.js Data Cache (caching, revalidation, tags). ORM calls (Prisma, Drizzle) do not — use `unstable_cache` from `next/cache` to cache them.

**Layout vs page fetching:** Fetching in `layout.tsx` blocks the layout render, which blocks all child pages. Only fetch in layouts what every child route genuinely needs (e.g., current user session). Fetch page-specific data in `page.tsx` or in dedicated async components.

**Request deduplication:** Next.js automatically deduplicates identical `fetch()` calls (same URL, same options) within a request lifecycle using Request Memoization. Multiple components fetching the same URL only trigger one network request.

## Source

https://nextjs.org/docs/app/building-your-application/data-fetching/fetching
