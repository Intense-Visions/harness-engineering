# Long Tasks

> Detect, break up, and eliminate long tasks (>50ms on the main thread) using time-slicing, scheduler APIs, Web Workers, and cooperative yielding to keep the UI responsive and meet the 50ms responsiveness budget.

## When to Use

- Chrome DevTools Performance panel shows red "Long Task" markers (tasks exceeding 50ms)
- INP is poor because user interactions are delayed by long-running tasks on the main thread
- Page initialization runs heavy synchronous work (data processing, DOM construction, parsing)
- You are processing large datasets (sorting, filtering, searching) synchronously on the main thread
- The Long Tasks API (`PerformanceObserver` with `longtask` type) fires frequently in production monitoring
- You need to choose between `scheduler.yield()`, `scheduler.postTask()`, `requestIdleCallback`, and Web Workers
- `JSON.parse` on multi-MB payloads blocks the main thread
- Third-party scripts contribute long tasks that degrade responsiveness
- A computationally intensive feature (syntax highlighting, markdown parsing, image processing) needs to run without blocking
- Animation or scroll frame rate drops below 60fps due to JavaScript execution in the main thread

## Instructions

1. **Understand the 50ms budget.** At 60fps, each frame is 16.67ms. The browser needs ~6ms for rendering (style, layout, paint, composite). That leaves ~10ms for JavaScript per frame. The Long Tasks API defines 50ms as the threshold because: a task under 50ms allows the browser to respond to input within 100ms (the perceptual threshold for "instant" response).

2. **Detect long tasks with the Performance Observer:**

   ```javascript
   const observer = new PerformanceObserver((list) => {
     for (const entry of list.getEntries()) {
       console.log('Long task detected:', entry.duration, 'ms');
       console.log('Attribution:', entry.attribution[0]?.containerName);
     }
   });
   observer.observe({ type: 'longtask', buffered: true });
   ```

3. **Break up long tasks with `scheduler.yield()`.** This is the preferred modern approach — it yields to the browser so pending input events can run, then resumes the work:

   ```javascript
   async function processLargeDataset(items) {
     const CHUNK_SIZE = 100;
     for (let i = 0; i < items.length; i += CHUNK_SIZE) {
       const chunk = items.slice(i, i + CHUNK_SIZE);
       processChunk(chunk);

       // Yield to browser — allows input events and rendering
       await scheduler.yield();
     }
   }
   ```

4. **Use `scheduler.postTask()` for priority-based scheduling:**

   ```javascript
   // High priority — respond to user action
   await scheduler.postTask(() => updateSearchResults(query), {
     priority: 'user-blocking',
   });

   // Low priority — prefetch next page data
   scheduler.postTask(() => prefetchNextPage(), {
     priority: 'background',
   });
   ```

5. **Use `requestIdleCallback` for truly non-urgent work:**

   ```javascript
   function processAnalyticsQueue() {
     requestIdleCallback((deadline) => {
       // Process items while we have idle time (at least 5ms remaining)
       while (deadline.timeRemaining() > 5 && analyticsQueue.length > 0) {
         sendAnalyticsEvent(analyticsQueue.shift());
       }
       // If more items remain, schedule another idle callback
       if (analyticsQueue.length > 0) {
         requestIdleCallback(processAnalyticsQueue);
       }
     });
   }
   ```

6. **Move CPU-intensive work to Web Workers:**

   ```javascript
   // main.js — offload to worker
   const worker = new Worker('/syntax-worker.js');
   worker.postMessage({ text: editorContent });
   worker.onmessage = (e) => {
     applyHighlighting(e.data.tokens);
   };

   // syntax-worker.js — runs on a separate thread
   self.onmessage = (e) => {
     const tokens = parseSyntax(e.data.text); // 150ms of CPU work
     self.postMessage({ tokens }); // does not block main thread
   };
   ```

7. **Use the MessageChannel trick for zero-delay yielding (pre-scheduler.yield):**

   ```javascript
   function yieldToMain() {
     return new Promise((resolve) => {
       const channel = new MessageChannel();
       channel.port1.onmessage = resolve;
       channel.port2.postMessage(null);
     });
   }

   async function processItems(items) {
     for (const item of items) {
       processItem(item);
       await yieldToMain(); // no 4ms setTimeout clamp
     }
   }
   ```

## Details

### Why 50ms Is the Threshold

