# Memory Leaks

> Identify, diagnose, and prevent the 5 classic memory leak patterns in JavaScript — detached DOM trees, forgotten event listeners, closures over large scopes, forgotten timers, and global variable accumulation — using WeakRef, WeakMap, and systematic heap analysis.

## When to Use

- Browser memory usage grows continuously during a user session without stabilizing
- A Single Page Application becomes sluggish after extended use (30+ minutes)
- Chrome Task Manager shows increasing "JavaScript Memory" for a tab over time
- The 3-snapshot technique in DevTools shows growing retained object counts between snapshots
- Node.js process RSS grows under sustained load without load increase
- Components are mounted and unmounted but their memory footprint persists
- Event listeners accumulate on elements that are removed from the DOM
- `setInterval` or `setTimeout` callbacks reference objects that should have been garbage collected
- Module-scope Maps or Sets grow unboundedly without eviction
- You need to implement a cache with automatic memory management using WeakRef or WeakMap

## Instructions

1. **Identify the 5 classic leak patterns:**

   **Pattern 1: Detached DOM trees.** DOM nodes removed from the document but still referenced by JavaScript variables or closures:

   ```javascript
   // LEAK — detachedNode is removed from DOM but still referenced
   let detachedNode;
   button.addEventListener('click', () => {
     detachedNode = document.querySelector('.modal');
     detachedNode.remove(); // removed from DOM, still in memory
   });

   // FIX — nullify the reference after removal
   button.addEventListener('click', () => {
     const modal = document.querySelector('.modal');
     modal.remove();
     // modal goes out of scope, GC can collect the entire detached tree
   });
   ```

   **Pattern 2: Forgotten event listeners.** Listeners added without corresponding removal:

   ```javascript
   // LEAK — new listener added on every render, old ones never removed
   function setupComponent(element) {
     window.addEventListener('resize', () => handleResize(element));
   }

   // FIX — store reference, remove on cleanup
   function setupComponent(element) {
     const handler = () => handleResize(element);
     window.addEventListener('resize', handler);
     return () => window.removeEventListener('resize', handler);
   }
   ```

   **Pattern 3: Closures over large scopes.** A closure captures the entire scope, not just the variables it uses:

   ```javascript
   // LEAK — closure captures `largeData` even though it only uses `id`
   function createHandler(largeData) {
     const id = largeData.id;
     return () => console.log(id);
     // `largeData` is captured by the closure scope but never used
   }

   // FIX — extract needed values before creating closure
   function createHandler(largeData) {
     const id = largeData.id;
     largeData = null; // release reference
     return () => console.log(id);
   }
   ```

   **Pattern 4: Forgotten timers.** `setInterval` callbacks keep references alive:

   ```javascript
   // LEAK — interval runs forever, holds reference to component
   function startPolling(component) {
     setInterval(() => {
       component.update(fetchData());
     }, 5000);
   }

   // FIX — store interval ID and clear on cleanup
   function startPolling(component) {
     const intervalId = setInterval(() => {
       component.update(fetchData());
     }, 5000);
     return () => clearInterval(intervalId);
   }
   ```

   **Pattern 5: Global variable accumulation.** Module-scope collections that grow without eviction:

   ```javascript
   // LEAK — grows forever, never evicted
   const cache = new Map();
   function getUser(id) {
     if (!cache.has(id)) {
       cache.set(id, fetchUser(id));
     }
     return cache.get(id);
   }

   // FIX — use LRU cache with max size
   const cache = new LRUCache({ max: 1000, ttl: 300000 });
   ```

2. **Use the 3-snapshot technique to detect leaks:**
   1. Take Heap Snapshot 1 (baseline after initial load)
   2. Perform the suspected leaking action (navigate, open/close dialog, etc.)
   3. Take Heap Snapshot 2
   4. Perform the same action again
   5. Take Heap Snapshot 3
   6. In Snapshot 3, use "Comparison" view against Snapshot 2
   7. Look for objects allocated between Snapshot 2 and 3 that were not collected — these are leaking

