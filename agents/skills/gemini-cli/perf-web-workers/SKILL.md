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

4. **Implement a worker pool for parallel throughput.** Process multiple tasks concurrently across workers:

   ```typescript
   class WorkerPool {
     private workers: Worker[] = [];
     private queue: Array<{
       task: any;
       resolve: (value: any) => void;
       reject: (error: any) => void;
     }> = [];
     private busy = new Set<Worker>();

     constructor(workerUrl: URL, poolSize = navigator.hardwareConcurrency || 4) {
       for (let i = 0; i < poolSize; i++) {
         const worker = new Worker(workerUrl, { type: 'module' });
         worker.addEventListener('message', (e) => this.onComplete(worker, e.data));
         worker.addEventListener('error', (e) => this.onError(worker, e));
         this.workers.push(worker);
       }
     }

     exec(task: any): Promise<any> {
       return new Promise((resolve, reject) => {
         const idle = this.workers.find((w) => !this.busy.has(w));
         if (idle) {
           this.busy.add(idle);
           idle.postMessage(task);
           (idle as any).__resolve = resolve;
           (idle as any).__reject = reject;
         } else {
           this.queue.push({ task, resolve, reject });
         }
       });
     }

     private onComplete(worker: Worker, result: any) {
       (worker as any).__resolve(result);
       this.busy.delete(worker);
       this.processQueue(worker);
     }

     private processQueue(worker: Worker) {
       const next = this.queue.shift();
       if (next) {
         this.busy.add(worker);
         worker.postMessage(next.task);
         (worker as any).__resolve = next.resolve;
         (worker as any).__reject = next.reject;
       }
     }

     terminate() {
       this.workers.forEach((w) => w.terminate());
     }
   }

   // Usage
   const pool = new WorkerPool(new URL('./processor.ts', import.meta.url));
   const results = await Promise.all(
     chunks.map((chunk) => pool.exec({ type: 'process', data: chunk }))
   );
   ```

5. **Use SharedArrayBuffer for real-time shared state.** Multiple workers can read and write shared memory without copying:

   ```typescript
   // Requires: Cross-Origin-Opener-Policy: same-origin
   // Requires: Cross-Origin-Embedder-Policy: require-corp

   // main.ts — create shared buffer
   const sharedBuffer = new SharedArrayBuffer(1024 * Int32Array.BYTES_PER_ELEMENT);
   const sharedArray = new Int32Array(sharedBuffer);

   // Send the same buffer to multiple workers
   worker1.postMessage({ buffer: sharedBuffer });
   worker2.postMessage({ buffer: sharedBuffer });

   // worker.ts — read/write with Atomics for thread safety
   self.addEventListener('message', (e) => {
     const array = new Int32Array(e.data.buffer);

     // Atomic operations prevent data races
     Atomics.add(array, 0, 1); // atomic increment
     const value = Atomics.load(array, 0); // atomic read
     Atomics.store(array, 1, 42); // atomic write

     // Wait/notify for synchronization
     Atomics.wait(array, 2, 0); // sleep until notified
     Atomics.notify(array, 2, 1); // wake one waiting worker
   });
   ```

6. **Integrate workers with React.** Use hooks to manage worker lifecycle:

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

   // Usage
   function DataProcessor({ items }) {
     const { result, loading, execute } = useWorker<ProcessedItem[]>(
       () => new Worker(new URL('./processor.ts', import.meta.url), { type: 'module' })
     );

     useEffect(() => {
       if (items.length > 0) execute(items);
     }, [items, execute]);

     if (loading) return <Spinner />;
     return <DataTable data={result} />;
   }
   ```

7. **Configure bundlers for worker support.**

   ```typescript
   // Vite: workers work out of the box with ?worker suffix
   import MyWorker from './worker?worker';
   const worker = new MyWorker();

   // Or with standard URL pattern (Vite, webpack 5, esbuild):
   const worker = new Worker(new URL('./worker.ts', import.meta.url), {
     type: 'module',
   });

   // webpack 5: worker-loader is no longer needed
   // The new URL() pattern is natively supported
   ```

## Details

### Worker Thread Cost

Creating a Web Worker takes ~40-100ms (DOM thread) for the initial setup. Each worker consumes ~1-5MB of memory for its V8 isolate. The postMessage serialization uses the structured clone algorithm, which copies data at ~400MB/s for typed arrays and ~50MB/s for complex objects. For a 10MB JSON dataset, serialization takes ~200ms — this can negate the benefit if the computation itself is fast. Use Transferable objects or SharedArrayBuffer to avoid copy cost.

### Worked Example: Figma Canvas Rendering

Figma processes design file data in Web Workers. The main thread handles UI interaction (clicks, selections, viewport panning), while a dedicated worker handles: (1) parsing the binary file format, (2) computing layout constraints, (3) generating render commands. The worker sends render commands to the main thread via Transferable ArrayBuffers, which are then submitted to WebGL. This architecture ensures that even opening a file with 10,000+ layers does not block UI interaction. INP stays under 50ms during file operations that would otherwise freeze the main thread for seconds.

### Worked Example: Google Sheets Calculations

Google Sheets offloads cell recalculation to Web Workers. When a user edits a cell, the dependency graph traversal and formula evaluation run in a worker pool. The main thread remains responsive for continued typing and scrolling. For large spreadsheets with complex formulas, recalculation can take hundreds of milliseconds — running this on the main thread would make every keystroke feel sluggish. The worker pool uses SharedArrayBuffer for the cell value grid, allowing all workers to read the current state without serialization overhead.

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
