# JS Dynamic Import

> Load ES modules on demand with import() to reduce initial bundle size and enable code splitting

## When to Use

- You want to load code only when it is needed (route-based splitting, feature flags, heavy libraries)
- Reducing the initial JavaScript bundle size for faster page loads
- Loading polyfills or locale data conditionally based on the runtime environment

## Instructions

1. Use `import('./module.js')` to load a module at runtime — it returns a Promise.
2. Use dynamic import for routes, heavy libraries, or features behind flags.
3. Combine with `await` in async functions or `.then()` for cleaner syntax.
4. Bundlers (webpack, Vite, Rollup) automatically split dynamic imports into separate chunks.

```javascript
// Route-based code splitting
async function loadPage(route) {
  const module = await import(`./pages/${route}.js`);
  module.render();
}

// Feature-flag gating
if (user.hasFeature('charts')) {
  const { renderChart } = await import('./charts.js');
  renderChart(data);
}
```

5. Add error handling — `import()` can fail (network error, missing module).
6. Use `/* webpackChunkName: "name" */` comments for readable chunk names in webpack.

## Details

Dynamic `import()` is a function-like syntax (not a function — it is a language feature) that returns a Promise resolving to the module's namespace object. Unlike static `import`, it can be used anywhere: inside functions, conditionals, loops, and event handlers.

**Trade-offs:**

- Asynchronous — you must handle the loading state (spinner, skeleton, Suspense)
- Each dynamic import creates a separate network request (chunk) — too many small chunks can hurt performance
- Harder to analyze statically — bundlers may not tree-shake dynamically imported modules as effectively
- Module is not available synchronously — cannot be used where a synchronous value is required

**When NOT to use:**

- For modules used on every page load — static import is simpler and avoids the loading delay
- When the module is small — the overhead of a separate chunk outweighs the savings
- In performance-critical synchronous paths — the async nature adds latency

## Source

https://patterns.dev/javascript/dynamic-import

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
