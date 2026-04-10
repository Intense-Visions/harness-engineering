# Bundle Analysis

> Master bundle analysis techniques — visualization tools for chunk composition, size budget enforcement in CI, dependency cost evaluation, source map exploration, and continuous size tracking to prevent bundle bloat.

## When to Use

- Bundle size has grown and you need to identify the largest contributors
- A new dependency was added and you need to assess its impact on bundle size
- CI should fail when bundle size exceeds a defined budget
- You need to compare bundle size between branches or releases
- Lighthouse flags "Reduce unused JavaScript" but you do not know which modules to target
- A production build takes unexpectedly long and you suspect large dependencies
- Tree shaking is configured but you need to verify it is eliminating dead code
- Evaluating whether to add a library or implement the functionality from scratch
- Multiple chunks share duplicated code that should be in a common chunk
- The team needs visibility into bundle size trends over time

## Instructions

1. **Generate a bundle visualization.** Use webpack-bundle-analyzer or vite-bundle-visualizer to see the treemap of every chunk and module:

   ```bash
   # Webpack
   npx webpack-bundle-analyzer dist/stats.json

   # Generate stats.json first if not present:
   npx webpack --profile --json > dist/stats.json

   # Vite
   npx vite-bundle-visualizer

   # Next.js
   ANALYZE=true npx next build
   # Requires: npm install @next/bundle-analyzer
   ```

   ```javascript
   // next.config.js — integrate bundle analyzer
   const withBundleAnalyzer = require('@next/bundle-analyzer')({
     enabled: process.env.ANALYZE === 'true',
   });
   module.exports = withBundleAnalyzer({
     /* next config */
   });
   ```

2. **Explore bundle composition with source map explorer.** Source-map-explorer uses source maps to show exact byte-for-byte attribution:

   ```bash
   npx source-map-explorer dist/main.*.js
   npx source-map-explorer dist/main.*.js --html result.html
   npx source-map-explorer dist/*.js --tsv sizes.tsv  # machine-readable
   ```

3. **Evaluate dependency cost before installing.** Check the size impact of any npm package before adding it:

   ```bash
   # bundlephobia.com — check gzipped and minified size
   # https://bundlephobia.com/package/date-fns@3.0.0

   # package-size CLI — measure actual bundled size
   npx package-size lodash-es/debounce
   npx package-size date-fns/format date-fns/parseISO

   # import-cost VS Code extension — inline size display next to imports
   ```

4. **Configure size budgets with size-limit.** Enforce maximum bundle sizes in CI:

   ```json
   // package.json
   {
     "size-limit": [
       {
         "name": "Entry point",
         "path": "dist/index.js",
         "limit": "50 KB",
         "gzip": true
       },
       {
         "name": "Full bundle",
         "path": "dist/**/*.js",
         "limit": "200 KB",
         "gzip": true
       },
       {
         "name": "CSS",
         "path": "dist/**/*.css",
         "limit": "30 KB",
         "gzip": true
       }
     ],
     "scripts": {
       "size": "size-limit",
       "size:check": "size-limit --why"
     }
   }
   ```

   ```yaml
   # GitHub Actions CI integration
   - name: Check bundle size
     uses: andresz1/size-limit-action@v1
     with:
       github_token: ${{ secrets.GITHUB_TOKEN }}
       skip_step: build
       directory: dist
   ```

5. **Use webpack performance hints for build-time enforcement.**

   ```javascript
   // webpack.config.js
   module.exports = {
     performance: {
       maxEntrypointSize: 250000, // 250KB
       maxAssetSize: 200000, // 200KB per file
       hints: process.env.NODE_ENV === 'production' ? 'error' : 'warning',
       assetFilter: (filename) => {
         return filename.endsWith('.js') || filename.endsWith('.css');
       },
     },
   };
   ```

6. **Identify and eliminate duplicate dependencies.** Check for multiple versions of the same package bundled together:

   ```bash
   # webpack — duplicate package checker
   npx duplicate-package-checker-webpack-plugin

   # npm — list duplicates
   npm ls --all | grep -E "deduped|invalid"

   # pnpm — dedupe
   pnpm dedupe

   # yarn — dedupe
   yarn dedupe
   ```

