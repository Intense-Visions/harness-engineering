# Test Performance Testing

> Measure and assert on code performance using vitest bench and timing budgets

## When to Use

- Benchmarking function performance to establish baselines
- Preventing performance regressions in hot-path code
- Comparing algorithm implementations for speed
- Setting timing budgets for critical operations

## Instructions

1. **Vitest bench** for micro-benchmarks:

```typescript
// sort.bench.ts
import { bench, describe } from 'vitest';

describe('sorting algorithms', () => {
  const data = Array.from({ length: 10_000 }, () => Math.random());

  bench('Array.sort', () => {
    [...data].sort((a, b) => a - b);
  });

  bench('custom quicksort', () => {
    quicksort([...data]);
  });
});
```

Run with: `vitest bench`

2. **Assert on timing** in regular tests:

```typescript
it('processes 1000 items in under 100ms', async () => {
  const items = createItems(1000);
  const start = performance.now();

  await processItems(items);

  const duration = performance.now() - start;
  expect(duration).toBeLessThan(100);
});
```

3. **Benchmark with warmup:**

```typescript
bench(
  'JSON parse',
  () => {
    JSON.parse(largeJson);
  },
  {
    warmupIterations: 100,
    iterations: 1000,
    time: 5000, // Run for at least 5 seconds
  }
);
```

4. **Compare implementations:**

```typescript
describe('string concatenation', () => {
  const parts = Array.from({ length: 1000 }, (_, i) => `part${i}`);

  bench('Array.join', () => {
    parts.join('');
  });

  bench('String +=', () => {
    let result = '';
    for (const part of parts) result += part;
  });

  bench('template literal', () => {
    parts.reduce((acc, part) => `${acc}${part}`, '');
  });
});
```

5. **Memory profiling:**

```typescript
it('does not leak memory over 1000 iterations', () => {
  const before = process.memoryUsage().heapUsed;

  for (let i = 0; i < 1000; i++) {
    const result = processData(testData);
    // result should be garbage collected
  }

  global.gc?.(); // Run with --expose-gc
  const after = process.memoryUsage().heapUsed;
  const growth = after - before;

  expect(growth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth
});
```

6. **HTTP endpoint performance:**

```typescript
it('responds to /api/users in under 200ms (p95)', async () => {
  const times: number[] = [];

  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await request(app).get('/api/users').expect(200);
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  expect(p95).toBeLessThan(200);
});
```

7. **Regression detection** with saved baselines:

```typescript
// Save benchmark results to a file and compare in CI
// vitest bench --reporter=json --outputFile=bench-results.json
```

8. **Performance budgets in CI:**

```typescript
// vitest.config.ts
test: {
  benchmark: {
    include: ['**/*.bench.ts'],
    reporters: ['default', 'json'],
    outputFile: 'bench-results.json',
  },
},
```

## Details

Performance testing ensures that code meets speed and resource requirements. It ranges from micro-benchmarks (single function timing) to load testing (system under concurrent traffic).

**Vitest bench vs dedicated tools:**

- **Vitest bench** — micro-benchmarks integrated into your test suite. Good for function-level performance
- **k6, artillery** — load testing tools for HTTP endpoints under concurrent traffic
- **Clinic.js** — Node.js profiling for identifying bottlenecks in production-like scenarios

**Benchmark reliability:**

- Run benchmarks on a dedicated machine or CI runner with consistent resources
- Warm up the JIT compiler before measuring (warmup iterations)
- Run enough iterations for statistical significance
- Compare relative performance, not absolute numbers (hardware varies)

**Statistical measures:**

- **ops/sec** — operations per second. Higher is better
- **p50/p95/p99** — percentile latencies. p95 = 95% of requests complete within this time
- **Standard deviation** — lower means more consistent performance

**Common performance traps in JavaScript:**

- String concatenation in loops (use `Array.join`)
- Creating objects in hot loops (reuse or use object pools)
- Unnecessary spread operators (`{...obj}` allocates a new object)
- Sync I/O blocking the event loop
- Unbounded array growth without pagination

**Trade-offs:**

- Micro-benchmarks isolate function performance — but do not reflect real-world load
- Timing assertions catch regressions — but are sensitive to CI runner variability
- Memory profiling catches leaks — but requires `--expose-gc` and is not deterministic
- Performance budgets enforce standards — but can cause false failures on slow CI runners

## Source

https://vitest.dev/guide/features.html#benchmarking
