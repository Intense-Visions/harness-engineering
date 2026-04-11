# Garbage Collection

> Understand V8's generational garbage collector — young generation Scavenge, old generation Mark-Sweep-Compact, incremental and concurrent marking — to minimize GC pauses and reduce allocation pressure in performance-critical code.

## When to Use

- Chrome DevTools Performance panel shows yellow "GC" blocks causing frame drops or long pauses
- The application has a high allocation rate (>10MB/s) causing frequent minor GC pauses
- Major GC pauses (>50ms) interrupt animations or user interactions
- Node.js `--trace-gc` output shows frequent or long GC events under load
- You are building a real-time application (trading dashboard, game, audio processor) where GC pauses are unacceptable
- Object pooling or allocation reduction could improve throughput
- The V8 heap grows unboundedly and you suspect objects are surviving to old generation unnecessarily
- `performance.measureUserAgentSpecificMemory()` or `performance.memory` shows high heap usage
- Animation code creates new objects every frame (60 allocations/second per object type)
- A Node.js server experiences latency spikes correlated with GC pauses

## Instructions

1. **Understand the generational hypothesis.** Most objects die young — they are allocated, used briefly, and become garbage. V8 exploits this by dividing the heap into generations:
   - **Young generation (new space)** — small (1-8MB), collected frequently with fast Scavenge algorithm
   - **Old generation (old space)** — larger (up to GB), collected less frequently with Mark-Sweep-Compact

2. **Understand Scavenge (minor GC).** The young generation uses a semi-space copying collector:
   - Two equally-sized semi-spaces: "from-space" and "to-space"
   - Allocation happens in from-space
   - When from-space is full, live objects are copied to to-space (dead objects are simply abandoned)
   - The spaces swap roles
   - Objects that survive 2 Scavenge cycles are promoted to old generation
   - Pause time: 1-5ms (proportional to number of live objects, not dead ones)

3. **Understand Mark-Sweep-Compact (major GC).** The old generation uses a tracing collector:
   - **Mark** — trace from GC roots (global object, stack, handles), mark reachable objects
   - **Sweep** — reclaim memory of unmarked objects, add to free lists
   - **Compact** — (optional) move surviving objects together to reduce fragmentation
   - Pause time: 10-100ms+ for large heaps (proportional to number of live objects)

4. **Reduce allocation pressure in hot paths.** Every allocation eventually triggers GC. In code that runs 60 times per second (animation loops) or thousands of times per second (request handlers), minimize allocations:

   ```javascript
   // BAD — creates new object every frame (60 objects/second, all become garbage)
   function animate() {
     const position = { x: calcX(), y: calcY() };
     applyPosition(position);
     requestAnimationFrame(animate);
   }

   // GOOD — reuse object, zero allocations per frame
   const position = { x: 0, y: 0 };
   function animate() {
     position.x = calcX();
     position.y = calcY();
     applyPosition(position);
     requestAnimationFrame(animate);
   }
   ```

5. **Implement object pooling for frequently created/destroyed objects:**

   ```javascript
   class ParticlePool {
     constructor(size) {
       this.pool = Array.from({ length: size }, () => ({
         x: 0,
         y: 0,
         vx: 0,
         vy: 0,
         active: false,
       }));
       this.nextFree = 0;
     }

     acquire() {
       const obj = this.pool[this.nextFree];
       obj.active = true;
       this.nextFree = (this.nextFree + 1) % this.pool.length;
       return obj;
     }

     release(obj) {
       obj.active = false;
       obj.x = obj.y = obj.vx = obj.vy = 0;
     }
   }
   ```

6. **Monitor GC in Node.js with `--trace-gc`:**

   ```bash
   # Shows every GC event with type, duration, and heap sizes
   node --trace-gc server.js

   # Output example:
   # [12345:0x1234]   100 ms: Scavenge 4.2 (8.0) -> 2.1 (8.0) MB, 1.3 / 0.0 ms
   # [12345:0x1234]  5000 ms: Mark-sweep 45.2 (64.0) -> 32.1 (64.0) MB, 85.3 / 0.0 ms
   ```

7. **Use `performance.measureUserAgentSpecificMemory()` for browser heap measurement:**

   ```javascript
   // Requires cross-origin isolation headers
   if (performance.measureUserAgentSpecificMemory) {
     const result = await performance.measureUserAgentSpecificMemory();
     console.log('Total JS heap:', result.bytes);
     for (const breakdown of result.breakdown) {
       console.log(breakdown.types, breakdown.bytes);
     }
   }
   ```