The 50ms threshold comes from the RAIL performance model:

- **Response** — respond to user input within 100ms
- The 100ms budget includes input processing (event handler) plus rendering
- If a task is already running when the user interacts, the interaction must wait for the task to finish
- A 50ms task + 50ms event processing + rendering = ~100ms total response time

Tasks under 50ms are safe because even if a user interaction arrives while the task is running, the worst-case delay is under 100ms. Tasks over 50ms risk perceptible delay.

### Worked Example: Google Search Results Chunked Rendering

Google's search results page renders 10 results in 5 chunks of 2 results each, yielding between chunks with `scheduler.yield()`. Without chunking, rendering all 10 results takes 80ms (a long task). With chunking:

- Chunk 1 (results 1-2): 16ms, yield
- Chunk 2 (results 3-4): 16ms, yield
- Chunk 3 (results 5-6): 16ms, yield
- Chunk 4 (results 7-8): 16ms, yield
- Chunk 5 (results 9-10): 16ms

Total time increases from 80ms to ~95ms (overhead from yielding), but no single task exceeds 50ms. INP improved from 200ms to 40ms because user interactions are no longer blocked by a monolithic render task.

### Worked Example: Markdown Editor Web Worker

A markdown editor moved syntax highlighting to a Web Worker. The main thread sends raw text via `postMessage`. The worker tokenizes the text (150ms of CPU work per keystroke on large documents) and returns highlighted tokens. The main thread applies the tokens to the DOM.

Before: typing in a 10,000-line document caused 150ms input lag per keystroke (long task blocking every keypress). After: the worker processes asynchronously, main thread stays responsive, and highlighted tokens arrive 150ms after each keystroke with no input blocking. Perceived latency for typing dropped to <16ms.

### Strategies Comparison

| Strategy                | Latency           | Priority        | Thread     | Use Case                       |
| ----------------------- | ----------------- | --------------- | ---------- | ------------------------------ |
| `scheduler.yield()`     | ~0ms              | Inherits caller | Main       | Breaking up sequential work    |
| `scheduler.postTask()`  | ~0ms              | Explicit        | Main       | Priority-based scheduling      |
| `setTimeout(fn, 0)`     | 0-4ms             | None            | Main       | Legacy yielding                |
| `MessageChannel`        | ~0ms              | None            | Main       | Zero-delay yielding (polyfill) |
| `requestIdleCallback`   | Variable          | Lowest          | Main       | Non-urgent background work     |
| `requestAnimationFrame` | Up to 16ms        | Frame-aligned   | Main       | Visual updates only            |
| Web Worker              | Transfer overhead | N/A             | Background | CPU-intensive parallel work    |

### Anti-Patterns

**Processing entire large arrays synchronously.** `items.forEach(heavyFn)` on 10,000 items with 0.05ms per item creates a 500ms long task. Break into chunks with yielding between each chunk.

**`JSON.parse` of multi-MB payloads on the main thread.** `JSON.parse` is synchronous and cannot be interrupted. A 5MB JSON string takes 50-200ms to parse depending on complexity. Use a streaming JSON parser in a Web Worker, or fetch data in smaller paginated chunks.

**Using `requestAnimationFrame` for non-visual work.** rAF callbacks share the frame budget with rendering. Scheduling heavy computation in rAF steals time from style, layout, and paint, causing frame drops. Use `scheduler.postTask` or `requestIdleCallback` for non-visual work.

**Debounce-only approach to responsiveness.** Debouncing a search input handler to 300ms hides the problem but does not fix it. When the debounced handler finally fires, it may still run a 200ms long task. Combine debouncing with chunked processing and yielding.

**Assuming Web Worker communication is free.** `postMessage` uses the structured clone algorithm, which can be expensive for large objects. Transferring a 10MB ArrayBuffer is fast (transferable), but cloning a 10MB object graph with nested arrays takes 50-100ms. Use transferable objects or SharedArrayBuffer when possible.

## Source

- Long Tasks API specification — https://w3c.github.io/longtasks/
- web.dev "Optimize long tasks" — https://web.dev/articles/optimize-long-tasks
- Scheduler API specification — https://wicg.github.io/scheduling-apis/
- Chrome DevTools Performance panel documentation — https://developer.chrome.com/docs/devtools/performance

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
- No long tasks (>50ms) occur during critical user interactions.
- The Long Tasks API is used to detect and monitor long tasks in production.
