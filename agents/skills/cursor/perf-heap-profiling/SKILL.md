# Heap Profiling

> Master heap snapshot analysis — Summary, Comparison, Containment, and Dominator views — to precisely identify what objects consume memory, why they are retained, and how to reclaim leaked memory using the 3-snapshot technique and allocation tracking.

## When to Use

- Memory usage grows over time and you need to identify which objects are accumulating
- The 3-snapshot technique is needed to isolate memory leaks in an SPA
- You need to understand the difference between shallow size and retained size for a specific object
- A heap snapshot shows unexpected objects surviving garbage collection
- You need to trace the retaining path from a leaked object to its GC root
- Node.js heap profiling with `--heap-prof` or `v8.writeHeapSnapshot()` is needed
- Allocation tracking over time is needed to find what code path allocates the most
- The dominator tree reveals a single object retaining a disproportionate amount of memory
- You need to compare heap state before and after a specific user action
- Production memory profiling with low overhead is needed (allocation sampling)

## Instructions

1. **Take a heap snapshot.** In Chrome DevTools Memory panel, select "Heap snapshot" and click "Take snapshot." The snapshot captures every object on the V8 heap with its size, type, and references. Note: taking a snapshot triggers a full GC first, so only live objects appear.

2. **Understand the four views:**
   - **Summary** — groups objects by constructor name. Shows count, shallow size, and retained size per type. Start here to find which object types dominate memory.
   - **Comparison** — compares two snapshots. Shows objects added, deleted, and delta between snapshots. Use this with the 3-snapshot technique.
   - **Containment** — shows the object graph from GC roots. Drill down from Window/Global to see what each root retains.
   - **Statistics** — pie chart of memory by object type category (code, strings, arrays, typed arrays, system).

3. **Understand shallow vs retained size:**
   - **Shallow size** — the memory the object itself occupies (its own properties, not referenced objects). A typical JavaScript object is 32-56 bytes shallow.
   - **Retained size** — the total memory that would be freed if this object were garbage collected. Includes all objects exclusively retained by this object. This is almost always the metric you want.

   Example: a 56-byte `Map` object (shallow) that holds 10,000 entries with 1KB values each has a retained size of ~10MB.

4. **Execute the 3-snapshot technique:**

   ```
   1. Load page, wait for stabilization → Take Snapshot 1 (baseline)
   2. Perform suspected leaking action (navigate, open dialog, etc.)
   3. Undo the action (navigate back, close dialog)
   4. Force GC (click trash can icon) → Take Snapshot 2
   5. Repeat step 2-3
   6. Force GC → Take Snapshot 3
   7. In Snapshot 3, switch to Comparison view, compare against Snapshot 2
   8. Filter by "Objects allocated between Snapshot 2 and Snapshot 3"
   9. Objects that appear here survived two rounds → these are leaking
   ```

5. **Read retaining paths.** Select an object in the snapshot. The "Retainers" panel at the bottom shows every path from a GC root to this object. The shortest path is usually the most informative:

   ```
   system / Context → () @123456 → map property → Object @789012 (your leaked object)
   ```

   Each arrow represents a reference. To fix the leak, break one link in the chain.

6. **Use allocation tracking for time-based analysis.** Instead of a static snapshot, use "Allocation instrumentation on timeline" in the Memory panel. This records every allocation over time with call stacks. Blue bars are allocations that survived, gray bars are collected. Focus on the blue bars — these are retained allocations that may be leaking.

7. **Profile Node.js heaps:**

   ```javascript
   // Take a heap snapshot programmatically
   const v8 = require('v8');
   const fs = require('fs');

   const snapshotStream = v8.writeHeapSnapshot();
   console.log('Heap snapshot written to:', snapshotStream);

   // Or use --heap-prof for allocation profiling
   // node --heap-prof --heap-prof-interval=512 server.js
   // Produces .heapprofile files loadable in Chrome DevTools
   ```

