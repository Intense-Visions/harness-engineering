# React Server Components

> Run components on the server to eliminate client JavaScript and enable direct data access

## When to Use

- Components that fetch data and render it without client-side interactivity
- Components that import large libraries (markdown parsers, date formatters) only needed for rendering
- You need direct database or filesystem access without an API layer
- Using Next.js App Router (RSC is the default) or another RSC-compatible framework

## Instructions

1. **Server Components are the default** in Next.js App Router. Do not add `'use client'` unless needed.
2. Server Components can:
   - `async/await` directly: `const data = await db.query(...)`
   - Import server-only libraries without impacting bundle size
   - Read environment variables and secrets directly
3. Add `'use client'` directive at the top of a file when the component needs:
   - `useState`, `useEffect`, or any hooks
   - Browser APIs (`window`, `document`)
   - Event handlers (`onClick`, `onChange`)
4. **Composition rule:** Server Components can render Client Components, but Client Components cannot render Server Components (only pass them as `children` props).
5. Pass data from Server to Client Components as serializable props (no functions, classes, or non-serializable objects).

```typescript
// Server Component (no 'use client')
async function ProductPage({ id }: { id: string }) {
  const product = await db.products.findById(id); // direct DB access
  return (
    <div>
      <h1>{product.name}</h1>
      <AddToCartButton productId={id} /> {/* Client Component */}
    </div>
  );
}

// Client Component
'use client';
function AddToCartButton({ productId }: { productId: string }) {
  return <button onClick={() => addToCart(productId)}>Add to Cart</button>;
}
```

## Details

RSC introduces a server/client component split at the file level. The framework serializes server-rendered output as a JSON-like payload (RSC payload) and sends it to the client for React to reconcile.

**What RSC eliminates:**

- API routes for data fetching in many cases (direct DB access in server components)
- Client-side waterfall requests (async server components fetch in parallel)
- Bundle cost for render-only dependencies (they never reach the browser)

**Common mistakes:**

- Adding `'use client'` to every file "to be safe" — this negates RSC benefits
- Trying to pass functions as props from server to client components — functions are not serializable
- Using `useEffect` for data fetching in client components when a server component would work

**Framework support (2024):** Next.js App Router is the primary production implementation. Remix, Waku, and other frameworks have RSC support in various stages.

## Source

https://patterns.dev/react/react-server-components