3. **Use `WeakRef` for caches that should not prevent GC:**

   ```javascript
   const cache = new Map();
   function getCachedResult(key, compute) {
     const ref = cache.get(key);
     if (ref) {
       const value = ref.deref();
       if (value !== undefined) return value;
     }
     const result = compute();
     cache.set(key, new WeakRef(result));
     return result;
   }
   ```

4. **Use `WeakMap` for metadata attached to objects:**

   ```javascript
   // GOOD — entries are automatically removed when the key object is GC'd
   const metadata = new WeakMap();
   function annotate(element, data) {
     metadata.set(element, data); // when element is GC'd, this entry disappears
   }
   ```

5. **Use `FinalizationRegistry` for cleanup callbacks:**

   ```javascript
   const registry = new FinalizationRegistry((heldValue) => {
     console.log(`Object with id ${heldValue} was garbage collected`);
     externalResourceCleanup(heldValue);
   });

   function trackObject(obj) {
     registry.register(obj, obj.id);
   }
   ```

## Details

### Worked Example: Gmail Detached DOM Leak Detection

Gmail's engineering team implemented automated heap snapshot diffing in CI. After each SPA navigation test (inbox to compose to sent to inbox), a heap snapshot comparison checked for detached DOM node count increases greater than 10.

One test caught a leak: removed email row elements retained 50MB of DOM nodes because click handlers in the rows captured a closure referencing the row's parent container. When the email list was replaced during navigation, the old rows were removed from the DOM but the closures kept them alive.

Fix: used event delegation on the email list container instead of per-row click handlers. The container is stable across navigations, and individual row elements are properly GC'd when removed.

### Worked Example: Node.js Module-Level Map Leak

A Node.js microservice leaked 100MB/hour. The `request-cache.ts` module had a module-level `Map<string, Response>` that cached API responses. The cache key was the request URL with query parameters. With thousands of unique URLs per hour and no eviction policy, the Map grew unboundedly.

Fix: replaced the bare `Map` with an LRU cache (1,000 entry max, 5-minute TTL). Memory usage stabilized at 15MB regardless of traffic volume.

### How to Read Retaining Paths

In DevTools Heap Snapshot, the "Retaining path" shows the chain from a GC root to the object keeping it alive:

```
Window -> listeners -> Array -> EventListener -> closure -> element (detached)
```

Read bottom-up: the `element` is kept alive by a `closure`, which is kept alive by an `EventListener` in an `Array` of listeners attached to the `Window` object. The fix is to remove the EventListener.

### Anti-Patterns

**Storing DOM references in global variables or module-scope Maps.** Every DOM reference in a global scope prevents GC of the entire detached subtree. One reference to a `<tr>` keeps the entire `<table>` alive if they are in the same detached tree.

**`addEventListener` without corresponding `removeEventListener` on component unmount.** Each re-render or re-mount that adds a listener without removing the old one creates a new listener closure that keeps the old component data alive. In React, always return cleanup functions from `useEffect`.

**Closures that capture the entire scope when only one variable is needed.** V8's closure scope capture is per-context, not per-variable. If a function creates two closures, and one references variable A and the other references variable B, both closures capture both variables (in the same scope context).

**`setInterval` without cleanup in SPA route changes.** An interval started on route A continues running after navigating to route B. The interval callback references route A's component data, preventing GC of the entire component tree.

**Using `Map` for caches without eviction policy.** A `Map` with no maximum size or TTL is an unbounded memory accumulator. Always use `WeakMap` (if keys are objects), LRU caches, or TTL-based eviction.

## Source

- Chrome DevTools Memory documentation — https://developer.chrome.com/docs/devtools/memory
- "Fixing Memory Leaks in Web Applications" (Google Engineering Blog)
- Nolan Lawson, "Are your event listeners leaking?" — https://nolanlawson.com/2020/02/19/fixing-memory-leaks-in-web-applications/
- MDN WeakRef documentation — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef

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
- The 3-snapshot technique confirms no memory growth during repeated user actions.
- All event listeners, intervals, and subscriptions have corresponding cleanup code.
