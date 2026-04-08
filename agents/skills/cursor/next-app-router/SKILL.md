# Next.js App Router

> Structure Next.js 13+ applications using the App Router's file-system conventions for layouts, nested routes, and route segments

## When to Use

- Starting a new Next.js project with version 13 or later
- Migrating from the Pages Router to the App Router
- Adding nested layouts, route groups, or parallel routes
- Designing URL structures that share UI across multiple routes
- Working with `app/` directory conventions (`layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`)

## Instructions

1. Place all routes under `app/`. Each folder becomes a route segment; `page.tsx` makes it publicly accessible.
2. Use `layout.tsx` to wrap route segments in shared UI — layouts persist across navigations and do not re-render.
3. Create route groups with `(groupName)/` to organize routes without affecting the URL path.
4. Use `[slug]` for dynamic segments and `[...catchAll]` for catch-all segments. Access params via the `params` prop in `page.tsx` and `layout.tsx`.
5. Co-locate `loading.tsx` alongside `page.tsx` to stream a Suspense fallback during data fetching.
6. Co-locate `error.tsx` as a Client Component to catch runtime errors within the segment.
7. Use `not-found.tsx` to render 404 UI and call `notFound()` from `next/navigation` to trigger it.
8. Use `template.tsx` instead of `layout.tsx` when you need fresh state on every navigation (e.g., page-transition animations).
9. Prefer route groups to share layouts across unrelated URL paths without creating a shared parent segment.
10. Keep `layout.tsx` Server Components by default; only add `'use client'` if the layout needs interactivity.

```typescript
// app/dashboard/layout.tsx — shared layout for all /dashboard/* routes
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <DashboardNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}

// app/dashboard/[teamId]/page.tsx — dynamic route segment
export default function TeamPage({ params }: { params: { teamId: string } }) {
  return <h1>Team {params.teamId}</h1>;
}
```

## Details

The App Router replaces the Pages Router's `getServerSideProps` / `getStaticProps` model with React Server Components and async components. Every file in `app/` is a Server Component by default.

**File conventions:** `page.tsx` (route UI), `layout.tsx` (shared wrapper), `loading.tsx` (Suspense fallback), `error.tsx` (error boundary), `not-found.tsx` (404), `route.ts` (API endpoint), `template.tsx` (per-navigation layout), `default.tsx` (parallel route fallback).

**Route groups** `(groupName)/` exist only in the filesystem — they do not appear in the URL. Use them to co-locate files without coupling the URL structure.

**Trade-offs:**

- Layouts cannot read search params — use `searchParams` prop in `page.tsx` instead
- `layout.tsx` is not re-mounted on navigation within its segment, so component state persists; use `template.tsx` if fresh state is needed
- Deeply nested layouts increase the React component tree depth — profile rendering if performance degrades

**Migration from Pages Router:** Pages under `pages/` continue to work alongside `app/` — the two routers coexist during migration. Remove a page from `pages/` only after its `app/` equivalent is tested.

## Source

https://nextjs.org/docs/app/building-your-application/routing
