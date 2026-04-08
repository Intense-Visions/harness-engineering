# Next.js Server Components

> Keep data fetching and heavy logic on the server; push interactivity to the client only where needed

## When to Use

- Fetching data that does not require browser APIs or user interaction
- Accessing backend resources (databases, file system, internal APIs) directly in components
- Reducing client-side JavaScript bundle size
- Passing sensitive credentials (API keys, tokens) through server-only code paths
- Deciding where to draw the `'use client'` boundary in a component tree

## Instructions

1. Every component in `app/` is a Server Component by default — no directive needed. Add `'use client'` only when the component uses hooks, browser APIs, or event handlers.
2. Server Components can be `async` — `await` data directly inside the component body instead of using `useEffect`.
3. Never import server-only modules (database clients, `fs`, secret env vars) into Client Components. Use the `server-only` package to enforce this at build time.
4. Pass server-fetched data to Client Components as props — do not share state across the boundary directly.
5. Place `'use client'` as close to the leaf as possible — this minimizes the client bundle.
6. Client Components can import and render Server Components as children via the `children` prop (composition), but cannot import a Server Component module directly.
7. Use `React.cache()` to deduplicate fetch calls across a request when multiple Server Components fetch the same data.
8. Mark utility modules with `import 'server-only'` to prevent accidental client-side imports.

```typescript
// app/dashboard/page.tsx — Server Component (async, no directive)
import { db } from '@/lib/db'; // server-only module — safe here
import { MetricCard } from './metric-card'; // Client Component receives data as props

export default async function DashboardPage() {
  const metrics = await db.query.metrics.findMany();
  return (
    <div>
      {metrics.map(m => <MetricCard key={m.id} metric={m} />)}
    </div>
  );
}

// app/dashboard/metric-card.tsx — Client Component
'use client';
import { useState } from 'react';

export function MetricCard({ metric }: { metric: Metric }) {
  const [expanded, setExpanded] = useState(false);
  return <div onClick={() => setExpanded(e => !e)}>{metric.label}</div>;
}
```

## Details

React Server Components (RSC) render on the server and send HTML + a serialized component tree to the client. They never ship their module code to the browser, so they can safely import server-only dependencies.

**The boundary model:** `'use client'` marks a module as the root of a client subtree. All modules imported by that module are also bundled for the client — the directive propagates downward through the import graph. This is why pushing the boundary toward leaves reduces bundle size.

**Serialization constraints:** Props crossing the server→client boundary must be serializable (strings, numbers, plain objects, arrays). Functions, class instances, and Promises cannot be passed directly as props to Client Components (Promises can be passed to Suspense-aware Client Components via `use()`).

**Common mistakes:**

- Adding `'use client'` to a file that imports a database client — the database client ends up in the bundle
- Fetching data in a Client Component with `useEffect` when a Server Component parent could fetch it directly
- Importing a Client Component into a Server Component and then re-exporting it — this works fine; the Client Component is still bundled only once

**Performance note:** Server Components reduce Time to First Byte (TTFB) for data-heavy pages because HTML arrives pre-rendered. Interactivity is hydrated progressively.

## Source

https://nextjs.org/docs/app/building-your-application/rendering/server-components
