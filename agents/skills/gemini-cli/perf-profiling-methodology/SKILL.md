# Profiling Methodology

> Apply a systematic, measurement-first profiling workflow — define metric, establish baseline, identify bottleneck, implement fix, verify improvement with statistical significance — to avoid wasted optimization effort and ensure every change demonstrably improves performance.

## When to Use

- Performance is perceived as slow but no one has measured what is actually slow
- You need to establish a baseline before optimizing to prove the optimization worked
- A flame chart or performance trace needs to be read and interpreted
- Performance budgets need to be defined and enforced in CI
- Lab data (Lighthouse) and field data (CrUX/RUM) disagree and you need to understand why
- You are deciding between synthetic monitoring and Real User Monitoring
- A performance regression needs to be detected and attributed to a specific commit
- Single-run measurements are producing inconsistent results and statistical rigor is needed
- Micro-benchmarking in isolation is misleading and end-to-end measurement is needed
- The team is about to "optimize" without a clear bottleneck and you need to redirect effort

## Instructions

1. **Never optimize without a baseline.** Before changing any code, measure the current state with the exact metric you want to improve. Record at least 5 measurements to establish a stable baseline (performance varies 10-30% between runs):

   ```bash
   # Example: run Lighthouse 5 times and compute median
   for i in {1..5}; do
     npx lighthouse https://example.com --output=json --output-path=./run-$i.json --quiet
   done
   # Extract LCP from each run and compute median
   ```

2. **Follow the profiling workflow:**
   1. **Define the metric** — what exactly are you measuring? (LCP, INP, bundle size, API p95 latency)
   2. **Establish baseline** — measure 5+ runs, compute median and p95, record the values
   3. **Identify bottleneck** — use DevTools Performance panel, flame chart, or profiler to find the slowest part
   4. **Hypothesize cause** — formulate a specific theory ("style recalculation during scroll takes 40ms because of descendant selectors on body")
   5. **Implement fix** — make exactly one change
   6. **Measure again** — same conditions, 5+ runs
   7. **Validate significance** — is the improvement larger than the natural variance? Use a statistical test if the effect is small

3. **Read flame charts effectively.** In Chrome DevTools Performance panel:
   - **Width** = time duration (wider = longer)
   - **Depth** = call stack depth (deeper = more nested function calls)
   - **Self time** = time spent in the function itself (not in its callees)
   - **Total time** = self time + all callee time

   The optimization target is the function with the largest **self time** that is on the critical path. Deep call stacks with small self times are not the bottleneck — the leaf functions are.

4. **Use CPU throttling in DevTools.** Developer hardware is 5-10x faster than the median user device. Always profile with:
   - CPU throttling: 4x slowdown (simulates mid-tier mobile)
   - Network throttling: "Fast 3G" or "Slow 4G"
   - This reveals bottlenecks that are invisible on high-end hardware

5. **Set performance budgets and enforce in CI:**

   ```javascript
   // lighthouserc.js — Lighthouse CI configuration
   module.exports = {
     ci: {
       assert: {
         assertions: {
           'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
           interactive: ['error', { maxNumericValue: 3500 }],
           'total-byte-weight': ['error', { maxNumericValue: 200000 }],
           'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
         },
       },
     },
   };
   ```

6. **Understand lab vs field data:**

   | Aspect     | Lab (Lighthouse, WebPageTest)        | Field (CrUX, RUM)                   |
   | ---------- | ------------------------------------ | ----------------------------------- |
   | Conditions | Controlled, reproducible             | Real user devices and networks      |
   | Device     | Specified throttling                 | Actual user hardware                |
   | Coverage   | Single page, one scenario            | All pages, all users                |
   | Use for    | Debugging, regression detection      | Understanding real user experience  |
   | Limitation | Does not reflect real-world variance | Cannot reproduce specific scenarios |

   Lab and field data should agree directionally. If Lighthouse shows LCP of 1.5s but CrUX shows 4.0s, the lab test is not representative of real user conditions (likely missing slow devices or slow networks).

7. **Measure with statistical significance:**

   ```javascript
   // Simple statistical validation for A/B performance tests
   function isSignificant(controlSamples, treatmentSamples, confidenceLevel = 0.95) {
     const controlMean = mean(controlSamples);
     const treatmentMean = mean(treatmentSamples);
     const controlStdDev = stddev(controlSamples);
     const treatmentStdDev = stddev(treatmentSamples);
     const n = controlSamples.length;

     const pooledStdErr = Math.sqrt((controlStdDev ** 2 + treatmentStdDev ** 2) / n);
     const tStat = (controlMean - treatmentMean) / pooledStdErr;
     const criticalValue = 1.96; // for 95% confidence
     return Math.abs(tStat) > criticalValue;
   }
   ```