7. **Track bundle size over time.** Integrate size tracking into the PR workflow so every change shows its size impact:

   ```bash
   # bundlewatch — CI size tracking with GitHub status checks
   npx bundlewatch --config .bundlewatch.config.js
   ```

   ```javascript
   // .bundlewatch.config.js
   module.exports = {
     files: [
       { path: 'dist/main.*.js', maxSize: '150KB' },
       { path: 'dist/vendor.*.js', maxSize: '100KB' },
       { path: 'dist/*.css', maxSize: '30KB' },
     ],
     ci: {
       trackBranches: ['main'],
       repoBranchBase: 'main',
     },
   };
   ```

## Details

### Understanding Treemap Visualizations

Bundle analyzer treemaps show nested rectangles where area is proportional to file size. The outer rectangles represent chunks (main, vendor, route-specific). Inner rectangles represent modules. Colors typically distinguish between application code and node_modules. When analyzing, look for: (1) unexpectedly large modules that suggest missing tree shaking, (2) duplicate modules appearing in multiple chunks, (3) node_modules that dominate the treemap relative to application code.

### Gzipped vs Parsed vs Raw Size

Bundle tools report three size metrics. **Raw size** is the uncompressed file on disk. **Parsed size** is the JavaScript the browser must parse and compile (after decompression, before execution). **Gzipped size** (or Brotli size) is the transfer size over the network. Parsed size most directly correlates with CPU cost (parsing/compilation). Gzipped size correlates with network transfer time. Budget both: a 500KB parsed file might compress to 100KB gzipped (fast download) but still take 200ms to parse on mobile.

### Worked Example: Walmart Bundle Audit

Walmart's web team used webpack-bundle-analyzer to discover that their checkout page bundled the full moment.js library (67KB gzipped) for a single date formatting call. Replacing it with a 2-line Intl.DateTimeFormat call eliminated the dependency entirely. They also found three different versions of lodash in the bundle (lodash, lodash-es, and lodash.merge). Deduplicating to lodash-es with direct function imports reduced the combined lodash footprint from 72KB to 8KB gzipped. Total savings: 129KB gzipped, reducing checkout TTI by 1.1 seconds on 3G.

### Worked Example: Notion Size Budget Enforcement

Notion enforces strict per-route bundle budgets in CI. Every PR shows a size comparison table in the GitHub check. If any route exceeds its budget, the PR is blocked. When a developer adds a new dependency, the CI check surfaces the exact byte increase and which route is affected. This prevents the gradual size creep that makes individual additions seem harmless while the cumulative effect degrades performance. Their main route budget is 180KB gzipped, and they have maintained it within 5% for two years.

### Anti-Patterns

**Analyzing only total bundle size.** A total size that stays constant can mask problems: one chunk grows while another shrinks. Always analyze per-chunk and per-route sizes.

**Ignoring parsed/compile size.** A highly compressible library might be small over the wire but enormous to parse. Source maps and JSON blobs compress well but still impose parse cost. Budget parsed size independently.

**Running analysis only in development mode.** Development builds include hot module replacement, React DevTools integration, and verbose error messages. Always analyze production builds.

**Setting budgets too loose.** A 1MB budget never triggers. Start with the current size plus 10% headroom, then ratchet down. Effective budgets are ones that occasionally fail, prompting investigation.

## Source

- webpack-bundle-analyzer — https://github.com/webpack-contrib/webpack-bundle-analyzer
- source-map-explorer — https://github.com/danvk/source-map-explorer
- size-limit — https://github.com/ai/size-limit
- Bundlephobia — https://bundlephobia.com/
- bundlewatch — https://bundlewatch.io/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Bundle visualization is generated and reviewed for unexpected large modules.
- Size budgets are configured in CI and enforce per-chunk and per-route limits.
- No duplicate dependencies exist in the production bundle.
- New dependency additions include a size impact assessment.
- Bundle size trends are tracked over time with visibility in PRs.
