# Code Splitting

> Master code splitting strategies — route-based splitting, component-based splitting, vendor chunk optimization, and dynamic imports to reduce initial bundle size and improve Time to Interactive across single-page applications and server-rendered frameworks.

## When to Use

- Initial JavaScript bundle exceeds 200KB gzipped and blocks first render
- Lighthouse flags "Reduce unused JavaScript" with significant savings potential
- Users on mobile or slow networks experience long Time to Interactive
- Routes load large libraries (charting, editors, maps) that most users never visit
- Webpack Bundle Analyzer shows a single monolithic chunk with all application code
- Build times are increasing because every change rebuilds the entire application
- Third-party vendor libraries are bundled with application code and invalidate on every deploy
- A dashboard application loads admin-only components for all users
- You need to implement progressive loading for a feature-rich SPA
- Coverage tab in DevTools shows >50% unused JavaScript on initial page load

## Instructions

1. **Measure the current bundle.** Before splitting, establish a baseline. Use the Coverage tab in Chrome DevTools (Ctrl+Shift+P, "Coverage") to identify unused bytes on page load. Run `npx webpack-bundle-analyzer` or `npx vite-bundle-visualizer` to see the composition of each chunk.

2. **Implement route-based splitting.** This is the highest-impact, lowest-risk form of code splitting. Each route becomes its own chunk, loaded only when the user navigates there:

   ```javascript
   // React with React.lazy
   import { lazy, Suspense } from 'react';

   const Dashboard = lazy(() => import('./pages/Dashboard'));
   const Settings = lazy(() => import('./pages/Settings'));
   const Analytics = lazy(() => import('./pages/Analytics'));

   function App() {
     return (
       <Suspense fallback={<PageSkeleton />}>
         <Routes>
           <Route path="/" element={<Dashboard />} />
           <Route path="/settings" element={<Settings />} />
           <Route path="/analytics" element={<Analytics />} />
         </Routes>
       </Suspense>
     );
   }
   ```

   ```javascript
   // Next.js — automatic route-based splitting via file-system routing
   // pages/dashboard.tsx → separate chunk automatically
   // pages/settings.tsx → separate chunk automatically

   // For dynamic routes with heavy components:
   import dynamic from 'next/dynamic';
   const HeavyChart = dynamic(() => import('../components/HeavyChart'), {
     loading: () => <ChartSkeleton />,
     ssr: false, // skip server rendering for client-only components
   });
   ```

3. **Split component-level heavy dependencies.** When a component imports a large library, split it at the component boundary:

   ```javascript
   // Before: monaco-editor (5MB) loaded on every page
   import MonacoEditor from '@monaco-editor/react';

   // After: loaded only when CodeEditor mounts
   const CodeEditor = lazy(() => import('./CodeEditor'));
   // CodeEditor.tsx imports monaco-editor internally
   ```

4. **Configure vendor chunk splitting.** Separate rarely-changing vendor code from frequently-changing application code so deploys only invalidate app chunks:

   ```javascript
   // webpack.config.js
   optimization: {
     splitChunks: {
       chunks: 'all',
       cacheGroups: {
         framework: {
           test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
           name: 'framework',
           priority: 40,
           enforce: true,
         },
         vendor: {
           test: /[\\/]node_modules[\\/]/,
           name: 'vendor',
           priority: 20,
           minSize: 20000,
         },
         common: {
           minChunks: 2,
           priority: 10,
           reuseExistingChunk: true,
         },
       },
     },
   }
   ```

5. **Use named chunk comments for debugging.** Webpack magic comments give chunks readable names in the Network panel:

   ```javascript
   const AdminPanel = lazy(() => import(/* webpackChunkName: "admin" */ './pages/AdminPanel'));
   const PDFViewer = lazy(
     () => import(/* webpackChunkName: "pdf-viewer" */ './components/PDFViewer')
   );
   ```

6. **Prefetch predictable navigation targets.** After initial load completes, prefetch chunks the user is likely to visit next:

   ```javascript
   // Webpack magic comment for prefetch
   const Settings = lazy(() => import(/* webpackPrefetch: true */ './pages/Settings'));
   // Emits <link rel="prefetch" href="settings.chunk.js"> in <head>

   // Manual prefetch on hover/focus for fine control
   function NavLink({ to, component, children }) {
     const prefetch = () => component.preload?.();
     return (
       <Link to={to} onMouseEnter={prefetch} onFocus={prefetch}>
         {children}
       </Link>
     );
   }
   ```

7. **Set chunk size budgets.** Configure warnings and errors when chunks exceed size limits:

   ```javascript
   // webpack.config.js
   performance: {
     maxEntrypointSize: 250000,  // 250KB
     maxAssetSize: 200000,       // 200KB
     hints: 'error',             // fail the build if exceeded
   }
   ```

## Details

### How Bundlers Implement Code Splitting

Webpack, Rollup, and esbuild all recognize dynamic `import()` expressions as split points. When the bundler encounters `import('./Module')`, it creates a separate chunk containing that module and its unique dependencies. Shared dependencies are either duplicated or extracted into a common chunk depending on configuration. At runtime, the framework's chunk loading mechanism (webpack's `__webpack_require__.e`, Vite's native ESM imports) fetches the chunk via a network request and resolves the promise.

### Granularity Trade-offs

Splitting too aggressively creates many small chunks, increasing HTTP request overhead (especially on HTTP/1.1) and reducing compression efficiency. Splitting too conservatively leaves large monolithic bundles. The optimal strategy depends on the application: content sites benefit from aggressive route splitting (users visit 1-2 pages), while dashboards with frequent navigation benefit from larger shared chunks that amortize loading across views.

### Worked Example: Shopify Checkout

Shopify's checkout splits into three tiers: a critical shell chunk (React + routing, ~40KB gzipped) that loads instantly, route chunks for each checkout step (shipping, payment, confirmation at ~15-25KB each), and deferred chunks for optional features (address autocomplete, payment method animations). This achieves a 1.2s TTI on 3G for the first step, with subsequent steps loading in <200ms from prefetched chunks. The vendor chunk (React, Polaris) changes only on framework upgrades, maintaining >95% cache hit rate across deploys.

### Anti-Patterns

**Splitting every component individually.** Wrapping every component in `lazy()` creates dozens of tiny chunks that generate waterfall requests. Split at meaningful boundaries — routes, heavy feature modules, conditional features — not individual UI components.

**Dynamic imports inside hot loops or render functions.** Calling `import()` inside a component body without memoization triggers a new chunk load on every render. Always hoist lazy components to module scope or memoize them.

**Ignoring the loading state.** A `Suspense` fallback of `null` or a tiny spinner causes layout shift when the chunk loads. Use skeleton screens that match the loaded component's dimensions.

**Not accounting for chunk load failures.** Network failures during chunk loading crash the application. Wrap lazy components in an Error Boundary that offers a retry mechanism.

## Source

- webpack: Code Splitting — https://webpack.js.org/guides/code-splitting/
- React: React.lazy — https://react.dev/reference/react/lazy
- web.dev: Reduce JavaScript payloads with code splitting — https://web.dev/articles/reduce-javascript-payloads-with-code-splitting
- Vite: Code Splitting — https://vitejs.dev/guide/features.html#async-chunk-loading-optimization

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Route-based splitting is implemented with each route in its own chunk.
- Initial bundle size is under 200KB gzipped for the entry point.
- Vendor libraries are in separate chunks that persist across application deploys.
- Coverage tab shows <30% unused JavaScript on initial page load.
- Suspense fallbacks provide meaningful loading states (skeleton screens, not spinners).