## Details

### V8 Heap Spaces

V8 divides the heap into several spaces:

- **New space** (young generation) — 1-8MB, two semi-spaces. Objects start here.
- **Old space** — objects promoted from new space after surviving 2 GCs
- **Large object space** — objects larger than the semi-space maximum (~512KB) go directly here
- **Code space** — JIT-compiled code (machine code)
- **Map space** — hidden classes (V8's internal type system)

### Orinoco: V8's Modern GC

V8's garbage collector (Orinoco) uses three strategies to reduce pause times:

1. **Incremental marking** — breaks the Mark phase into small steps (1-5ms each) interleaved with JavaScript execution. Instead of one 100ms mark phase, runs 20 steps of 5ms.

2. **Concurrent marking** — runs marking on background threads while JavaScript executes on the main thread. The main thread only pauses briefly for the final "remark" step.

3. **Parallel Scavenge** — uses multiple threads for the young generation copy, reducing Scavenge pause from 3ms to <1ms.

### Worked Example: Trading Dashboard Allocation Pressure

A real-time trading dashboard received WebSocket price updates at 100 messages/second. Each message handler created a new price tick object: `{ symbol, price, timestamp, change }`. At 100 objects/second, allocation rate was 50MB/s. This triggered Scavenge every 100ms and major GC every 10 seconds (200ms pause).

Fix: implemented object pooling with a ring buffer of 1,000 pre-allocated tick objects. When a new tick arrives, the oldest inactive tick is recycled. Allocation rate dropped from 50MB/s to 2MB/s (only new strings for symbol names). Scavenge frequency dropped to every 4 seconds, and major GC pauses dropped from 200ms to <5ms because the old generation held a stable set of pool objects.

### Worked Example: Node.js Streaming JSON

A Node.js API server serialized responses using `JSON.stringify` on objects up to 50MB. At peak load (100 requests/second), peak old-gen usage reached 3.8GB (close to the 4GB `--max-old-space-size` limit), triggering 300ms major GC pauses every 30 seconds.

Fix: switched to streaming JSON serialization (`json-stream-stringify`) which serializes incrementally, producing string chunks that are flushed immediately and collected by minor GC. Peak old-gen usage dropped from 3.8GB to 1.2GB because large intermediate string objects no longer accumulated in old space. Major GC pauses dropped to 15ms.

### Anti-Patterns

**Creating objects in hot loops.** `array.map(item => ({ ...item, computed: calc(item) }))` creates a new object per item. At 60fps with 100 items, that is 6,000 objects/second becoming garbage. Use in-place mutation or pre-allocated arrays when GC sensitivity is critical.

**String concatenation in loops.** Each `str += chunk` creates a new string; the old one becomes garbage. For building large strings, use an array and `join()`, or use a single template literal.

```javascript
// BAD — O(n) strings become garbage
let html = '';
for (const item of items) {
  html += `<div>${item.name}</div>`; // new string each iteration
}

// GOOD — one allocation at the end
const parts = items.map((item) => `<div>${item.name}</div>`);
const html = parts.join('');
```

**Not reusing arrays/objects across animation frames.** Creating new arrays or objects each frame for position calculations, collision detection, or particle updates creates constant Scavenge pressure. Pre-allocate and reuse.

**Relying on `--expose-gc` and manual `global.gc()` in production.** Manual GC calls cause a full stop-the-world pause at the worst possible time (when you call it). V8's automatic GC is highly optimized to find the best time to collect. Manual GC is only useful for benchmarking and debugging.

**Promoting short-lived objects to old generation.** Holding references to temporary objects across multiple GC cycles (in closures, module-scope variables, caches without eviction) causes them to be promoted to old generation. Old generation collection is much more expensive. Ensure temporary objects go out of scope quickly.

## Source

- V8 Blog: "Trash talk: the Orinoco garbage collector" — https://v8.dev/blog/trash-talk
- V8 Blog: "Jank Busters" — https://v8.dev/blog/jank-busters
- Chrome DevTools Memory panel documentation
- Node.js `--trace-gc` flag documentation — https://nodejs.org/api/cli.html#--trace-gc

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
- GC pauses are monitored and stay under 50ms during user interactions.
- Allocation rate in hot paths is minimized through object reuse and pooling.
