# Web Workers

> Master Web Workers for off-main-thread computation — dedicated workers for CPU-intensive tasks, Comlink for ergonomic worker communication, SharedArrayBuffer for zero-copy data sharing, worker pooling for throughput, and integration patterns with React and bundlers.

## When to Use

- JSON parsing of large payloads (>1MB) blocks the main thread and causes jank
- Complex calculations (data transformation, sorting, filtering) exceed the 50ms Long Task threshold
- Image processing (resizing, filters, format conversion) needs to happen client-side
- Syntax highlighting, Markdown rendering, or code compilation blocks user input
- A real-time application needs continuous computation without affecting UI responsiveness
- Search indexing or full-text search over large client-side datasets causes frame drops
- Encryption or hashing operations block the main thread
- A spreadsheet or data grid application performs heavy cell computations
- WebAssembly modules need a dedicated thread for parallel execution
- INP is poor because computation and rendering compete for the main thread

## Instructions

1. **Create a dedicated worker for CPU-intensive tasks.** Move computation off the main thread:

   ```typescript
   // worker.ts — runs in a separate thread
   self.addEventListener('message', (event) => {
     const { type, data } = event.data;

     switch (type) {
       case 'sort': {
         const sorted = data.sort((a, b) => a.score - b.score);
         self.postMessage({ type: 'sorted', data: sorted });
         break;
       }
       case 'filter': {
         const filtered = data.filter((item) => item.name.toLowerCase().includes(event.data.query));
         self.postMessage({ type: 'filtered', data: filtered });
         break;
       }
     }
   });

   // main.ts — UI thread
   const worker = new Worker(new URL('./worker.ts', import.meta.url), {
     type: 'module',
   });

   worker.addEventListener('message', (event) => {
     const { type, data } = event.data;
     if (type === 'sorted') {
       renderSortedList(data);
     }
   });

   // Send work to the worker (non-blocking)
   worker.postMessage({ type: 'sort', data: largeDataset });
   ```

2. **Use Comlink for ergonomic worker communication.** Comlink wraps postMessage with an RPC-style API:

   ```typescript
   // worker.ts — expose functions via Comlink
   import * as Comlink from 'comlink';

   const api = {
     async processData(items: Item[]): Promise<ProcessedItem[]> {
       // Heavy computation runs off main thread
       return items.map((item) => ({
         ...item,
         score: calculateComplexScore(item),
         rank: determineRank(item),
       }));
     },

     async search(items: Item[], query: string): Promise<Item[]> {
       // Full-text search with ranking
       return items
         .filter((item) => fuzzyMatch(item.name, query))
         .sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
     },
   };

   Comlink.expose(api);

   // main.ts — call worker functions like normal async functions
   import * as Comlink from 'comlink';

   const worker = new Worker(new URL('./worker.ts', import.meta.url), {
     type: 'module',
   });
   const api = Comlink.wrap<typeof import('./worker').api>(worker);

   // Looks like a regular async function call
   const processed = await api.processData(largeDataset);
   const results = await api.search(items, 'query');
   ```

3. **Use Transferable objects for zero-copy data transfer.** Large ArrayBuffers can be transferred to workers without copying:

   ```typescript
   // Transfer (zero-copy) — ownership moves to worker, original is detached
   const buffer = new ArrayBuffer(1024 * 1024); // 1MB
   worker.postMessage({ buffer }, [buffer]);
   // buffer.byteLength is now 0 — ownership transferred

   // Structured clone (copy) — default behavior, copies data
   worker.postMessage({ data: largeArray });
   // Both threads have their own copy — 2x memory usage

   // Transfer ImageBitmap for image processing
   const bitmap = await createImageBitmap(imageBlob);
   worker.postMessage({ bitmap }, [bitmap]);
   ```