8. **Use allocation sampling for low-overhead production profiling:**

   ```javascript
   // Start sampling (low overhead, suitable for production)
   const inspector = require('inspector');
   const session = new inspector.Session();
   session.connect();

   session.post('HeapProfiler.startSampling');
   // ... run workload ...
   session.post('HeapProfiler.stopSampling', (err, result) => {
     fs.writeFileSync('heap-profile.heapprofile', JSON.stringify(result.profile));
   });
   ```

## Details

### How to Read the Summary View

The Summary view groups objects by constructor name. Key columns:

| Column        | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| Constructor   | The object type (e.g., `Array`, `Object`, `HTMLDivElement`, `(closure)`)       |
| Distance      | Number of references from GC root to object (lower = more directly referenced) |
| Shallow Size  | Memory of the object itself (bytes)                                            |
| Retained Size | Memory freed if this object were GC'd (bytes)                                  |

Sort by "Retained Size" descending to find the biggest memory consumers. Look for unexpectedly large retained sizes on objects you expect to be small.

### Worked Example: 3-Snapshot SPA Leak Isolation

A team used the 3-snapshot comparison to isolate a 2MB/navigation leak in an SPA:

1. Snapshot 1: baseline (50MB heap)
2. Navigate to detail page, navigate back
3. Snapshot 2: 52MB heap
4. Navigate to detail page, navigate back
5. Snapshot 3: 54MB heap

Comparing Snapshot 3 vs Snapshot 2: 2,400 new `HTMLDivElement` objects with retaining paths through a module-level variable declared as `const elementCache = new WeakMap()`. Investigation revealed a typo — the actual code was `const elementCache = new Map()` (regular Map, not WeakMap). DOM elements used as Map keys were strongly referenced, preventing GC of the entire detached subtree.

Fix: changed `Map` to `WeakMap`. Leak eliminated — heap stabilized at 52MB across navigations.

### Worked Example: Node.js Heap Profiling with --heap-prof

A Node.js service used `--heap-prof` with `--heap-prof-interval=512` to sample production heap allocations at 512KB intervals. The resulting `.heapprofile` file was loaded in Chrome DevTools.

Analysis revealed that 40% of all allocations came from `Buffer.from(JSON.stringify(logEntry))` in a logging middleware, called on every HTTP request. Each request created a 2-4KB Buffer that was immediately written to a log stream and discarded.

Fix: implemented a Buffer pool that reused pre-allocated Buffers for log serialization. Allocation rate from logging dropped by 90%, reducing Scavenge frequency from every 200ms to every 2 seconds.

### Anti-Patterns

**Taking heap snapshots in production without understanding the pause.** Taking a snapshot triggers a full GC and serialization. For a 2GB heap, this can pause the process for 1-10 seconds. In production, use allocation sampling (low overhead) instead of full snapshots.

**Comparing snapshots across page reloads.** Each page load creates a fresh V8 heap with new object IDs. Comparing snapshots from different page loads shows everything as "new" — the comparison is meaningless. Always compare within the same session.

**Ignoring "system" and "compiled code" entries.** These represent V8 internal structures and JIT-compiled code. They are not application memory leaks. Focus on application-level constructors (your classes, DOM elements, closures, strings, arrays).

**Using shallow size to prioritize investigation.** A small object (56 bytes shallow) can retain 100MB if it is the sole reference to a large object graph. Always sort by retained size when looking for leaks. Shallow size is only useful for understanding per-object overhead.

**Not forcing GC before taking snapshots.** Without forcing GC, dead objects appear in the snapshot alongside live ones, making analysis confusing. Click the trash can icon (or call `gc()` in Node.js with `--expose-gc`) before each snapshot.

## Source

- Chrome DevTools Memory panel documentation — https://developer.chrome.com/docs/devtools/memory
- V8 blog "Memory Management Reference"
- Node.js `--heap-prof` documentation — https://nodejs.org/api/cli.html#--heap-prof
- "Memory Profiling with Chrome DevTools" (Google Developers)

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
- The 3-snapshot technique is used to verify no memory leaks exist in critical user flows.
- Heap analysis is performed with retained size as the primary metric.
