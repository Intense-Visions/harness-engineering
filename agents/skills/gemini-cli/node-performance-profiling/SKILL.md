# Node.js Performance Profiling

> Profile Node.js applications using --prof, clinic.js, memory snapshots, and event loop lag

## When to Use

- Diagnosing slow API endpoints or high CPU usage
- Finding memory leaks in long-running Node.js processes
- Identifying event loop blocking and lag
- Optimizing startup time and request throughput

## Instructions

1. **Built-in CPU profiling** with `--prof`:

```bash
node --prof app.js
# Generate human-readable output
node --prof-process isolate-*.log > profile.txt
```

2. **Chrome DevTools profiling:**

```bash
node --inspect app.js
# Open chrome://inspect in Chrome
# Click "inspect" on the Node.js target
# Use the Performance and Memory tabs
```

3. **Measure event loop lag:**

```typescript
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setInterval(() => {
  console.log({
    min: histogram.min / 1e6, // ms
    max: histogram.max / 1e6,
    mean: histogram.mean / 1e6,
    p99: histogram.percentile(99) / 1e6,
  });
  histogram.reset();
}, 5000);
```

4. **Performance timing API:**

```typescript
import { performance, PerformanceObserver } from 'node:perf_hooks';

performance.mark('start');
await processData();
performance.mark('end');

performance.measure('processData', 'start', 'end');

const entries = performance.getEntriesByName('processData');
console.log(`Duration: ${entries[0].duration}ms`);
```

5. **Memory usage monitoring:**

```typescript
function logMemory() {
  const { heapUsed, heapTotal, external, rss } = process.memoryUsage();
  console.log({
    heapUsed: `${(heapUsed / 1024 / 1024).toFixed(1)} MB`,
    heapTotal: `${(heapTotal / 1024 / 1024).toFixed(1)} MB`,
    rss: `${(rss / 1024 / 1024).toFixed(1)} MB`,
  });
}

setInterval(logMemory, 10_000);
```

6. **Heap snapshots** for memory leak detection:

```typescript
import v8 from 'node:v8';
import { writeFileSync } from 'node:fs';

function takeHeapSnapshot() {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  const snapshotStream = v8.writeHeapSnapshot(filename);
  console.log(`Heap snapshot written to ${snapshotStream}`);
}

// Take snapshots at intervals to compare in Chrome DevTools
```

7. **Clinic.js** for automated profiling:

```bash
npx clinic doctor -- node app.js
# Generates a flamechart visualization
npx clinic flame -- node app.js
# Generates a flamegraph for CPU profiling
npx clinic bubbleprof -- node app.js
# Visualizes async operations
```

8. **Common performance patterns:**

```typescript
// Cache expensive computations
const cache = new Map<string, Result>();

async function getCachedResult(key: string): Promise<Result> {
  if (cache.has(key)) return cache.get(key)!;
  const result = await expensiveComputation(key);
  cache.set(key, result);
  return result;
}

// Use setImmediate to yield the event loop during CPU work
async function processLargeArray(items: Item[]) {
  for (let i = 0; i < items.length; i++) {
    processItem(items[i]);
    if (i % 1000 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}
```

## Details

Node.js performance profiling identifies CPU bottlenecks, memory leaks, and event loop blocking that cause high latency or resource exhaustion.

**Key metrics:**

- **Event loop lag** — time the event loop is blocked. >100ms indicates blocking synchronous code
- **Heap used** — current memory allocation. Steadily growing indicates a memory leak
- **RSS** — resident set size (total process memory). Includes heap, stack, and native objects
- **CPU time** — user and system CPU time. High system time may indicate excessive I/O

**Flamegraphs:** Visual representations of CPU time across call stacks. Wide bars indicate functions consuming significant CPU. Available through Chrome DevTools Performance tab or `clinic flame`.

**Memory leak patterns:**

- Growing Maps or Sets that are never cleared
- Event listeners added in loops without removal
- Closures capturing large scopes
- Uncleared timers (`setInterval` without `clearInterval`)
- Streams not properly destroyed

**Trade-offs:**

- `--prof` is built-in — but produces hard-to-read output without processing
- Chrome DevTools is powerful — but adds overhead that can affect results
- `clinic.js` automates analysis — but is a development-only tool
- Event loop monitoring reveals blocking — but cannot identify which function is blocking

## Source

https://nodejs.org/en/docs/guides/simple-profiling
