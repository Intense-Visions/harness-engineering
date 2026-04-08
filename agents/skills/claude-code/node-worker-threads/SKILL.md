# Node.js Worker Threads

> Offload CPU-intensive work to worker threads using MessageChannel and shared buffers

## When to Use

- Running CPU-intensive operations without blocking the event loop
- Parallelizing computation across CPU cores
- Processing large datasets (image processing, CSV parsing, cryptography)
- When child processes are too heavyweight (worker threads share memory)

## Instructions

1. **Basic worker thread:**

```typescript
// main.ts
import { Worker } from 'node:worker_threads';

const worker = new Worker('./worker.ts', {
  workerData: { input: [1, 2, 3, 4, 5] },
});

worker.on('message', (result) => {
  console.log('Result:', result);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

worker.on('exit', (code) => {
  if (code !== 0) console.error(`Worker exited with code ${code}`);
});
```

```typescript
// worker.ts
import { parentPort, workerData } from 'node:worker_threads';

const result = workerData.input.map((n: number) => n * n);
parentPort?.postMessage(result);
```

2. **Promise-based wrapper:**

```typescript
function runWorker<T>(workerPath: string, data: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

const result = await runWorker<number[]>('./worker.ts', { input: data });
```

3. **Worker pool** for reusing threads:

```typescript
import { Worker } from 'node:worker_threads';
import os from 'node:os';

class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{ data: unknown; resolve: Function; reject: Function }> = [];
  private available: Worker[] = [];

  constructor(
    private workerPath: string,
    size = os.cpus().length
  ) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerPath);
      worker.on('message', (result) => {
        this.available.push(worker);
        this.processQueue();
      });
      this.workers.push(worker);
      this.available.push(worker);
    }
  }

  exec<T>(data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    while (this.queue.length > 0 && this.available.length > 0) {
      const worker = this.available.pop()!;
      const { data, resolve } = this.queue.shift()!;
      worker.once('message', resolve);
      worker.postMessage(data);
    }
  }

  async destroy() {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
```

4. **SharedArrayBuffer** for zero-copy data sharing:

```typescript
// Share a buffer between main thread and worker
const sharedBuffer = new SharedArrayBuffer(1024);
const sharedArray = new Int32Array(sharedBuffer);

const worker = new Worker('./worker.ts', {
  workerData: { buffer: sharedBuffer },
});

// Worker can read/write sharedArray directly — no serialization
```

5. **Transfer large data** without copying:

```typescript
const buffer = new ArrayBuffer(1024 * 1024); // 1MB
worker.postMessage({ buffer }, [buffer]); // Transfer, not copy
// buffer is now detached in the main thread
```

## Details

Worker threads run JavaScript in parallel OS threads within the same Node.js process. They share memory space but have separate V8 instances and event loops.

**Worker threads vs child processes:**

- Worker threads share memory (SharedArrayBuffer) and have lower startup cost
- Child processes have full isolation (separate memory, separate process)
- Use workers for CPU computation; use child processes for running external programs

**Communication overhead:** `postMessage` serializes data using the structured clone algorithm. For large objects, this serialization can be slower than the computation itself. Use SharedArrayBuffer or transferable objects to avoid copying.

**Trade-offs:**

- Worker threads parallelize CPU work — but add complexity for inter-thread communication
- SharedArrayBuffer enables zero-copy sharing — but requires Atomics for synchronization
- Worker pools reuse threads — but require managing pool lifecycle and task queuing
- Transferable objects avoid copying — but detach the original buffer

## Source

https://nodejs.org/api/worker_threads.html