4. **Implement a worker pool for parallel throughput.** Create `navigator.hardwareConcurrency` workers at startup. Maintain a busy set and task queue. When a task arrives, dispatch to an idle worker or enqueue. On completion, resolve the promise and process the next queued task:

   ```typescript
   class WorkerPool {
     private workers: Worker[] = [];
     private queue: Array<{ task: any; resolve: Function; reject: Function }> = [];
     private busy = new Set<Worker>();

     constructor(workerUrl: URL, poolSize = navigator.hardwareConcurrency || 4) {
       for (let i = 0; i < poolSize; i++) {
         const w = new Worker(workerUrl, { type: 'module' });
         w.addEventListener('message', (e) => this.onComplete(w, e.data));
         this.workers.push(w);
       }
     }

     exec(task: any): Promise<any> {
       return new Promise((resolve, reject) => {
         const idle = this.workers.find((w) => !this.busy.has(w));
         if (idle) {
           this.dispatch(idle, task, resolve, reject);
         } else {
           this.queue.push({ task, resolve, reject });
         }
       });
     }

     private dispatch(w: Worker, task: any, resolve: Function, reject: Function) {
       this.busy.add(w);
       (w as any).__resolve = resolve;
       w.postMessage(task);
     }

     private onComplete(w: Worker, result: any) {
       (w as any).__resolve(result);
       this.busy.delete(w);
       const next = this.queue.shift();
       if (next) this.dispatch(w, next.task, next.resolve, next.reject);
     }

     terminate() {
       this.workers.forEach((w) => w.terminate());
     }
   }
   ```

5. **Use SharedArrayBuffer for real-time shared state.** Requires COOP (`same-origin`) and COEP (`require-corp`) headers. Create a `SharedArrayBuffer`, wrap in `Int32Array`, and send to multiple workers. Use `Atomics.add/load/store` for thread-safe reads and writes, and `Atomics.wait/notify` for synchronization. This avoids all serialization overhead for numeric data.

6. **Integrate workers with React.** Create a `useWorker` hook: instantiate the worker in `useEffect`, return `{ result, loading, execute }`, and terminate on cleanup. This manages lifecycle and prevents leaks:

   ```typescript
   function useWorker<T>(workerFactory: () => Worker) {
     const workerRef = useRef<Worker | null>(null);
     const [result, setResult] = useState<T | null>(null);
     const [loading, setLoading] = useState(false);

     useEffect(() => {
       workerRef.current = workerFactory();
       workerRef.current.addEventListener('message', (e) => {
         setResult(e.data);
         setLoading(false);
       });
       return () => workerRef.current?.terminate();
     }, []);

     const execute = useCallback((data: any) => {
       setLoading(true);
       workerRef.current?.postMessage(data);
     }, []);

     return { result, loading, execute };
   }
   ```

7. **Configure bundlers for worker support.** Vite supports `import MyWorker from './worker?worker'` or the standard `new URL('./worker.ts', import.meta.url)` pattern. Webpack 5 and esbuild also support the `new URL()` pattern natively (worker-loader is no longer needed).

## Details

### Worker Thread Cost

Worker creation takes ~40-100ms; each consumes ~1-5MB for its V8 isolate. Structured clone serialization runs at ~400MB/s for typed arrays, ~50MB/s for complex objects. A 10MB JSON dataset takes ~200ms to serialize, potentially negating the benefit. Use Transferable objects or SharedArrayBuffer to avoid copy cost.

### Worked Example: Figma Canvas Rendering

A dedicated worker parses the binary file format, computes layout constraints, and generates render commands sent to the main thread via Transferable ArrayBuffers for WebGL submission. Result: opening 10,000+ layer files does not block UI; INP stays under 50ms.

### Worked Example: Google Sheets Calculations

Cell recalculation (dependency graph traversal + formula evaluation) runs in a worker pool. SharedArrayBuffer stores the cell value grid so all workers read current state without serialization. Result: responsive typing and scrolling even during heavy recalculation.

### Anti-Patterns

**Moving trivial computation to workers.** If the computation takes <5ms, the overhead of postMessage serialization (~1ms) and worker context switching exceeds the benefit. Only offload computation that takes >50ms on the main thread.

**Creating a new worker per task.** Worker creation takes ~50ms. Reuse workers by sending new tasks via postMessage. Create workers at application startup, not on demand.

**Sending large objects via postMessage without Transferable.** Sending a 50MB ArrayBuffer via structured clone takes ~125ms and doubles memory usage. Use Transferable objects (`postMessage(data, [buffer])`) for zero-copy transfer.

**Ignoring worker errors.** Uncaught errors in workers are silently swallowed by default. Always add `onerror` and `onmessageerror` handlers to workers for debugging and resilience.

## Source

- MDN: Web Workers API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- Comlink — https://github.com/GoogleChromeLabs/comlink
- MDN: SharedArrayBuffer — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- Surma: "When should you be using Web Workers?" — https://surma.dev/things/when-workers/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- CPU-intensive tasks (>50ms) run in Web Workers, not on the main thread.
- Worker communication uses Comlink or a similar RPC abstraction for ergonomics.
- Large data transfers use Transferable objects to avoid serialization overhead.
- Workers are reused (not created per task) and properly terminated on cleanup.
- Main thread INP remains under 200ms even during heavy background computation.