## Details

### The Profiling Pyramid

Optimize in this order (each level has 10x the impact of the one below):

1. **Architecture** — SSR vs CSR, code splitting, caching strategy (impact: seconds)
2. **Network** — CDN, compression, HTTP/2, image optimization (impact: hundreds of ms)
3. **Rendering** — critical CSS, defer/async, layout containment (impact: tens of ms)
4. **Code** — algorithm optimization, micro-optimization (impact: single ms)

Most wasted optimization effort happens when teams optimize at level 4 (micro-optimizing a function from 2ms to 1ms) while the architecture at level 1 adds 3 seconds of unnecessary latency.

### Worked Example: Pinterest A/B Testing Protocol

Pinterest's performance team validates every optimization with an A/B test:

1. The optimization is deployed to 1% of traffic
2. Both control (original) and treatment (optimized) groups are monitored for 7 days
3. Key metrics: LCP p50/p75/p95, INP p50/p75/p95, engagement rate, bounce rate
4. Statistical significance test at p<0.05 is required before promotion
5. Results are reviewed for selection bias (are the 1% representative?)

This protocol caught a "30% LCP improvement" that was actually a 2% improvement. The initial benchmark ran on a fast internal network; the A/B test revealed the improvement was much smaller for real users on cellular networks. The fix was still shipped because 2% improvement for all users was valuable, but expectations were correctly calibrated.

### Worked Example: Shopify Lighthouse CI

Shopify runs Lighthouse CI on every PR for every storefront route. Each route has a performance budget:

- Homepage: LCP < 2.0s, bundle < 150KB
- Product page: LCP < 2.5s, bundle < 200KB
- Cart page: INP < 150ms, CLS < 0.05

Any PR that regresses a metric beyond its budget fails the build. The PR author receives a comparison report showing exactly which metric regressed, by how much, and which files contributed to the regression (via source map analysis).

### Regression Detection Strategy

Use a three-tier approach:

1. **CI gate (per-PR)** — Lighthouse CI with per-route budgets. Catches large regressions before merge.
2. **Synthetic monitoring (continuous)** — Run Lighthouse or WebPageTest hourly on production. Alerts when metrics deviate >10% from 7-day rolling average.
3. **RUM alerting (field)** — Monitor CrUX or custom RUM data. Alert when p75 metrics cross thresholds (LCP > 2.5s, INP > 200ms, CLS > 0.1).

### Anti-Patterns

**Optimizing without measuring first.** "I bet the problem is the database" leads to weeks of database optimization when the real bottleneck is a 3MB uncompressed hero image. Always profile first, then optimize the actual bottleneck.

**Testing on developer hardware without throttling.** A MacBook Pro on gigabit fiber does not represent the median user on a mid-tier Android phone on 4G. Always enable CPU throttling (4x) and network throttling (Fast 3G) in DevTools, or use WebPageTest with a real Moto G4 device.

**Single-run measurements.** Performance varies 10-30% between runs due to background processes, network conditions, and GC timing. A single run showing 2.1s LCP could be 2.7s on the next run. Always take the median of 5+ runs.

**Optimizing p50 when p95 is the real problem.** Median latency looks great at 500ms, but p95 is 8 seconds. Tail latencies affect 5% of users on every page load. Focus on percentile metrics, not averages.

**Micro-benchmarking in isolation.** Optimizing a function from 1ms to 0.1ms is a 10x improvement that is completely irrelevant if the function is called once during a 3-second page load. Always measure the impact on the end-to-end metric, not the isolated function.

**Premature optimization without profiling.** Adding `useMemo` to every React component, `will-change` to every element, or code-splitting every route "just in case" adds complexity without measured benefit. Profile first, optimize only the measured bottleneck.

## Source

- Google Lighthouse documentation — https://developer.chrome.com/docs/lighthouse
- WebPageTest documentation — https://docs.webpagetest.org/
- Chrome DevTools Performance panel guide — https://developer.chrome.com/docs/devtools/performance
- Brendan Gregg, "Systems Performance" methodology — https://www.brendangregg.com/methodology.html
- "How We Made the Web Faster" (Google)

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
- Every optimization has a measured baseline, a measured result, and statistical validation.
- Performance budgets are defined and enforced in CI.
