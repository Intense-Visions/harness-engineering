# React Dynamic Import

> Load modules on demand to reduce initial bundle size and improve startup performance

## When to Use

- A component is only needed after user interaction (modal, drawer, tab panel)
- A route's components should not be in the initial bundle (route-based splitting)
- A large library is only used in a specific feature
- Below-fold content that users may never scroll to

## Instructions

1. Use `React.lazy` with a dynamic `import()` for component splitting:
   ```typescript
   const Modal = React.lazy(() => import('./Modal'));
   ```
2. Always wrap lazy components in `<Suspense>` with a fallback.
3. For non-component modules, use `import()` directly:
   ```typescript
   const { heavyComputation } = await import('./heavy-utils');
   ```
4. Add webpack/vite magic comments for named chunks:
   ```typescript
   const Chart = React.lazy(() => import(/* webpackChunkName: "chart" */ './Chart'));
   ```
5. Preload on hover for likely interactions:
   ```typescript
   const preload = () => import('./Modal');
   <button onMouseEnter={preload} onClick={openModal}>Open</button>
   ```

## Details

Dynamic import is a JavaScript language feature (Stage 4). Bundlers create separate "chunks" for dynamically imported modules, loaded via `<script>` tags at runtime.

**Chunk naming strategy:**

- Route-based: one chunk per top-level route
- Feature-based: one chunk per large feature (chart library, editor, admin panel)
- Vendor splitting: separate chunks for node_modules (better long-term caching)

**Preloading:** `<link rel="preload">` or `import()` on hover/route-change triggers network fetch before the user needs it, hiding latency. Framework routers (Next.js, React Router) do this automatically for adjacent routes.

**Measurement:** Analyze bundle with `vite build --report` or `webpack-bundle-analyzer` before and after splitting.

## Source

https://patterns.dev/react/dynamic-import

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
